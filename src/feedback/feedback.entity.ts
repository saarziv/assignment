import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
