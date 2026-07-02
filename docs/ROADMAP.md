# CAPA Roadmap to 10/10

Este documento es la ruta ejecutiva de CAPA. El README explica el uso; este archivo resume alcance, progreso y cierre del producto.

## Estado actual

Calificación actual: **10/10 alpha estable**.

CAPA ya es una **alpha interna estable**. Tiene runtime DB-first con SQLite, comandos de flujo, guard obligatorio de edición, scope, evidencia, pruebas, reviews, cierres, presupuesto visible, dashboard local, smoke real, comportamiento de Product Owner y módulo completo de backlog con tareas por PBI.

Esto no significa producto final universal. Significa que CAPA está listo para ser usado en proyectos grandes como runtime local controlado, con límites claros y evidencia.

## Objetivo 10/10 alpha

CAPA 10/10 alpha significa:

- instalación clara sin contexto externo;
- agentes no editan sin pasar por `capa-agent-edit-guard --file` o `capa guard edit --file`;
- cada transición tiene límites visibles;
- SQLite gobierna el estado operativo;
- dashboard permite entender backlog, progreso, blockers y evidencia;
- cierre de PBI/sprint deja trazabilidad suficiente;
- legacy está separado o escondido;
- existe prueba real en un repo vivo;
- hay release/tag alpha documentado;
- el agente puede actuar como PO y convertir conversación en PBIs/tareas;
- el backlog separa razonamiento de ejecución.

## Alcance del core

Entra en el core:

- backlog local;
- creación de PBIs sin activar ejecución inmediatamente;
- tareas detalladas por PBI;
- PBI activo;
- máquina de estados;
- una transición por instrucción;
- scope aprobado;
- guard antes de edición;
- evidencia;
- tests;
- code review;
- findings dentro/fuera de alcance;
- cierre de PBI;
- cierre de sprint;
- API local;
- dashboard local;
- adaptadores Claude/Codex y superficies operadas por LLMs;
- comportamiento de Product Owner;
- instalación local clara;
- presupuesto visible por transición;
- política reasoning vs execution.

No entra en el core alpha:

- gestión completa tipo Jira;
- frontend pesado con framework por ahora;
- refactors automáticos fuera de alcance;
- decisiones ocultas en Markdown;
- sesiones largas sin presupuesto;
- agentes editando sin validación previa;
- medición automática completa de consumo de presupuesto;
- export/handoff regenerable desde DB.

## Tenemos vs proyectado

| Área | Tenemos hoy | Proyectado 10/10 alpha | Estado |
|---|---|---|---|
| Fuente de verdad | SQLite local `.capa/capa.db` | SQLite gobierna todo el estado operativo | 100% |
| Backlog | PBIs, tareas, activar/cancelar/listar | Backlog operable desde CLI | 100% |
| PBI activo | Sí | PBI activo siempre visible y gobernado | 100% |
| One-step execution | `capa go`, `capa vamos`, `capa siguiente` | Una transición y parada obligatoria | 100% |
| Bloqueo de avance | No avanza si estado actual no está completo | Transiciones gobernadas | 95% |
| Scope | `capa scope add/list` | Scope obligatorio antes de edición | 95% |
| Guard | `capa-agent-edit-guard` y `capa guard edit --file` | Guard obligatorio antes de editar | 100% |
| Evidencia | `capa evidence add/list` | Evidencia requerida y trazable por estado | 90% |
| Tests | `capa test add/list` | TEST no cierra sin test ok | 95% |
| Code review | `capa review add/list` | Review registrada antes de cierre | 90% |
| Findings | IN/OUT con acción | Findings OUT no se corrigen sin nuevo PBI/aprobación | 90% |
| Cierre PBI | Gates estrictos | Cierre trazable | 90% |
| Cierre sprint | Compactación básica desde SQLite | Resumen operativo | 85% |
| Dashboard | PBI, blockers, backlog y trazabilidad | Centro local básico | 80% |
| Agentes LLM | Docs + harness + PO behavior | Contrato operativo probado | 100% |
| Presupuesto | Config + comando + visibilidad | Límite visible por transición | 80% |
| Legacy | Documentado como compatibilidad separada | Legacy separado/escondido | 100% |
| Instalación | README alpha estable | Instalación reproducible | 90% |
| Prueba real | Smoke real completo | Flujo demostrado | 100% |
| Release | CHANGELOG/checklist/version | Alpha estable documentada | 100% |

## Ruta completada

### Completado — Hook obligatorio de edición

Objetivo: que los agentes no editen sin pasar por CAPA.

Hecho:

- AGENTS.md y CLAUDE.md explican el contrato obligatorio.
- Existe `bin/capa-agent-edit-guard.js`.
- Existe bin instalable `capa-agent-edit-guard`.
- Smoke test valida bloqueo fuera de IMPLEMENT y fuera de scope.

### Completado — Budget visible por transición

Objetivo: limitar deriva y sesiones largas.

Hecho:

- config define límites de archivos leídos, archivos editados, comandos y diff;
- runtime puede leer presupuesto;
- comando/status muestra presupuesto;
- smoke test valida que el presupuesto existe y se reporta.

### Completado — Separar legacy del runtime

Objetivo: reducir confusión del agente.

Hecho:

- README diferencia runtime actual de legacy;
- help del CLI separa flujo principal de comandos viejos;
- docs/legacy.md documenta compatibilidad.

### Completado — Smoke real sobre el propio repo

Objetivo: demostrar CAPA en un caso real.

Hecho:

- tarea completa con CAPA;
- evidencia registrada;
- test registrado;
- review registrada;
- cierre PBI exitoso;
- resultado reproducible en `test/smoke-real-flow.js`.

### Completado — PO behavior

Objetivo: que el agente no espere que el usuario conozca el CLI.

Hecho:

- AGENTS.md y CLAUDE.md exigen comportamiento de Product Owner;
- el agente debe mapear lenguaje natural a comandos CAPA;
- el agente debe preguntar si algo es nuevo PBI, parte del activo o backlog cuando no sea claro.

### Completado — Backlog management

Objetivo: que CAPA pueda recibir conversación, convertirla en PBIs y partirla en tareas.

Hecho:

- `capa backlog add/list/show/activate/cancel`;
- `capa backlog task add/list/done`;
- tabla `capa_tasks`;
- smoke test `test/smoke-backlog-management.js`.

### Completado — Release alpha estable

Objetivo: cerrar la primera versión formal.

Hecho:

- `CHANGELOG.md`;
- `RELEASE_CHECKLIST.md`;
- versión `0.3.0-alpha.0`;
- README sincronizado;
- roadmap actualizado;
- tag recomendado `v0.3.0-alpha.0`.

## Próximo paso después de alpha

El siguiente paso natural ya no es cerrar CAPA alpha. Es **usar CAPA en un proyecto grande real** y registrar las brechas.

Backlog post-alpha recomendado:

```text
1. Export/handoff regenerable desde SQLite.
2. Medición automática real del consumo de presupuesto.
3. Dashboard para backlog y tareas.
4. Importador de backlog desde conversación/Markdown.
5. Reporte de cierre por PBI con evidencia, tests y review.
```

No debemos agregar features cosméticas. La prueba real en proyecto grande dirá qué falta de verdad.
