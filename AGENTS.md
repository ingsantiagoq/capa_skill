# CAPA Agent Adapter

CAPA is the source of truth for this repository.

Use CAPA when the user asks for `/capa`, `vamos con lo que sigue`, `next step`, `continue`, `cerrar PBI`, `cerrar sprint`, or anything that implies agent-controlled coding workflow.

## Hard rules

1. Do not infer workflow state from Markdown.
2. Do not plan from memory when CAPA runtime exists.
3. Use the local runtime through `node bin/capa.js`.
4. Run one CAPA transition at a time.
5. After one transition, stop and report what happened.
6. Never edit outside the approved scope.
7. Never auto-fix a side issue. Register it as a finding.
8. Before closing work, require evidence, test and review.
9. If CAPA blocks, stop. Do not work around the guard.
10. Before any edit/write/delete, run the mandatory edit guard for each target file.

## Mandatory edit guard

Before any tool or action that changes a file, run:

```bash
node bin/capa-agent-edit-guard.js --file <path>
```

Equivalent low-level command:

```bash
node bin/capa.js guard edit --file <path>
```

If either command returns `CAPA BLOCK`, do not edit. Stop and report the blocker.

This requirement applies to Edit, Write, MultiEdit, delete, generated-file writes and automated fixes. It also applies when the change seems small.

## `/capa vamos con lo que sigue`

Run:

```bash
node bin/capa.js estado
node bin/capa.js siguiente
```

Then execute only the state returned by `siguiente`.

Allowed behavior:

- DISCOVERY: inspect only; register evidence if useful.
- PLAN: define a tiny implementation plan; do not edit.
- SCOPE: register approved paths with `scope add`.
- IMPLEMENT: edit only approved scoped paths after the mandatory edit guard passes.
- TEST: run or register tests.
- CODE_REVIEW: review only the diff for the current PBI.
- DONE: close the PBI only if gates pass.

After the step:

```bash
node bin/capa.js evidence add "<claim>" --classification VERIFIED --type command --command "<command>" --result "<result>"
node bin/capa.js completar --status ok --summary "<short summary>"
```

If something is outside the current PBI:

```bash
node bin/capa.js finding add "<title>" --description "<details>" --outside --action new-pbi
```

Do not fix it in the same step.

## Closing

To close a PBI:

```bash
node bin/capa.js cerrar pbi --summary "<summary>"
```

To compact context:

```bash
node bin/capa.js cerrar sprint --summary "<summary>"
```

## Minimal command set

```bash
node bin/capa.js iniciar "<title>"
node bin/capa.js estado
node bin/capa.js siguiente
node bin/capa.js scope add <path> --reason "<reason>"
node bin/capa-agent-edit-guard.js --file <path>
node bin/capa.js evidence add "<claim>" --classification VERIFIED
node bin/capa.js test add --type smoke --command "<command>" --status ok
node bin/capa.js review add --status ok --summary "<summary>" --risk low
node bin/capa.js finding add "<title>" --outside --action new-pbi
node bin/capa.js cerrar pbi --summary "<summary>"
node bin/capa.js cerrar sprint --summary "<summary>"
```
