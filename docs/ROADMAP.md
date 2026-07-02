# CAPA Roadmap to 10/10

Este documento es la ruta ejecutiva de CAPA. El README explica el uso; este archivo resume alcance, progreso y cierre del producto.

## Estado actual

Calificación actual: **9/10 alpha**.

CAPA ya es una **alpha interna usable**. Tiene runtime DB-first con SQLite, comandos de flujo, guard obligatorio de edición, scope, evidencia, pruebas, reviews, cierres, presupuesto visible y dashboard local.

No es 10/10 porque todavía falta probarlo de punta a punta en un repo vivo y cerrar la release alpha con changelog, checklist y tag.

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
- adaptadores Claude/Codex y superficies operadas por LLMs;
- instalación local clara;
- presupuesto visible por transición.

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
| Fuente de verdad | SQLite local `.capa/capa.db` | SQLite gobierna todo el estado operativo | 90% |
| Backlog | Lista local de PBIs | Backlog operable desde CLI y dashboard | 85% |
| PBI activo | Sí | PBI activo siempre visible y gobernado | 90% |
| One-step execution | `capa go`, `capa vamos`, `capa siguiente` | Una transición y parada obligatoria | 90% |
| Bloqueo de avance | No avanza si estado actual no está completo | Transiciones totalmente gobernadas | 85% |
| Scope | `capa scope add/list` | Scope obligatorio antes de edición | 85% |
| Guard | `capa-agent-edit-guard` y `capa guard edit --file` | Guard obligatorio antes de editar | 85% |
| Evidencia | `capa evidence add/list` | Evidencia requerida y trazable por estado | 80% |
| Tests | `capa test add/list` | TEST no cierra sin test ok | 85% |
| Code review | `capa review add/list` | Review contra diff/scope/riesgo | 75% |
| Findings | IN/OUT con acción | Findings OUT no se corrigen sin nuevo PBI/aprobación | 75% |
| Cierre PBI | Gates estrictos | Handoff regenerable desde DB | 80% |
| Cierre sprint | Compactación básica desde SQLite | Resumen operativo y riesgos | 75% |
| Dashboard | PBI, blockers, backlog y trazabilidad | Centro de operación local | 75% |
| Agentes LLM | Docs + harness obligatorio | Contrato probado en repo real | 80% |
| Presupuesto | Config + comando + visibilidad en estado/go/siguiente | Medición real de consumo | 65% |
| Legacy | Documentado como compatibilidad separada | Legacy separado/escondido | 80% |
| Instalación | README alpha | Instalación reproducible y validada | 75% |
| Prueba real | Pendiente | 3-5 tareas reales ejecutadas con CAPA | 25% |
| Release | Sin tag estable | Tag alpha estable con checklist | 25% |

## Ruta de cierre

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

### PR siguiente — Smoke real sobre el propio repo

Objetivo: demostrar CAPA en un caso real.

Aceptación:

- tarea completa con CAPA;
- evidencia registrada;
- test registrado;
- review registrada;
- cierre PBI exitoso;
- resultado reproducible.

Impacto: 9/10 -> 9.5/10.

### PR siguiente — Release alpha estable

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
Smoke real usando CAPA sobre el propio repo
```

No debemos seguir agregando comandos cosméticos. Para subir la calidad real, CAPA debe demostrar que puede controlar una tarea completa de punta a punta con evidencia, test, review y cierre.
