# Changelog

## Unreleased

### Added
- **doctor E13 (anti-teatro de dossier):** `capa doctor` ahora avisa cuando un objetivo con estado
  no-NONE (PARTIAL/E2E-VERIFIED) tiene dimensiones que siguen siendo la PLANTILLA sin llenar (marcadores
  `<!-- … -->`). E3 verificaba que el archivo existiera; E13 verifica que esté ESCRITO. Aviso (no bloqueo)
  para no reventar el gate de PR de todo el backlog de una — escalable a BLOCKER tras el backfill.

## 0.3.0-alpha.0 — CAPA alpha estable

Esta versión cierra CAPA como alpha interna estable: instalable, documentada, DB-first y lista para probarse en proyectos grandes con control de alcance, evidencia y backlog.

### Added

- Runtime DB-first con SQLite como fuente de verdad operativa.
- Flujo one-step con `capa go`, `capa vamos` y `capa siguiente`.
- Bloqueo de avance cuando el estado actual no está completo.
- Scope aprobado con `capa scope add/list`.
- Guard de edición con `capa guard edit --file`.
- Harness obligatorio de agente con `capa-agent-edit-guard --file`.
- Evidencia verificable con `capa evidence add/list`.
- Registro de pruebas con `capa test add/list`.
- Registro de code review con `capa review add/list`.
- Findings dentro/fuera de alcance con `capa finding add/list`.
- Cierre de PBI con gates mínimos.
- Cierre de sprint desde SQLite.
- Presupuesto visible por transición con `capa budget`.
- API local y dashboard DB-first.
- Smoke real de flujo completo contra el propio repositorio.
- Contrato de agente para Claude/Codex con comportamiento de Product Owner.
- Módulo de backlog:
  - `capa backlog add`
  - `capa backlog list`
  - `capa backlog show`
  - `capa backlog activate`
  - `capa backlog cancel`
  - `capa backlog task add`
  - `capa backlog task list`
  - `capa backlog task done`
- Tabla `capa_tasks` para tareas detalladas por PBI.
- Política de modelo: razonamiento para PO/definición, ejecución para implementación/comandos/evidencia.
- Documentación de legacy separado del runtime DB-first.

### Changed

- El README ahora posiciona CAPA como alpha estable y no solo como alpha usable.
- El roadmap queda actualizado a estado 10/10 alpha.
- El flujo recomendado favorece backlog + tareas antes de ejecutar cambios en repos grandes.
- `capa backlog` deja de ser solo listado y pasa a ser una superficie completa de gestión.

### Fixed

- Se reduce la ambigüedad entre crear PBI y activar trabajo.
- Se reduce la dependencia de que el usuario conozca comandos internos de CAPA.
- Se reduce el riesgo de ejecución costosa usando separación reasoning/execution.

### Known gaps after alpha

- Medición automática real del consumo de presupuesto.
- Export/handoff regenerable desde SQLite.
- Más validaciones del dashboard para backlog/tareas.
- Pruebas en varios repos grandes reales.
