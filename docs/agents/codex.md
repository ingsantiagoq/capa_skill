# Codex CAPA Adapter

Use this file as the short operational contract for Codex-style agents.
It is one surface-specific view of the same CAPA runtime contract used across LLM-operated workflows.

## Source of truth

CAPA runtime is authoritative:

```bash
node bin/capa.js estado
node bin/capa.js siguiente
```

Do not reconstruct workflow state from Markdown or previous conversation context.
Do not assume Codex is the only supported surface.

## Required behavior

1. Read current CAPA state.
2. Run only one `siguiente` transition.
3. Work only on that transition.
4. Respect scope and guard.
5. Register evidence/test/review/finding as needed.
6. Stop after the transition.

## Editing rules

Before changing a file during IMPLEMENT:

```bash
node bin/capa.js guard edit --file <path>
```

If the guard blocks, stop.

Do not edit outside approved scope. Add scope only when the state is SCOPE or when explicitly instructed by the user.

## Findings

If you discover something outside the current PBI, do not fix it. Register it:

```bash
node bin/capa.js finding add "<title>" --description "<details>" --outside --action new-pbi
```

## Close rules

Do not close a PBI unless CAPA has:

- evidence;
- TEST ok;
- CODE_REVIEW ok;
- no unresolved outside finding.

Close with:

```bash
node bin/capa.js cerrar pbi --summary "<summary>"
```
