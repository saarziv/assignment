import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feedback } from '../feedback/feedback.entity';
import { AnalysisService } from './analysis.service';
import { GeminiService } from './gemini.service';

@Module({
  imports: [TypeOrmModule.forFeature([Feedback])],
  providers: [AnalysisService, GeminiService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
