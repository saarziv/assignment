import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
}

export class GeminiSafetyBlockError extends Error {
  constructor(finishReason: string) {
    super(`Gemini blocked the request (finishReason: ${finishReason})`);
    this.name = 'GeminiSafetyBlockError';
  }
}

export class GeminiRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Gemini rate limit reached, retry after ${retryAfterMs}ms`);
    this.name = 'GeminiRateLimitError';
  }
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly useMock: boolean;
  private readonly maxRequestsPerMinute: number;
  private readonly rateLimitWindowMs = 60_000;
  private callTimestamps: number[] = [];
  private mockCallCount = 0;

  constructor(private readonly configService: ConfigService) {
    this.useMock = this.configService.get<string>('USE_MOCK_LLM') === 'true';
    this.maxRequestsPerMinute = this.configService.get<number>('GEMINI_MAX_RPM', 5);

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey && !this.useMock) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.apiKey = apiKey ?? '';
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;
  }

  checkRateLimit(): { throttled: boolean; retryAfterMs: number } {
    const now = Date.now();
    this.callTimestamps = this.callTimestamps.filter((t) => now - t < this.rateLimitWindowMs);

    if (this.callTimestamps.length >= this.maxRequestsPerMinute) {
      const oldestInWindow = this.callTimestamps[0];
      const retryAfterMs = oldestInWindow + this.rateLimitWindowMs - now;
      return { throttled: true, retryAfterMs };
    }

    return { throttled: false, retryAfterMs: 0 };
  }

  async generateContent(systemPrompt: string, userContent: string): Promise<string> {
    if (this.useMock) {
      return this.mockGenerateContent();
    }

    const rateCheck = this.checkRateLimit();
    if (rateCheck.throttled) {
      throw new GeminiRateLimitError(rateCheck.retryAfterMs);
    }

    this.callTimestamps.push(Date.now());

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userContent }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Gemini API error (${response.status}): ${errorBody}`,
      );
    }

    const body = (await response.json()) as GeminiResponse;

    const finishReason = body.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY' || finishReason === 'BLOCKED') {
      throw new GeminiSafetyBlockError(finishReason);
    }

    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    return text;
  }

  private mockGenerateContent(): string {
    this.mockCallCount++;
    this.logger.warn(`[MOCK] Call #${this.mockCallCount}`);

    if (this.mockCallCount <= 2) {
      throw new Error(`Gemini API error (503): Service Unavailable (mock attempt ${this.mockCallCount})`);
    }

    return JSON.stringify({
      sentiment: 'positive',
      feature_requests: [
        { title: 'Dark mode support', confidence: 0.95 },
        { title: 'Faster search', confidence: 0.7 },
      ],
      actionable_insight: 'User is satisfied overall but has clear feature requests worth prioritizing.',
    });
  }
}
