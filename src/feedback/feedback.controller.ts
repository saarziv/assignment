import { Controller, Post, Get, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FeedbackService } from './feedback.service';
import { Feedback } from './feedback.entity';
import { SubmitFeedbackDto } from './submit-feedback.dto';

@ApiTags('Feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @ApiOperation({ summary: 'Submit feedback for AI analysis' })
  @ApiResponse({ status: 201, description: 'Feedback submitted, analysis started asynchronously' })
  @ApiResponse({ status: 400, description: 'Validation error (empty or too long content)' })
  async submit(@Body() dto: SubmitFeedbackDto): Promise<Feedback> {
    return this.feedbackService.submitFeedback(dto.content);
  }

  @Get()
  @ApiOperation({ summary: 'List all feedback with analysis results' })
  @ApiResponse({ status: 200, description: 'Returns all feedback items with status and analysis' })
  async list(): Promise<Feedback[]> {
    return this.feedbackService.listFeedback();
  }
}
