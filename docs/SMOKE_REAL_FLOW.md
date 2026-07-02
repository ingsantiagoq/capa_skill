# Real CAPA flow smoke

This document describes the reproducible end-to-end CAPA smoke flow used to validate the alpha runtime against its own repository.

The executable version is:

```bash
node test/smoke-real-flow.js
```

## What it proves

The smoke flow proves that CAPA can control a complete PBI lifecycle using the DB-first runtime:

1. Create a PBI.
2. Advance one state at a time with `capa go`.
3. Complete each state before moving forward.
4. Register approved scope.
5. Block out-of-scope edits with `capa-agent-edit-guard`.
6. Allow in-scope edits with `capa-agent-edit-guard`.
7. Register verified evidence.
8. Register an ok smoke test.
9. Register an ok code review.
10. Close the PBI through the close gate.
11. Assert the SQLite records exist for evidence, test, review and closure.

## Why it matters

CAPA was designed to stop theatrical progress from agents. This smoke test makes that claim executable.

The test does not rely on chat history or Markdown state. It creates and validates state through:

```text
.capa/capa.db
```

## Scope used by the smoke

The smoke approves only:

```text
docs
```

Then it verifies that a runtime file is blocked:

```text
lib/runtime/items.js
```

And that the approved documentation path is allowed:

```text
docs/SMOKE_REAL_FLOW.md
```

## Expected result

```text
Real CAPA flow smoke test OK
```

This is the evidence that CAPA is no longer only a design or checklist. It is capable of driving a full controlled workflow over its own repository.
