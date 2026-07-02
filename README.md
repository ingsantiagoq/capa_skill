# CAPA

**CAPA** — Contexto · Alcance · Progreso · Aseguramiento.

CAPA es un runtime local para controlar trabajo asistido por agentes de IA y flujos operados por LLMs. Su objetivo no es producir más Markdown, sino mantener el trabajo pequeño, verificable, persistente y sin scope creep.

Estado actual: **alpha interna usable**.

---

## Qué problema resuelve

Los agentes suelen fallar cuando:

- leen demasiado contexto;
- continúan más allá de lo pedido;
- arreglan hallazgos laterales sin aprobación;
- mezclan discovery, implementación, pruebas y review en una sola corrida;
- dicen que algo está terminado sin evidencia;
- usan el chat o archivos `.md` como estado confiable.

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
capa backlog
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

Dashboard local:

```bash
capa api --port 4739
```

Abrir:

```text
http://127.0.0.1:4739/
```

---

## Cómo debe comportarse un agente

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

El dashboard local muestra:

- PBI activo;
- blockers para completar el estado actual;
- blockers para cerrar PBI;
- backlog;
- progreso;
- evidencia;
- tests;
- reviews;
- findings;
- formularios para registrar acciones.

No requiere React, Angular, Ionic ni Vite. Es local, simple y DB-first.

---

## Qué ya existe en esta alpha

```text
Runtime DB-first con SQLite
Backlog local
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
API local
Dashboard local
Adaptadores iniciales para superficies operadas por LLMs
Legacy documentado como compatibilidad separada
```

---

## Qué falta antes de llamarlo estable

CAPA todavía no está terminado. Falta:

```text
1. Probarlo en varios repos reales.
2. Export/handoff regenerable desde SQLite.
3. Medición automática real del consumo de presupuesto.
4. Release alpha estable con CHANGELOG, checklist y tag.
```

La ruta ejecutiva para cerrar esa brecha está en:

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
  legacy.md
public/
  index.html
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
