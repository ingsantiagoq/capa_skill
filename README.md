# capa-cli

**CAPA** — Contexto · Alcance · Progreso · Aseguramiento · Poder.

Un **ADR es la visión** de un dominio (todo lo que queremos). Cada **iteración / módulo / objetivo es 1 CAPA**:
la especificación de UN paso, **tan detallada que no le deja imaginación al agente**, anclada al código vía
[graphify](https://) (dependencia dura) y verificada adversarialmente. Replicable entre proyectos.

## Por qué

Los ADR de diseño se desincronizan del código (en UBP: 0/19 E2E-verificados contra el build limpio) y los
agentes "rellenan con imaginación" lo que la spec no fijó. CAPA aterriza cada paso al extremo, **ancla** cada
afirmación al grafo del código, **hila las dependencias** sobre la ruta del objetivo, y bloquea el PR si algo
driftea o un claim no trae evidencia. El puente diseño↔código↔evidencia deja de ser disciplina humana.

## Jerarquía

```
capa/ADR-0012-inventario/        ← VISIÓN del ADR (VISION.md, no es un CAPA)
  d-venta-cogs/                  ← 1 CAPA = 1 objetivo (detalle extremo)
    manifest.json (route, anchors, evidence, decisions)
    CONTEXTO  ALCANCE  PROGRESO  ASEGURAMIENTO  PODER  (.md)
  a-emitmovement/  c-compra/ …   ← otros objetivos
```

## Instalación

```bash
npm i -g @btw/capa-cli           # o clonar y `npm link`
capa install --platform claude   # skill /capa + sección CLAUDE.md (idempotente)
graphify update .                # CAPA depende del grafo de graphify
```

## Flujo (la skill `/capa` lo conduce, una cosa a la vez)

1. **Pregunta qué objetivo** aterrizar (no el dominio entero).
2. **Arma el panel de expertos** para ese objetivo (con tu confirmación).
3. **Crea el CAPA + activa graphify sobre la ruta** e hila dependencias.
4. **Documenta al extremo** (5 dimensiones, ancladas a nodos del grafo).
5. **Verificación adversarial + `capa doctor`** verde.

```bash
capa vision ADR-0012 --title "Inventario"
capa new ADR-0012 --objetivo d-venta-cogs --route ubp-ar-service/src,ubp-inventory-service/src
capa thread   ADR-0012 --objetivo d-venta-cogs  # graphify sobre la ruta → dependencias
capa progress ADR-0012 --objetivo d-venta-cogs  # marca qué llevo/qué falta (--done <sliceId>)
capa govern   ADR-0012                           # decisiones de firma del PO (--sign DP-x)
capa panel    ADR-0012 --objetivo d-venta-cogs  # plan del panel (Execution Runtime)
capa doctor   [--adr 0012]                       # gate anti-teatro + regla dura de Done
capa dashboard                                   # SQLite derivada + HTML del proyecto
capa status                                      # tabla 2-ejes de todos los CAPAs
```

### Progreso → Alcance (registro vivo)

`capa progress` marca los `slices` del Alcance como done/pendiente (reescribe el manifest). El % de avance
sale de ahí. "Progreso no está por bonito": marca qué llevo y qué falta, y actualiza el Alcance.

### La regla dura de Aseguramiento (Done gate)

Un CAPA **no pasa a `lifecycle: done`** hasta probar el Alcance **por API o e2e-UI**. `capa doctor` (E9)
bloquea `done` si no hay evidencia `kind: api`|`e2e-ui`, o si quedan firmas pendientes. `unit`/`graph` no alcanzan.

### Gobernanza a nivel visión (`capa govern`)

Una visión (ADR) puede tener `governance.json`: las decisiones que requieren firma del PO (`{id, what,
recommendation, owner, state, gate, unblocks}`). `capa govern <ADR>` lista; `--sign DP-x` / `--reject DP-x`
cambian el estado. Las decisiones con `gate:true` bloquean toda una fase hasta firmarse. El dashboard las
muestra por ADR + un KPI de firmas pendientes.

### Dashboard (DB derivada)

`capa dashboard` reconstruye `capa-out/capa.db` (SQLite, `node:sqlite`) escaneando los manifests + git, y
renderiza `capa-out/dashboard.html`: todos los ADR (visiones), estado 2-ejes + lifecycle por CAPA, % avance
y bloqueos. **La DB es una proyección regenerable, no una verdad paralela** — la verdad vive en el código.

## `capa doctor` — reglas que bloquean (MODO BLOQUEO)

| Código | Falla |
|---|---|
| E1–E3 | manifest ilegible / estado 2-ejes inválido / falta una dimensión |
| E4 | **drift**: ancla que no existe en el grafo |
| E5 | **teatro**: evidencia sin comando reproducible |
| E6 | `E2E-VERIFIED` sin `verified_against` + comando + ancla viva |
| E7 | hay implementación pero 0 anclas vivas |
| E8 | **ruta stale**: un prefijo de `route` no matchea ningún nodo del grafo |
| E9 | **Done sin prueba**: `lifecycle:done` sin evidencia `api`/`e2e-ui`, o con firmas pendientes |
| E10 | **front sin diseño**: CAPA `frontend:true` que no declara las 3 skills (emil-kowalski/impeccable/taste) |

`PODER` (firmas pendientes) son avisos, no bloqueos: gobernanza, no teatro.

## El equipo (skills que ejecutan cada CAPA)

CAPA orquesta; estas skills hacen el trabajo: `ubp-bootstrap` · `new-microservice`/`new-entity`/`new-proto` ·
`new-page`/`frontend-angular` · `backend-reviewer`/`frontend-reviewer` · `ubp-validate-story`/`ubp-sonar-check`
· `ubp-handoff`.

## Arquitectura del paquete

```
bin/capa.js     dispatcher
lib/graph.js    carga graph.json, resuelve nodos + links
lib/doctor.js   linter anti-teatro recursivo (E1–E8)
lib/thread.js   activa graphify sobre la ruta, hila dependencias
lib/scaffold.js init · vision · new (CAPA por objetivo)
lib/panel.js    Execution Runtime (plan del panel)
lib/install.js  install/uninstall (reversible)
skill/SKILL.md  skill /capa (flujo interactivo + equipo)
templates/      VISION.md + dossier/ (5 dimensiones + manifest)
```

## Dependencias de frontend (apariencia completa)

Un CAPA de front (`capa new ... --frontend`) declara y exige 3 skills de diseño:
`emil-kowalski` · `impeccable` · `taste`. `capa doctor` (E10) bloquea si faltan. El panel de un CAPA de
front las usa para el Contrato Front (vistas/estados/línea gráfica).

## Roadmap

- [ ] Plugin de Claude Code (`plugin.json` + `marketplace.json`) → install vía `/plugin`.
- [ ] `capa doctor` como hook pre-commit (bloqueo automático).
- [ ] `capa progress --auto` — derivar slices done de `dotnet test` + grafo.
- [ ] `capa dashboard --serve` — servidor live; histórico de avance por commit en la DB.
- [ ] Extracción semántica (Gemini) → `thread` ve también las dependencias gRPC cross-service.
