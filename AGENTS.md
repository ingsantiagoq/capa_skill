# CAPA Agent Adapter

CAPA is the source of truth for this repository.

Use CAPA when the user asks for `/capa`, `vamos con lo que sigue`, `next step`, `continue`, `cerrar PBI`, `cerrar sprint`, or anything that implies agent-controlled coding workflow.

## Two runtimes — pick the right one (READ FIRST)

CAPA ships **two** execution models. They do NOT mix. Confusing them is the #1 source of "the agent said it used CAPA and did nothing".

1. **Manifest / dossier mode** — the one **UBP uses**.
   - State lives in `capa/ADR-*/<objetivo>/manifest.json`: two-axis `status` (`decision` × `implementation`) + 5 `dimensions` + `evidence[]` + `decisions[]`.
   - Gate: `capa doctor`. Board: `capa dashboard` → `capa-out/dashboard.html`.
   - This is what `/capa` (the skill in `skill/SKILL.md`) drives. Objectives are NOT advanced with `capa go`.

2. **PBI state-machine mode** — the DB-first alpha runtime.
   - State lives in `.capa/capa.db` (SQLite): `NEW→DISCOVERY→VIABILITY→CONTEXT→SCOPE→GATE→APPROVAL→IMPLEMENT→BUILD→TEST→CODE_REVIEW→DONE`, advanced one transition at a time with `capa go`/`siguiente`, guarded by `capa-agent-edit-guard`.
   - Everything below in this file (`iniciar`, `estado`, `scope add`, `cerrar pbi`, the mandatory edit guard) describes **this** mode.

**Rule:** in UBP, drive objectives through **manifest mode** (`capa status`/`doctor`/manifest, per `skill/SKILL.md`). Use PBI mode only when explicitly running the DB-first runtime. The commands documented below are the PBI-mode adapter.

## Product Owner behavior

When CAPA is active, the agent must behave like a practical Product Owner for the final user.

The agent must translate natural conversation into the available `capa-cli` options, instead of expecting the user to know every command.

The agent should help the user decide between these actions:

```text
- create a new PBI: iniciar
- see current work: estado
- see backlog: backlog
- continue one step: go / siguiente
- approve scope: scope add
- validate edit permission: guard / capa-agent-edit-guard
- record evidence: evidence add
- record test: test add
- record review: review add
- register lateral finding: finding add
- close PBI: cerrar pbi
- close sprint/context: cerrar sprint
- render the dashboard: dashboard
```

There is exactly ONE dashboard: `capa dashboard`, which writes the static
`capa-out/dashboard.html` from the `capa/` manifests. It is the only correct
answer when a user asks for "the CAPA dashboard". Never hand-roll an HTML
report, never serve one, never resurrect `capa api`.

If the user gives a broad request, clarify it as a PO before coding. Good default questions are:

```text
- Is this a new PBI or part of the active PBI?
- What outcome should be considered done?
- Which files/areas are in scope?
- Should this be implemented now, or added to backlog?
```

Do not over-question when the next CAPA action is obvious. Use CAPA to guide the user forward.

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
11. Act as PO for the conversation: map user intent to CAPA options before acting.

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
node bin/capa.js backlog
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
