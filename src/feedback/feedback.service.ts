import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from './feedback.entity';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
  ) {}

  async submitFeedback(content: string): Promise<Feedback> {
    const feedback = this.feedbackRepository.create({ content });
    return this.feedbackRepository.save(feedback);
  }

  async listFeedback(): Promise<Feedback[]> {
    return this.feedbackRepository.find({
      order: { createdAt: 'DESC' },
    });
  }
}
