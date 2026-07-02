# CAPA alpha release checklist

Release target: **0.3.0-alpha.0**

## Core runtime

- [x] SQLite is the operational source of truth.
- [x] `capa iniciar` creates an active PBI.
- [x] `capa go` / `capa siguiente` run one transition at a time.
- [x] CAPA blocks advancing when the current state is incomplete.
- [x] Scope is explicit through `capa scope add/list`.
- [x] Guard validates edit permission through `capa guard edit --file`.
- [x] Agent harness validates edit permission through `capa-agent-edit-guard --file`.
- [x] Evidence is registered through `capa evidence add/list`.
- [x] Tests are registered through `capa test add/list`.
- [x] Code reviews are registered through `capa review add/list`.
- [x] Findings are registered as in-scope or out-of-scope.
- [x] PBI close has gates.
- [x] Sprint close compacts from SQLite.

## Backlog and PO workflow

- [x] `capa backlog add` creates a PBI without immediately forcing execution.
- [x] `capa backlog list` shows pending work.
- [x] `capa backlog show` shows one PBI and its tasks.
- [x] `capa backlog activate` makes a PBI active.
- [x] `capa backlog cancel` cancels a PBI.
- [x] `capa backlog task add` creates detailed execution tasks.
- [x] `capa backlog task list` lists PBI tasks.
- [x] `capa backlog task done` closes a task.
- [x] Agent contract says CAPA must act as Product Owner for the final user.
- [x] Model policy separates reasoning from execution.

## Validation

- [x] DB-first smoke test exists.
- [x] Guard smoke test exists.
- [x] Scope smoke test exists.
- [x] Evidence smoke test exists.
- [x] Test/review smoke test exists.
- [x] Close PBI smoke test exists.
- [x] Close sprint smoke test exists.
- [x] Dashboard smoke test exists.
- [x] Agent adapter smoke test exists.
- [x] Mandatory agent edit guard smoke test exists.
- [x] Budget smoke test exists.
- [x] Real CAPA flow smoke test exists.
- [x] Backlog management smoke test exists.
- [x] CI runs the smoke suite.

## Documentation

- [x] README documents runtime DB-first.
- [x] README documents backlog and task workflow.
- [x] README documents agent behavior.
- [x] README documents budget.
- [x] README documents dashboard.
- [x] README points to roadmap, model policy and legacy docs.
- [x] ROADMAP reflects 10/10 alpha.
- [x] CHANGELOG exists.
- [x] Legacy commands are documented separately.

## Release decision

CAPA can be used as **alpha estable** in a large project when the team accepts these boundaries:

- It is local-first and DB-first.
- It controls workflow; it does not replace Jira or full project management.
- It requires disciplined agent behavior.
- It is strongest when Opus-like reasoning shapes backlog and Sonnet/Kaiku-like execution runs bounded tasks.
- Remaining gaps are post-alpha: budget consumption tracking, DB export/handoff, and more real repo trials.

Recommended tag:

```text
v0.3.0-alpha.0
```
