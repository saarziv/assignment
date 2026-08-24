import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { Analysis } from '../analysis/analysis.entity';

export enum FeedbackStatus {
  RECEIVED = 'RECEIVED',
  ANALYZING = 'ANALYZING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

@Entity()
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'text', default: FeedbackStatus.RECEIVED })
  status!: FeedbackStatus;

  @OneToOne(() => Analysis, (analysis) => analysis.feedback)
  analysis!: Analysis | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
