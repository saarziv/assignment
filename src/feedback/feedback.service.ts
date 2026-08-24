import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { Feedback } from './feedback.entity';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async submitFeedback(content: string): Promise<Feedback> {
    const feedback = this.feedbackRepository.create({ content });
    const savedFeedback = await this.feedbackRepository.save(feedback);
    this.eventEmitter.emit('feedback.created', { feedbackId: savedFeedback.id });
    return savedFeedback;
  }

  async listFeedback(): Promise<Feedback[]> {
    return this.feedbackRepository.find({
      order: { createdAt: 'DESC' },
    });
  }
}
