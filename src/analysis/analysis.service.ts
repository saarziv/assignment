import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback, FeedbackStatus } from '../feedback/feedback.entity';
import { GeminiService } from './gemini.service';

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
    private readonly geminiService: GeminiService,
  ) {}

  @OnEvent('feedback.created')
  async handleFeedbackCreated(payload: { feedbackId: string }): Promise<void> {
    const feedback = await this.feedbackRepository.findOneBy({
      id: payload.feedbackId,
    });

    if (!feedback) {
      this.logger.error(`Feedback ${payload.feedbackId} not found`);
      return;
    }

    try {
      await this.feedbackRepository.update(feedback.id, {
        status: FeedbackStatus.ANALYZING,
      });

      const prompt = ANALYSIS_PROMPT.replace(
        '{feedbackContent}',
        feedback.content,
      );
      const rawResponse = await this.geminiService.generateContent(prompt);

      this.logger.log(
        `Raw Gemini response for feedback ${feedback.id}: ${rawResponse}`,
      );
    } catch (error) {
      this.logger.error(
        `Analysis failed for feedback ${feedback.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
