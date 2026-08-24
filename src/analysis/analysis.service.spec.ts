import { AnalysisService } from './analysis.service';
import { GeminiService } from './gemini.service';
import { Feedback, FeedbackStatus } from '../feedback/feedback.entity';

const VALID_RESPONSE = JSON.stringify({
  sentiment: 'positive',
  feature_requests: [{ title: 'Dark mode', confidence: 0.9 }],
  actionable_insight: 'User loves the product but wants dark mode',
});

const INVALID_SCHEMA_RESPONSE = JSON.stringify({
  sentiment: 'happy', // invalid enum value
  feature_requests: [],
  actionable_insight: 'test',
});

describe('AnalysisService', () => {
  let service: AnalysisService;
  let mockGeminiService: { generateContent: jest.Mock };
  let mockFeedback: Feedback;
  let mockFeedbackRepo: {
    findOneBy: jest.Mock;
    findOneByOrFail: jest.Mock;
    save: jest.Mock;
  };
  let mockAnalysisRepo: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let mockEventEmitter: { emit: jest.Mock };
  let mockConfigService: { get: jest.Mock };
  let savedAnalysis: { rawAiResponse: string | null; failureReasons: string[]; analysisResult: unknown };
  let feedbackStatusHistory: FeedbackStatus[];

  beforeEach(() => {
    jest.useFakeTimers();

    savedAnalysis = { rawAiResponse: null, failureReasons: [], analysisResult: null };
    feedbackStatusHistory = [];

    mockFeedback = { id: 'fb-1', content: 'Great app!', status: FeedbackStatus.RECEIVED } as Feedback;

    mockGeminiService = { generateContent: jest.fn() };
    mockFeedbackRepo = {
      findOneBy: jest.fn().mockResolvedValue(mockFeedback),
      findOneByOrFail: jest.fn().mockResolvedValue(mockFeedback),
      save: jest.fn().mockImplementation((feedback: Feedback) => {
        feedbackStatusHistory.push(feedback.status);
        return Promise.resolve(feedback);
      }),
    };
    mockAnalysisRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => {
        Object.assign(savedAnalysis, data);
        return savedAnalysis;
      }),
      save: jest.fn().mockImplementation((analysis) => {
        Object.assign(savedAnalysis, analysis);
        return Promise.resolve(savedAnalysis);
      }),
    };
    mockEventEmitter = { emit: jest.fn() };
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue: number) => defaultValue),
    };

    service = new AnalysisService(
      mockFeedbackRepo as never,
      mockAnalysisRepo as never,
      mockGeminiService as never,
      mockEventEmitter as never,
      mockConfigService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should persist analysis and set status DONE on valid response', async () => {
    mockGeminiService.generateContent.mockResolvedValue(VALID_RESPONSE);

    await service.handleFeedbackCreated({ feedbackId: 'fb-1', attemptCount: 0 });

    expect(feedbackStatusHistory).toEqual([FeedbackStatus.ANALYZING, FeedbackStatus.DONE]);
    expect(mockAnalysisRepo.save).toHaveBeenCalled();
    expect(savedAnalysis.rawAiResponse).toBe(VALID_RESPONSE);
    expect(savedAnalysis.analysisResult).toEqual({
      sentiment: 'positive',
      feature_requests: [{ title: 'Dark mode', confidence: 0.9 }],
      actionable_insight: 'User loves the product but wants dark mode',
    });
  });

  it('should fail immediately on invalid JSON without retry', async () => {
    mockGeminiService.generateContent.mockResolvedValue('this is not json');

    await service.handleFeedbackCreated({ feedbackId: 'fb-1', attemptCount: 0 });

    expect(feedbackStatusHistory).toContain(FeedbackStatus.FAILED);
    expect(savedAnalysis.failureReasons).toEqual(
      expect.arrayContaining([expect.stringContaining('not valid JSON')]),
    );
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  it('should fail immediately on wrong schema without retry', async () => {
    mockGeminiService.generateContent.mockResolvedValue(INVALID_SCHEMA_RESPONSE);

    await service.handleFeedbackCreated({ feedbackId: 'fb-1', attemptCount: 0 });

    expect(feedbackStatusHistory).toContain(FeedbackStatus.FAILED);
    expect(savedAnalysis.failureReasons).toEqual(
      expect.arrayContaining([expect.stringContaining('Schema validation failed')]),
    );
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  it('should retry on HTTP errors with exponential backoff and fail after max attempts', async () => {
    mockGeminiService.generateContent.mockRejectedValue(new Error('Gemini API error (500)'));

    // Attempt 0
    await service.handleFeedbackCreated({ feedbackId: 'fb-1', attemptCount: 0 });
    expect(savedAnalysis.failureReasons).toHaveLength(1);
    expect(feedbackStatusHistory).not.toContain(FeedbackStatus.FAILED);

    // setTimeout scheduled — advance timer
    jest.advanceTimersByTime(1000);
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('feedback.created', {
      feedbackId: 'fb-1',
      attemptCount: 1,
    });

    // Attempt 1
    mockAnalysisRepo.findOneBy.mockResolvedValue(savedAnalysis);
    await service.handleFeedbackCreated({ feedbackId: 'fb-1', attemptCount: 1 });
    expect(savedAnalysis.failureReasons).toHaveLength(2);

    jest.advanceTimersByTime(2000);
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('feedback.created', {
      feedbackId: 'fb-1',
      attemptCount: 2,
    });

    // Attempt 2 — max reached
    await service.handleFeedbackCreated({ feedbackId: 'fb-1', attemptCount: 2 });
    expect(savedAnalysis.failureReasons).toHaveLength(3);
    expect(feedbackStatusHistory).toContain(FeedbackStatus.FAILED);
  });

  it('should recover on retry after HTTP error', async () => {
    mockGeminiService.generateContent
      .mockRejectedValueOnce(new Error('Gemini API error (503)'))
      .mockResolvedValueOnce(VALID_RESPONSE);

    // Attempt 0 — fails
    await service.handleFeedbackCreated({ feedbackId: 'fb-1', attemptCount: 0 });
    expect(savedAnalysis.failureReasons).toHaveLength(1);

    jest.advanceTimersByTime(1000);
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('feedback.created', {
      feedbackId: 'fb-1',
      attemptCount: 1,
    });

    // Attempt 1 — succeeds
    mockAnalysisRepo.findOneBy.mockResolvedValue(savedAnalysis);
    await service.handleFeedbackCreated({ feedbackId: 'fb-1', attemptCount: 1 });

    expect(savedAnalysis.analysisResult).toBeTruthy();
    expect(savedAnalysis.rawAiResponse).toBe(VALID_RESPONSE);
    expect(savedAnalysis.failureReasons).toHaveLength(1);
    expect(feedbackStatusHistory).toContain(FeedbackStatus.DONE);
  });
});
