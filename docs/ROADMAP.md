# CAPA Roadmap to 10/10

Este documento es la ruta ejecutiva de CAPA. El README explica el uso; este archivo resume alcance, progreso y cierre del producto.

## Estado actual

Calificación actual: **7/10**.

CAPA ya es una **alpha interna usable**. Tiene runtime DB-first con SQLite, comandos de flujo, guard, scope, evidencia, pruebas, reviews, cierres y dashboard local.

No es 10/10 porque aún depende parcialmente de disciplina del agente, no tiene presupuesto operativo aplicado y todavía convive con superficie legacy.

## Objetivo 10/10 alpha

CAPA 10/10 alpha significa:

- instalación clara sin contexto externo;
- Claude/Codex no editan sin pasar por `capa guard edit --file`;
- cada transición tiene límites visibles;
- SQLite gobierna el estado operativo;
- dashboard permite entender backlog, progreso, blockers y evidencia;
- cierre de PBI/sprint deja trazabilidad suficiente;
- legacy está separado o escondido;
- existe prueba real en un repo vivo;
- hay release/tag alpha documentado.

## Alcance del core

Entra en el core:

- backlog local;
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
- adaptadores Claude/Codex;
- instalación local clara.

No entra en el core:

- gestión completa tipo Jira;
- frontend pesado con framework por ahora;
- refactors automáticos fuera de alcance;
- decisiones ocultas en Markdown;
- sesiones largas sin presupuesto;
- agentes editando sin validación previa.

## Tenemos vs proyectado

| Área | Tenemos hoy | Proyectado 10/10 | Estado |
|---|---|---|---|
| Fuente de verdad | SQLite local `.capa/capa.db` | SQLite gobierna todo el estado operativo | 85% |
| Backlog | Lista local de PBIs | Backlog operable desde CLI y dashboard | 80% |
| PBI activo | Sí | PBI activo siempre visible y gobernado | 85% |
| One-step execution | `capa go`, `capa vamos`, `capa siguiente` | Una transición y parada obligatoria | 85% |
| Bloqueo de avance | No avanza si estado actual no está completo | Transiciones totalmente gobernadas | 80% |
| Scope | `capa scope add/list` | Scope obligatorio antes de edición | 75% |
| Guard | `capa guard edit --file` | Hook obligatorio antes de editar | 60% |
| Evidencia | `capa evidence add/list` | Evidencia requerida y trazable por estado | 75% |
| Tests | `capa test add/list` | TEST no cierra sin test ok | 80% |
| Code review | `capa review add/list` | Review contra diff/scope/riesgo | 70% |
| Findings | IN/OUT con acción | Findings OUT no se corrigen sin nuevo PBI/aprobación | 70% |
| Cierre PBI | Gates estrictos | Handoff regenerable desde DB | 75% |
| Cierre sprint | Compactación básica desde SQLite | Resumen operativo y riesgos | 70% |
| Dashboard | PBI, blockers, backlog y trazabilidad | Centro de operación local | 70% |
| Claude/Codex | Docs iniciales | Hooks obligatorios y contrato probado | 55% |
| Presupuesto | Config conceptual | Límites reales de lecturas, edits, comandos y diff | 25% |
| Legacy | Sigue mezclado | Legacy separado/escondido | 30% |
| Instalación | README alpha | Instalación reproducible y validada | 70% |
| Prueba real | Pendiente | 3-5 tareas reales ejecutadas con CAPA | 20% |
| Release | Sin tag estable | Tag alpha estable con checklist | 20% |

## Ruta de cierre

### PR #25 — Hook obligatorio de edición

Objetivo: que Claude/Codex no editen sin pasar por CAPA.

Aceptación:

- AGENTS.md y CLAUDE.md explican el contrato obligatorio.
- Existe hook/harness para validar `capa guard edit --file` antes de edición.
- Smoke test valida el contrato de agente.
- El flujo dice qué hacer cuando CAPA bloquea.

Impacto: 7/10 -> 8/10.

### PR #26 — Budget por transición

Objetivo: limitar deriva y sesiones largas.

Aceptación:

- config define límites de archivos leídos, archivos editados, comandos y diff;
- runtime puede leer presupuesto;
- comando/status muestra presupuesto;
- smoke test valida que el presupuesto existe y se reporta.

Impacto: 8/10 -> 8.7/10.

### PR #27 — Separar legacy del runtime

Objetivo: reducir confusión del agente.

Aceptación:

- README diferencia runtime actual de legacy;
- help del CLI separa flujo principal de comandos viejos;
- docs/legacy.md documenta compatibilidad.

Impacto: 8.7/10 -> 9/10.

### PR #28 — Smoke real sobre el propio repo

Objetivo: demostrar CAPA en un caso real.

Aceptación:

- tarea completa con CAPA;
- evidencia registrada;
- test registrado;
- review registrada;
- cierre PBI exitoso;
- resultado reproducible.

Impacto: 9/10 -> 9.5/10.

### PR #29 — Release alpha estable

Objetivo: cerrar la primera versión formal.

Aceptación:

- CHANGELOG.md;
- versión definida;
- checklist de release;
- tag recomendado;
- README sincronizado;
- sin PRs críticos abiertos.

Impacto: 9.5/10 -> 10/10 alpha.

## Próximo paso inmediato

El siguiente paso natural es:

```text
PR #25 — Hook obligatorio de edición para agentes
```

No debemos seguir agregando comandos cosméticos. Para subir la calidad real, CAPA debe dejar de depender de la buena conducta del agente y empezar a imponer el contrato de edición.
