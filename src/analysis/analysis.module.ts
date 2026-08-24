import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feedback } from '../feedback/feedback.entity';
import { Analysis } from './analysis.entity';
import { AnalysisService } from './analysis.service';
import { GeminiService } from './gemini.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Feedback, Analysis])],
  providers: [GeminiService, AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
