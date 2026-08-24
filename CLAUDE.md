# Assignment - Development Rules

## What we're building
small backend-driven application from scratch that accepts user feedback and
reliably extracts structured insights using an LLM,


## Requirements

1. Feedback Submission
- Users can submit free-text feedback.
- Feedback must be persisted to a database (SQLite or Postgres is fine).
Each feedback item must include:
- id
- content
- status (RECEIVED | ANALYZING | DONE | FAILED)
- created_at
- updated_at
2. Asynchronous AI Analysis (Mandatory)
- Submitting feedback must not block on AI analysis.
- Analysis runs asynchronously (a simple in-process queue is acceptable).
State flow:
RECEIVED → ANALYZING → DONE | FAILED
Failures must be explicitly represented and retriable
3. Structured AI Output (Mandatory)
The AI must return strict JSON matching the following schema:
{
"sentiment": "positive | neutral | negative",
"feature_requests": [
{ "title": "string", "confidence": 0.0 }
],
"actionable_insight": "string"
}
Requirements:
- Validate the AI output against the schema.
- If the output is invalid, mark the analysis as FAILED.
- Persist:
- The raw AI response
- The validated structured result

4. Guardrail (Pick ONE)
Implement one of the following and explain your choice:
- Deduplicate identical feedback (hash-based)
- Rate-limit AI analysis
- Cache analysis results
- Token-length truncation strategy
5. Read API
Expose an endpoint to:
- List submitted feedback
- Include status and analysis result (if available)
Pagination and filtering are optional

## Emphasis in the project
- Engineering judgment and robustness
- Clear state management
- Defensive handling of AI output
- Sensible structure and naming

## Not important: 
- UI polish
- Authentication
- Deployment
- Perfect test coverage

## Architecture

### Module Structure
```
src/
├── feedback/           # Feedback submission & retrieval (controller, service, entity)
├── analysis/           # Async AI analysis pipeline (queue, AI client, validation)
├── guardrail/          # Guardrail logic (chosen: TBD)
└── app.module.ts       # Root module wiring
```

### Infrastructure
- SQLite via TypeORM (simple, no external DB setup needed)
- In-process queue for async analysis (e.g. BullMQ with in-memory or simple EventEmitter-based)

### Progress
- [x] Project scaffolding (NestJS + TypeScript + SQLite + TypeORM setup)
- [x] Feedback submission endpoint (POST /feedback) — stub
- [x] Feedback entity & persistence
- [ ] Async analysis queue (RECEIVED → ANALYZING → DONE | FAILED)
- [ ] AI integration with structured JSON output & validation
- [ ] Guardrail implementation (pick one)
- [x] Read API endpoint (GET /feedback with status & analysis results) — stub
- [ ] Error handling, retries, and edge cases


## Tech Stack
Node.js, TypeScript, NestJS, SQLite.

## Commands
- Test: `npm test`
- Build: `npm run build`
- Dev: `npm run dev`

## Engineering Standards
- TypeScript strict mode (`noImplicitAny: true`), no `any` types
- Keep functions pure and decoupled from global server state

## Prompting
- Freely disagree with user when he is sharing his plan and suggest better alternatives with explanations if you have one.
- Act as a mentor: if the plan is non-ideal, explain why and offer improvements

## Coding Guidelines
- Readability over cleverness — code should explain itself
- Comments explain WHY, not WHAT
- Functions: prefer small and focused, but don't over-fragment
- Naming: descriptive (`examples..`), no generic names (`data`, `result`), camelCase for variables, PascalCase for classes
- Error handling: every async function has try/catch, descriptive error messages
- No `any` — use `unknown` and narrow
- File size: consider splitting above ~300 lines, but only if it improves clarity
- only test code where your logic can be wrong. If the only way the test fails is if Redis/DB/Other 3rd pt itself is broken, it's not worth writing.
