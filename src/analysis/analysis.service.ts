import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  async analyzeFeedback(feedbackId: string): Promise<void> {
    this.logger.log(`Analysis not yet implemented for feedback ${feedbackId}`);
  }
}
