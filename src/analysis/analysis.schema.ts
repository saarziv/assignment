import { z } from 'zod';

export const analysisResultSchema = z.object({
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  feature_requests: z.array(
    z.object({
      title: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  actionable_insight: z.string(),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
