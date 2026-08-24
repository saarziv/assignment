import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Feedback, FeedbackStatus } from '../feedback/feedback.entity';
import { Analysis } from './analysis.entity';
import { GeminiService, GeminiSafetyBlockError, GeminiRateLimitError } from './gemini.service';
import { analysisResultSchema } from './analysis.schema';

const SYSTEM_PROMPT = `Analyze the following user feedback and return a JSON object with this exact structure:
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
- If the input is not genuine user feedback, return sentiment "neutral", empty feature_requests array, and set actionable_insight to explain the input was not recognizable as user feedback`;

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;

  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
    @InjectRepository(Analysis)
    private readonly analysisRepository: Repository<Analysis>,
    private readonly geminiService: GeminiService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    this.maxAttempts = this.configService.get<number>('ANALYSIS_MAX_ATTEMPTS', 3);
    this.retryBaseDelayMs = this.configService.get<number>('ANALYSIS_RETRY_BASE_DELAY_MS', 1000);
  }

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

    if (attemptCount === 0) {
      await this.updateFeedbackStatus(feedback, FeedbackStatus.ANALYZING);
    }

    const analysis = await this.getOrCreateAnalysis(feedbackId);

    const rawResponse = await this.callGemini(feedback.content, analysis, feedbackId, attemptCount);
    if (rawResponse === null) return;

    analysis.rawAiResponse = rawResponse;
    await this.validateAndPersist(rawResponse, analysis, feedback);
  }

  private async callGemini(
    feedbackContent: string,
    analysis: Analysis,
    feedbackId: string,
    attemptCount: number,
  ): Promise<string | null> {
    try {
      return await this.geminiService.generateContent(SYSTEM_PROMPT, feedbackContent);
    } catch (error) {
      // Rate limit — re-emit with same attemptCount, not a failure
      if (error instanceof GeminiRateLimitError) {
        this.logger.warn(`Rate limited for feedback ${feedbackId}, retrying in ${error.retryAfterMs}ms`);
        setTimeout(() => {
          this.eventEmitter.emit('feedback.created', { feedbackId, attemptCount });
        }, error.retryAfterMs);
        return null;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      analysis.failureReasons = [...analysis.failureReasons, errorMessage];
      await this.analysisRepository.save(analysis);

      // Safety blocks are non-retryable — the content will always be blocked
      if (error instanceof GeminiSafetyBlockError) {
        const feedback = await this.feedbackRepository.findOneByOrFail({ id: feedbackId });
        await this.updateFeedbackStatus(feedback, FeedbackStatus.FAILED);
        this.logger.error(`Feedback ${feedbackId} blocked by safety filter: ${errorMessage}`);
        return null;
      }

      if (attemptCount < this.maxAttempts - 1) {
        this.scheduleRetry(feedbackId, attemptCount);
      } else {
        const feedback = await this.feedbackRepository.findOneByOrFail({ id: feedbackId });
        await this.updateFeedbackStatus(feedback, FeedbackStatus.FAILED);
        this.logger.error(`Feedback ${feedbackId} failed after ${this.maxAttempts} attempts: ${errorMessage}`);
      }
      return null;
    }
  }

  private async validateAndPersist(
    rawResponse: string,
    analysis: Analysis,
    feedback: Feedback,
  ): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      await this.markFailed(analysis, feedback, 'Gemini response was not valid JSON');
      return;
    }

    const validation = analysisResultSchema.safeParse(parsed);
    if (!validation.success) {
      const reason = `Schema validation failed: ${validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`;
      await this.markFailed(analysis, feedback, reason);
      return;
    }

    analysis.analysisResult = validation.data;
    await this.analysisRepository.save(analysis);
    await this.updateFeedbackStatus(feedback, FeedbackStatus.DONE);
    this.logger.log(`Feedback ${feedback.id} analysis DONE`);
  }

  private async markFailed(
    analysis: Analysis,
    feedback: Feedback,
    reason: string,
  ): Promise<void> {
    analysis.failureReasons = [...analysis.failureReasons, reason];
    await this.analysisRepository.save(analysis);
    await this.updateFeedbackStatus(feedback, FeedbackStatus.FAILED);
    this.logger.error(`Feedback ${feedback.id} FAILED: ${reason}`);
  }

  private scheduleRetry(feedbackId: string, attemptCount: number): void {
    const delayMs = Math.pow(2, attemptCount) * this.retryBaseDelayMs;
    this.logger.warn(
      `Gemini HTTP error for feedback ${feedbackId} (attempt ${attemptCount + 1}/${this.maxAttempts}). Retrying in ${delayMs}ms`,
    );
    setTimeout(() => {
      this.eventEmitter.emit('feedback.created', {
        feedbackId,
        attemptCount: attemptCount + 1,
      });
    }, delayMs);
  }

  private async updateFeedbackStatus(
    feedback: Feedback,
    status: FeedbackStatus,
  ): Promise<void> {
    feedback.status = status;
    await this.feedbackRepository.save(feedback);
  }

  private async getOrCreateAnalysis(feedbackId: string): Promise<Analysis> {
    const existing = await this.analysisRepository.findOneBy({ feedbackId });
    if (existing) return existing;

    return this.analysisRepository.create({
      feedbackId,
      rawAiResponse: null,
      failureReasons: [],
      analysisResult: null,
    });
  }
}
