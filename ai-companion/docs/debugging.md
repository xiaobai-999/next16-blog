# Debugging

## Trace ID

Every chat response exposes:

```text
X-Trace-Id
X-Conversation-Id
```

Use the trace id to connect a user-visible failure to model logs.

## Local Debug Routes

Debug routes require login and are only available from localhost.

```text
GET /debug/model-logs?limit=50
GET /debug/model-logs/:traceId
GET /debug/metrics?hours=24
```

## What To Check

For chat failures:

- HTTP status.
- `trace_id`.
- model log `status`.
- model log `error_code`.
- model log `latency_ms`.
- whether user message was saved.
- whether assistant message was saved.

For memory failures:

- whether extraction returned candidates.
- whether policy skipped candidates.
- whether memory status is `active` or `pending_confirmation`.
- whether expired, deleted, archived, or pending memories are filtered.
- whether semantic retrieval fell back to fixed ordering.

For embedding failures:

- `EMBEDDING_API_KEY` is configured.
- `EMBEDDING_BASE_URL` is reachable.
- `EMBEDDING_MODEL` dimensions match Vectorize index dimensions.
- D1 fallback still allows chat to continue.
