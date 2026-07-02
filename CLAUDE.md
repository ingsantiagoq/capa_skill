# Claude Code CAPA Adapter

When the user invokes `/capa`, use CAPA runtime first. Do not read every Markdown file to reconstruct state.
This is the Claude-facing adapter of a broader CAPA contract that should remain consistent across LLM-operated surfaces.

## Default flow

For `/capa vamos con lo que sigue`:

```bash
node bin/capa.js estado
node bin/capa.js siguiente
```

Do exactly one returned state. Then stop.

## Non-negotiable rules

- CAPA DB/runtime is the source of truth.
- Do not infer active work from README, HANDOFF, CONTEXT or chat history.
- Do not edit before CAPA reaches IMPLEMENT.
- Do not edit files outside `capa scope list`.
- Do not fix lateral findings in the same PBI.
- Register lateral findings with `finding add --outside --action new-pbi`.
- Register evidence for factual claims.
- Register tests before closing.
- Register code review before closing.
- If guard blocks, stop and report the blocker.

## Tool behavior

Before Edit, Write or MultiEdit, CAPA Guard should be respected:

```bash
node bin/capa.js guard edit --file <path>
```

If blocked, do not continue editing.

## One-step discipline

A CAPA step is not a sprint. It is one transition only.

Valid cycle:

```bash
node bin/capa.js siguiente
# perform only that state
node bin/capa.js evidence add "<claim>" --classification VERIFIED --type command --command "<command>" --result "<result>"
node bin/capa.js completar --status ok --summary "<short result>"
```

Then stop and wait for the user.
