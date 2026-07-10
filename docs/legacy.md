# CAPA legacy dossier commands

CAPA now has two surfaces:

1. **Runtime DB-first**: the current core, backed by `.capa/capa.db`.
2. **Legacy dossier**: older Markdown/Graphify-oriented commands kept for compatibility.

The runtime is the default path for agents and day-to-day work.

## Runtime DB-first commands

Use these for current CAPA work:

```bash
capa iniciar "Título del PBI"
capa estado
capa budget
capa go
capa siguiente
capa completar --status ok --summary "..."
capa bloquear "motivo"
capa backlog
capa guard edit --file src/app.js
capa scope add src --reason "..."
capa finding add "..." --outside --action new-pbi
capa evidence add "..." --classification VERIFIED
capa test add --type smoke --command "npm test" --status ok
capa review add --status ok --summary "..." --risk low
capa cerrar pbi --summary "..."
capa cerrar sprint --summary "..."
```

The runtime has **no web surface**. Inspect it with the CLI. `capa api` was
removed: it served a second, competing dashboard.

## The dashboard is not legacy

`capa dashboard` belongs to the dossier toolchain but is **the single supported
dashboard of CAPA**, for both surfaces. It renders `capa-out/dashboard.html`
from the `capa/` manifests. See the README.

## Legacy dossier commands

These commands remain available but are not the default flow:

```bash
capa init
capa vision <ADR-XXXX>
capa new <ADR-XXXX> --objetivo <S>
capa thread <ADR-XXXX> --objetivo <S>
capa progress <ADR> --objetivo <S>
capa govern <ADR>
capa panel <ADR-XXXX> --objetivo <S>
capa doctor [--adr ID]
capa status
capa install
capa uninstall
```

## Rules

- Agents must not use legacy commands to infer active runtime state.
- If runtime SQLite exists, `.capa/capa.db` wins over Markdown.
- Legacy commands are compatibility tools, not the operating source of truth.
- New CAPA work should prefer runtime DB-first commands.

## Why this split exists

Legacy commands were useful during the original CAPA dossier phase, but mixing them with the DB-first runtime increases confusion for agents.

The current product direction is:

```text
small for the user,
strict for the agent,
persistent in SQLite,
verifiable by evidence,
and hard against scope creep.
```
