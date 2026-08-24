import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { FeedbackModule } from './feedback/feedback.module';
import { AnalysisModule } from './analysis/analysis.module';
import { Feedback } from './feedback/feedback.entity';
import { Analysis } from './analysis/analysis.entity';

@Module({
  imports: [
    ConfigModule.forRoot(),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'feedback.db',
      entities: [Feedback, Analysis],
      synchronize: true,
    }),
    FeedbackModule,
    AnalysisModule,
  ],
})
export class AppModule {}
