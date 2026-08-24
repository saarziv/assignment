import { Controller, Post, Get, Body } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { Feedback } from './feedback.entity';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  async submit(@Body('content') content: string): Promise<Feedback> {
    return this.feedbackService.submitFeedback(content);
  }

  @Get()
  async list(): Promise<Feedback[]> {
    return this.feedbackService.listFeedback();
  }
}
