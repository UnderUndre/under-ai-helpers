# Implementation Prompt (One Phase at a Time)

$ARGUMENTS

---

## Execution Rules

If you have questions, doubts, or ideas — ask first. If not, proceed with implementation **one phase at a time** to avoid running out of quota mid-work.

---

## Mandatory Quality Gates

### 1. Observability (CRITICAL — learned from prod debugging hell)

Every branching decision in your code MUST be observable in logs. **Not just the happy path — EVERY branch.**

```typescript
// ❌ BAD: Silent fallback — impossible to debug on prod
if (topicFiltered.length > 0) {
  result = topicFiltered;
} else {
  result = allFragments; // WHY did we end up here? Nobody knows.
}

// ✅ GOOD: Every branch tells a story
if (topicFiltered.length > 0) {
  result = topicFiltered;
  log.info({ topic, count: topicFiltered.length, tags }, "Filtered by topic");
} else {
  result = allFragments;
  log.warn({ topic, totalFrags: allFragments.length, fragTags }, "Topic matched 0 tags — falling back to ALL");
}
```

**Rules:**

- **Decision points**: Log WHAT was chosen, WHY, and what was rejected
- **Input tracing**: Log input data at decision points (keys, raw values, normalized values)
- **Fallback branches**: Use `log.warn` for unexpected fallbacks — they are the most important to see
- **Order-dependent logic**: If code uses `.find()` (takes first match) or `.sort()`, log the ordering/selection explicitly
- **Thresholds & modes**: When using strict/loose matching, log which mode and why

### 2. Testing

- Write tests BEFORE or IMMEDIATELY AFTER the code (TDD-lite)
- Cover: happy path, edge cases, fallback branches
- Run `pnpm test` before and after changes
- Run `npm run validate` (lint + typecheck) after ALL changes

### 3. Code Standards

- Logger: Pino (`log.info({ context }, "message")`) — Object first, message second
- Errors: `AppError`, not `throw new Error()`
- Types: No `as any` — use proper types or `unknown`
- Validation: Zod on all external inputs
- No `console.log` ever

### 4. Anti-Patterns to Avoid

- **Blind scoring**: If code scores/ranks items, log top-N scores with their identifiers — don't just return the winner silently
- **Stale context pollution**: When using accumulated data (chat history, extractedInfo), be aware it contains OLD data. Document what's "current" vs "historical"
- **Order-dependent `.find()`**: If `.find()` returns first match from a sorted array, the sort order IS the business logic — document and log it
- **Silent filter chains**: When filtering arrays through multiple stages, log count at each stage (before/after)

### 5. Deployment Readiness

- TypeScript compiles cleanly (`npm run check`)
- Biome passes (`pnpm lint`)
- Tests pass (`pnpm test`)
- Changes are atomic — one feature/fix per phase
