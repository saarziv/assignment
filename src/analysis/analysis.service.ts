import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback, FeedbackStatus } from '../feedback/feedback.entity';
import { Analysis } from './analysis.entity';
import { GeminiService } from './gemini.service';
import { analysisResultSchema } from './analysis.schema';

const MAX_ATTEMPTS = 3;

const ANALYSIS_PROMPT = `Analyze the following user feedback and return a JSON object with this exact structure:
{
  "sentiment": "positive" | "neutral" | "negative",
  "feature_requests": [
    { "title": "short description of requested feature", "confidence": 0.0 to 1.0 }
  ],
  "actionable_insight": "one sentence summarizing the key takeaway"
}

Rules:
- sentiment must be exactly one of: "positive", "neutral", "negative"
- feature_requests should be an empty array if no features are requested
- confidence is a number between 0.0 and 1.0
- Return ONLY the JSON object, nothing else

User feedback:
"""
{feedbackContent}
"""`;

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
    @InjectRepository(Analysis)
    private readonly analysisRepository: Repository<Analysis>,
    private readonly geminiService: GeminiService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('feedback.created')
  async handleFeedbackCreated(payload: {
    feedbackId: string;
    attemptCount: number;
  }): Promise<void> {
    const { feedbackId, attemptCount } = payload;

    const feedback = await this.feedbackRepository.findOneBy({ id: feedbackId });
    if (!feedback) {
      this.logger.error(`Feedback ${feedbackId} not found`);
      return;
    }

    // Only update to ANALYZING on the first attempt
    if (attemptCount === 0) {
      await this.feedbackRepository.update(feedbackId, {
        status: FeedbackStatus.ANALYZING,
      });
    }

    // Get or create the Analysis row for this feedback
    let analysis = await this.analysisRepository.findOneBy({ feedbackId });
    if (!analysis) {
      analysis = this.analysisRepository.create({
        feedbackId,
        rawAiResponses: [],
        failureReasons: [],
        analysisResult: null,
      });
    }

    let rawResponse: string;
    try {
      const prompt = ANALYSIS_PROMPT.replace('{feedbackContent}', feedback.content);
      rawResponse = await this.geminiService.generateContent(prompt);
    } catch (error) {
      // HTTP/network error — retry with exponential backoff
      const errorMessage = error instanceof Error ? error.message : String(error);
      analysis.failureReasons = [...analysis.failureReasons, errorMessage];
      await this.analysisRepository.save(analysis);

      if (attemptCount < MAX_ATTEMPTS - 1) {
        const delayMs = Math.pow(2, attemptCount) * 1000;
        this.logger.warn(
          `Gemini HTTP error for feedback ${feedbackId} (attempt ${attemptCount + 1}/${MAX_ATTEMPTS}). Retrying in ${delayMs}ms: ${errorMessage}`,
        );
        setTimeout(() => {
          this.eventEmitter.emit('feedback.created', {
            feedbackId,
            attemptCount: attemptCount + 1,
          });
        }, delayMs);
      } else {
        this.logger.error(
          `Feedback ${feedbackId} failed after ${MAX_ATTEMPTS} attempts: ${errorMessage}`,
        );
        await this.feedbackRepository.update(feedbackId, {
          status: FeedbackStatus.FAILED,
        });
      }
      return;
    }

    // Got a response — append raw output and validate
    analysis.rawAiResponses = [...analysis.rawAiResponses, rawResponse];

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      const reason = 'Gemini response was not valid JSON';
      analysis.failureReasons = [...analysis.failureReasons, reason];
      await this.analysisRepository.save(analysis);
      await this.feedbackRepository.update(feedbackId, { status: FeedbackStatus.FAILED });
      this.logger.error(`Feedback ${feedbackId} FAILED: ${reason}`);
      return;
    }

    const validation = analysisResultSchema.safeParse(parsed);
    if (!validation.success) {
      const reason = `Schema validation failed: ${validation.error.message}`;
      analysis.failureReasons = [...analysis.failureReasons, reason];
      await this.analysisRepository.save(analysis);
      await this.feedbackRepository.update(feedbackId, { status: FeedbackStatus.FAILED });
      this.logger.error(`Feedback ${feedbackId} FAILED: ${reason}`);
      return;
    }

    // Success
    analysis.analysisResult = validation.data;
    await this.analysisRepository.save(analysis);
    await this.feedbackRepository.update(feedbackId, { status: FeedbackStatus.DONE });
    this.logger.log(`Feedback ${feedbackId} analysis DONE`);
  }
}
