# MVP Release Checklist

## P0

- [ ] `.env.example` contains no real secrets.
- [ ] `apps/api/.dev.vars.example` contains no real secrets.
- [ ] Any exposed embedding or model key has been rotated.
- [ ] `pnpm memory:eval` passes with zero deterministic failures.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.

## End-to-End Smoke Test

- [ ] Register a new user.
- [ ] Log in.
- [ ] Create one companion.
- [ ] Open `/chat`.
- [ ] Send 5 messages and verify one continuous conversation is reused.
- [ ] Refresh `/chat` and verify history is restored.
- [ ] Say `我不喜欢吃辣`.
- [ ] Wait for memory extraction.
- [ ] Confirm pending memory in `/memories` if needed.
- [ ] Ask `晚上吃什么？` and verify the reply naturally avoids spicy food.
- [ ] Submit `记错了` feedback on an assistant message.
- [ ] Verify the memory management entry appears.
- [ ] Edit or delete the incorrect memory.

## 20-Round Stability Test

For each round, record:

```text
round number
conversation_id
trace_id
HTTP status
user message saved
assistant message saved
memory extraction error, if any
```

Release requires:

- [ ] 20 rounds complete without a page crash.
- [ ] No unexpected conversation split.
- [ ] No lost user message.
- [ ] No lost assistant message.
- [ ] Memory extraction failure, if present, does not fail the chat response.

## Resource Isolation

- [ ] Unauthenticated users cannot call protected endpoints.
- [ ] User A cannot read User B companion.
- [ ] User A cannot read User B conversations or messages.
- [ ] User A cannot read, edit, confirm, reject, or delete User B memories.
