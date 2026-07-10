# CAPA

**CAPA** — Contexto · Alcance · Progreso · Aseguramiento.

CAPA es un runtime local para controlar trabajo asistido por agentes de IA y flujos operados por LLMs. Su objetivo no es producir más Markdown, sino mantener el trabajo pequeño, verificable, persistente y sin scope creep.

Estado actual: **alpha estable interna — 0.3.0-alpha.0**.

---

## Qué problema resuelve

Los agentes suelen fallar cuando:

- leen demasiado contexto;
- continúan más allá de lo pedido;
- arreglan hallazgos laterales sin aprobación;
- mezclan discovery, implementación, pruebas y review en una sola corrida;
- dicen que algo está terminado sin evidencia;
- usan el chat o archivos `.md` como estado confiable;
- ejecutan cambios sin backlog claro ni criterio de PO.

CAPA impone una regla central:

```text
Una instrucción CAPA ejecuta una sola transición, registra evidencia y se detiene.
```

La fuente de verdad operativa es:

```text
.capa/capa.db
```

Si SQLite y un Markdown se contradicen, gana SQLite.

---

## Superficies del producto

CAPA tiene dos superficies claramente separadas:

```text
1. Runtime DB-first
   Es el core actual. Usa `.capa/capa.db` como fuente de verdad.

2. Legacy dossier
   Comandos antiguos de dossier/Graphify/Markdown conservados por compatibilidad.
```

Para trabajo nuevo con agentes, usa siempre el **runtime DB-first**.

Los comandos legacy no deben usarse para inferir PBI activo, progreso operativo, evidencias o cierres. La referencia de compatibilidad está en:

```text
docs/legacy.md
```

---

## Instalación local

Requisitos:

```text
Node.js >= 18
npm
```

Instalación desde el repositorio:

```bash
git clone https://github.com/ingsantiagoq/capa_skill.git
cd capa_skill
npm install
npm link
```

Validar instalación:

```bash
capa version
npm test
```

---

## Primer flujo de 5 minutos

Desde cualquier repo donde quieras controlar una tarea con CAPA:

```bash
capa iniciar "Probar CAPA en este repo"
capa estado
capa go
```

`capa go` o `capa vamos` avanza exactamente una transición y te dice qué estado toca ejecutar.

Cuando termines esa transición:

```bash
capa completar --status ok --summary "DISCOVERY completed"
```

Luego te detienes. No ejecutes otro `capa go` hasta que el usuario o el flujo lo pidan.

---

## Flujo recomendado para proyectos grandes

En proyectos grandes, no arranques editando. Primero usa CAPA como PO operativo:

```bash
capa backlog add "Migrar módulo de facturación" --type feature --priority 1
capa backlog task add --pbi 1 "Definir alcance y criterios de aceptación" --model reasoning
capa backlog task add --pbi 1 "Implementar primer slice controlado" --model execution --acceptance "smoke test ok"
capa backlog show 1
capa backlog activate 1
capa go
```

La idea es separar:

```text
conversación -> PBI -> tareas -> scope -> ejecución -> evidencia -> test -> review -> cierre
```

---

## Comandos principales del runtime DB-first

```bash
capa iniciar "Título del PBI"
capa estado
capa budget
capa go
capa vamos
capa siguiente
capa completar --status ok --summary "..."
capa bloquear "motivo"
```

Backlog y tareas:

```bash
capa backlog add "Crear login" --type feature --priority 1
capa backlog list
capa backlog show 1
capa backlog activate 1
capa backlog cancel 1 --reason "ya no aplica"
capa backlog task add --pbi 1 "Definir criterios" --model reasoning --acceptance "criterios claros"
capa backlog task add --pbi 1 "Implementar endpoint" --model execution --acceptance "test ok"
capa backlog task list --pbi 1
capa backlog task done 1 --summary "tarea completada"
```

Alcance y guard:

```bash
capa scope add src --reason "carpeta permitida para implementación"
capa scope list
capa guard edit --file src/app.js
capa-agent-edit-guard --file src/app.js
```

Evidencia, pruebas, review y hallazgos:

```bash
capa evidence add "Se verificó X" --classification VERIFIED --type command --command "npm test" --result "passed"
capa test add --type smoke --command "npm test" --status ok
capa review add --status ok --summary "diff revisado" --risk low
capa finding add "Hallazgo lateral" --outside --action new-pbi
```

Cierre:

```bash
capa cerrar pbi --summary "PBI cerrado con evidencia"
capa cerrar sprint --summary "Sprint cerrado"
```

Dashboard — hay **uno solo**, ver [§ Dashboard](#dashboard).

---

## Cómo debe comportarse un agente

Cuando CAPA está activo en Claude Code, Codex u otra superficie operada por LLMs, el agente debe actuar como **Product Owner práctico** para el usuario final.

Eso significa:

```text
1. Traducir lenguaje natural a opciones de capa-cli.
2. Preguntar si algo es nuevo PBI o parte del PBI activo cuando no sea claro.
3. Convertir solicitudes amplias en backlog y tareas.
4. Separar razonamiento de ejecución.
5. Ejecutar solo una transición a la vez.
6. No editar sin scope y guard.
```

Cuando el usuario diga:

```text
/capa vamos con lo que sigue
```

El agente debe ejecutar:

```bash
capa go
```

Y obedecer esto:

```text
1. Hacer solo el estado que CAPA indicó.
2. No corregir hallazgos laterales.
3. No editar fuera del scope aprobado.
4. Registrar evidencia si aplica.
5. Completar el estado.
6. Detenerse.
```

Antes de editar cualquier archivo:

```bash
capa-agent-edit-guard --file ruta/del/archivo
```

Comando equivalente de bajo nivel:

```bash
capa guard edit --file ruta/del/archivo
```

Si CAPA bloquea, el agente debe parar. No debe buscar atajos.

---

## Política de modelos

CAPA separa razonamiento y ejecución para controlar costo y riesgo.

```text
reasoning:
  - actuar como PO;
  - entender intención ambigua;
  - crear PBIs;
  - partir tareas;
  - definir criterios de aceptación;
  - decidir alcance y riesgo.

execution:
  - editar archivos dentro del scope;
  - correr comandos;
  - registrar evidencia;
  - registrar tests;
  - registrar reviews;
  - completar una transición.
```

En operación práctica:

```text
Opus      -> reasoning / PO / definición / alcance / criterios
Sonnet    -> execution / implementación / comandos / evidencia
Kaiku     -> execution / implementación / comandos / evidencia
```

La política formal está en:

```text
docs/MODEL_POLICY.md
```

---

## Máquina de estados actual

Flujo base:

```text
NEW
DISCOVERY
VIABILITY
CONTEXT
SCOPE
GATE
APPROVAL
IMPLEMENT
BUILD
TEST
CODE_REVIEW
DONE
```

Regla dura:

```text
No existen transiciones libres.
```

`capa go` no puede avanzar si el estado actual no fue completado correctamente.

---

## Criterios de salida activos

CAPA ya impide completar como `ok` algunos estados críticos sin prueba mínima:

```text
SCOPE        requiere al menos un path aprobado.
IMPLEMENT    requiere evidencia registrada en IMPLEMENT.
TEST         requiere al menos un test con status ok.
CODE_REVIEW  requiere al menos un review con status ok.
```

Ejemplo de bloqueo esperado:

```text
Cannot complete TEST: TEST requires at least one ok test
```

Esto evita progreso teatral con:

```bash
capa completar --status ok --summary "done"
```

---

## Presupuesto por transición

CAPA muestra un presupuesto operativo para reducir deriva:

```bash
capa budget
```

Valores actuales:

```text
max_minutes: 5
max_tool_calls: 8
max_bash_commands: 4
max_file_reads: 5
max_file_edits: 2
max_files_touched: 2
max_git_diff_lines: 200
allow_auto_fix: false
```

El presupuesto aparece también en `capa estado`, `capa go` y `capa siguiente`.

---

## Dashboard

**Hay un único dashboard.** Se genera con:

```bash
capa dashboard
```

Escribe dos artefactos regenerables en `capa-out/`:

| Artefacto | Qué es |
| --- | --- |
| `capa-out/dashboard.html` | el tablero — abrilo en el navegador |
| `capa-out/capa.db` | SQLite derivada (cache; se borra y reconstruye en cada corrida) |

Se construye leyendo **los `manifest.json` de `capa/`**, que son la fuente de
verdad. No hay servidor, ni build, ni framework: es un HTML estático.

Muestra, sobre todos los ADR del proyecto:

- índice consolidado por ADR, agrupado en *tiers*, con madurez del barrido;
- por objetivo: barrido, lifecycle, decisión/implementación, progreso de slices;
- si tiene prueba de Alcance (`api`/`e2e-ui`) y qué lo bloquea;
- gobernanza por ADR: decisiones `DP-*` firmadas, pendientes y rechazadas.

Los *tiers* del índice se declaran en `capa.config.json` (rangos inclusivos de
id). Sin `tiers`, los ADR caen en un solo grupo:

```json
{
  "tiers": [
    { "name": "Fundacional", "from": "ADR-0001", "to": "ADR-0005" },
    { "name": "Módulos de negocio", "from": "ADR-0020", "to": "ADR-0035" }
  ]
}
```

> No existe `capa api`, ni un dashboard de runtime, ni `gen-dashboard.py`.
> Si encontrás otro HTML de CAPA en un repo, está muerto: borralo.
> El estado del runtime DB-first se inspecciona por CLI (`capa estado`,
> `capa backlog list`, `capa evidence list`), no por web.

---

## Qué ya existe en esta alpha estable

```text
Runtime DB-first con SQLite
Backlog local y gestión de PBIs
Tareas detalladas por PBI
PBI activo
One-step execution
Guard obligatorio para edición
Scope aprobado
Findings IN/OUT
Evidence
Tests
Reviews
Cierre de PBI
Cierre de sprint
Budget visible por transición
Smoke real de flujo completo
API local
Dashboard local
Adaptadores para superficies operadas por LLMs
Comportamiento de Product Owner en el contrato de agente
Política reasoning vs execution
Legacy documentado como compatibilidad separada
```

---

## Límites conocidos post-alpha

CAPA está cerrado como alpha estable, pero todavía faltan mejoras para una beta:

```text
1. Export/handoff regenerable desde SQLite.
2. Medición automática real del consumo de presupuesto.
3. Más acciones de backlog/tareas desde dashboard.
4. Validarlo en varios repos grandes reales.
```

La ruta ejecutiva está en:

```text
docs/ROADMAP.md
```

---

## Estructura relevante

```text
.capa/
  schema.sql
  config.json
bin/
  capa.js
  capa-go.js
  capa-agent-edit-guard.js
lib/runtime/
  db.js
  items.js
  backlog.js
  guard.js
  scope.js
  findings.js
  evidence.js
  tests.js
  reviews.js
  closure.js
  sprint.js
  api.js
  exit-criteria.js
  budget.js
docs/
  ROADMAP.md
  MODEL_POLICY.md
  legacy.md
public/
  index.html
```

---

## Release

Versión actual:

```text
0.3.0-alpha.0
```

Checklist:

```text
RELEASE_CHECKLIST.md
```

Changelog:

```text
CHANGELOG.md
```

Tag recomendado:

```text
v0.3.0-alpha.0
```

---

## Regla final

CAPA debe ser:

```text
pequeño para el usuario,
estricto para el agente,
persistente en SQLite,
verificable por evidencia,
portable entre herramientas,
y duro contra el scope creep.
```

Si una parte de CAPA no reduce tokens, no reduce riesgo, no mejora trazabilidad o no impide improvisación, no pertenece al core.
