# Feedback Analysis Service

A backend service that accepts user feedback and reliably extracts structured insights using an LLM (Gemini 2.5 Flash).

Built with NestJS, TypeScript, SQLite (TypeORM), and Zod.

## Setup

```bash
npm install
cp .env.example .env  # or create .env with GEMINI_API_KEY
```

## Running

```bash
npm run dev          # development (watch mode)
npm run build        # compile
npm run start:prod   # production
```

## Testing

```bash
npm test             # unit tests (7 tests)
```

To test E2E with mock LLM (no API calls):
```bash
USE_MOCK_LLM=true npm run dev
# POST http://localhost:3000/feedback  { "content": "Love the app!" }
# GET  http://localhost:3000/feedback
```

## Architecture

```
src/
├── feedback/       # Submission & retrieval (controller, service, entity, DTO)
├── analysis/       # Async AI pipeline (event-driven, Gemini client, Zod validation)
└── app.module.ts   # Root module
```

**Flow:** `POST /feedback` → persists with status `RECEIVED` → emits event → `AnalysisService` picks it up asynchronously → calls Gemini → validates JSON with Zod → `DONE` or `FAILED`

**Retry logic:** HTTP/network errors trigger exponential backoff via `setTimeout` + event re-emit (non-blocking). Validation failures and safety blocks fail immediately — no retry.

**Rate limiter:** Sliding window (5 RPM) in `GeminiService`. When throttled, the request is re-emitted after the cooldown — same pattern as retries, no blocking.

---

## Guardrail

I picked **rate-limiting AI analysis** as the primary guardrail, with a secondary input length cap.

The Gemini free tier allows only 5 RPM, so rate limiting felt like the most practical choice — without it, a burst of feedback submissions would immediately hit 429 errors and waste retry attempts. The rate limiter uses a sliding window that tracks call timestamps and defers excess requests non-blockingly (same `setTimeout` + re-emit pattern used for retries).

I also capped feedback content at 2000 characters (~300 words). That's plenty for real user feedback while keeping token costs predictable and reducing the surface area for prompt injection.

---

## AI Collaboration Log

**Tools used:** Claude Code (terminal), Gemini API (for analysis)

### Example Prompts

1. *"You plan to sleep for the exponential backoff? That blocks the event loop. Use setTimeout with event re-emitting instead."*
   The AI initially wrote `await sleep(delayMs)` for retry backoff, which would hold up the entire handler. I pushed for a non-blocking approach — schedule a `setTimeout` that re-emits the `feedback.created` event with an incremented attempt count. Same retry behavior, zero blocking.

2. *"The retry count shouldn't be in the database. If the server restarts, that count resets anyway, pass it through the event payload instead."*
   The AI wanted to persist `retryCount` as a column in the Analysis table. I pointed out this gives a false sense of durability — the in-memory event queue doesn't survive restarts, so the count is inherently transient. We moved it into the event payload instead, which is simpler and more honest about what it guarantees.

### Concrete Example: Correcting the AI

The AI proposed separating system instructions from user content (`systemInstruction` field in the Gemini API) as a prompt injection defense. When I asked whether this actually prevents injection, the honest answer was no — a determined user can still craft input that influences the model's output. The real defense was already in place: Zod schema validation on the output side, which rejects anything that doesn't match the expected structure regardless of what the model returns. We kept the `systemInstruction` split as a minor improvement, but I made sure we weren't treating it as a security boundary.

### What I Would Improve With More Time

- **Persistent job queue:** Replace `EventEmitter` + `setTimeout` with BullMQ/Redis. Right now, if the server restarts mid-analysis, in-flight work and scheduled retries are lost silently.
- **Idempotency guard:** `getOrCreateAnalysis` partially handles duplicate events, but there's no lock preventing two concurrent handlers from racing on the same feedbackId. A simple advisory lock or unique constraint would fix this.
- **Observability:** Structured logging with correlation IDs across the pipeline, and metrics for Gemini latency, failure rates by type, and throttle frequency.
