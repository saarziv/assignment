import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedbackModule } from './feedback/feedback.module';
import { AnalysisModule } from './analysis/analysis.module';
import { Feedback } from './feedback/feedback.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'feedback.db',
      entities: [Feedback],
      synchronize: true,
    }),
    FeedbackModule,
    AnalysisModule,
  ],
})
export class AppModule {}
