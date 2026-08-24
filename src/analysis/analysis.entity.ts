import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Feedback } from '../feedback/feedback.entity';

@Entity()
export class Analysis {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => Feedback)
  @JoinColumn()
  feedback!: Feedback;

  @Column({ type: 'text' })
  feedbackId!: string;

  // Raw string responses from each attempt, for debuggability
  @Column({ type: 'simple-json' })
  rawAiResponses!: string[];

  // Validated structured result — null until analysis succeeds
  @Column({ type: 'simple-json', nullable: true })
  analysisResult!: {
    sentiment: 'positive' | 'neutral' | 'negative';
    feature_requests: { title: string; confidence: number }[];
    actionable_insight: string;
  } | null;

  // Errors from each failed attempt — empty on success
  @Column({ type: 'simple-json' })
  failureReasons!: string[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
