import { Controller, Post, Get, Body } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { Feedback } from './feedback.entity';
import { SubmitFeedbackDto } from './submit-feedback.dto';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  async submit(@Body() dto: SubmitFeedbackDto): Promise<Feedback> {
    return this.feedbackService.submitFeedback(dto.content);
  }

  @Get()
  async list(): Promise<Feedback[]> {
    return this.feedbackService.listFeedback();
  }
}
