# Claude CAPA Operating Notes

This is the expanded note for Claude Code. The root `CLAUDE.md` is the short contract.

## Intent

CAPA exists to stop agents from drifting, over-editing, auto-fixing unrelated bugs, and wasting context by rereading many Markdown files.

## When asked to continue

When the user says any of these:

- `/capa vamos con lo que sigue`
- `siguiente paso natural`
- `continua`
- `vamos con eso`

Use CAPA runtime:

```bash
node bin/capa.js estado
node bin/capa.js siguiente
```

Then do exactly one returned state.

## State behavior

- NEW/DISCOVERY: inspect and gather evidence only.
- PLAN: define minimal approach, no edits.
- SCOPE: add allowed paths.
- IMPLEMENT: edit only allowed paths. Run `node bin/capa.js guard edit --file <path>` before touching a file; if the guard blocks, stop.
- TEST: run or register tests.
- CODE_REVIEW: review current diff only.
- DONE: close PBI if gates pass.

## Lateral findings

Do not fix unrelated bugs inside the current PBI. Register each lateral finding and keep going:

```bash
node bin/capa.js finding add "<title>" --description "<details>" --outside --action new-pbi
```

## Token discipline

Prefer CAPA commands over rereading all docs.

Do not load README/HANDOFF/CONTEXT/CLAUDE unless needed for the exact state.

Use short summaries and stop after the transition.
