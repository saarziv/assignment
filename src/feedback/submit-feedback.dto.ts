import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class SubmitFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
