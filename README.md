# CAPA

**CAPA** — Contexto · Alcance · Progreso · Aseguramiento · Poder.

CAPA busca convertir el trabajo asistido por agentes de IA en un proceso **controlado, verificable y persistente**.

No es solo una Skill.  
No es solo documentación.  
No es un conjunto de archivos `.md` para recordarle cosas al agente.

CAPA debe ser un **runtime local de trabajo** para Claude Code, Codex u otros agentes: un único comando visible, una base de datos local como fuente de verdad, una máquina de estados estricta, evidencia obligatoria, bloqueo de scope creep y un tablero para ver el avance real.

---

## Problema que CAPA debe resolver

Los agentes de código tienden a fallar de formas repetidas:

- leen demasiado contexto y consumen tokens sin necesidad;
- interpretan tareas ambiguas como permiso para ampliar alcance;
- encuentran un fallo lateral y lo corrigen sin confirmar si pertenece al objetivo;
- dicen que algo está hecho sin evidencia reproducible;
- ejecutan varias fases seguidas cuando el usuario solo pidió “lo que sigue”;
- se apoyan en memoria conversacional o archivos Markdown que pueden estar desactualizados;
- hacen code review, debugging o refactor como exploración abierta, no como trabajo acotado.

CAPA existe para impedir eso.

La regla central es:

```text
Cada /capa ejecuta una sola transición, registra evidencia y se detiene.
```

---

## Principio rector

```text
Si no está en la base local de CAPA, no existe como estado operativo.
```

La conversación no es fuente de verdad.  
Los Markdown no son fuente de verdad.  
Los handoffs manuales no son fuente de verdad.  

La fuente de verdad operativa debe ser:

```text
.capa/capa.db
```

Los archivos Markdown pueden existir, pero solo como:

- adaptadores mínimos para Claude Code o Codex;
- vistas generadas desde la base;
- exportes humanos;
- documentación de instalación o visión.

Nunca deben decidir el estado real del trabajo.

---

## Qué es CAPA

Un CAPA es la especificación ejecutable de **un objetivo pequeño**.

No se hace un CAPA para un dominio completo.  
No se hace un CAPA para una visión completa.  
No se hace un CAPA para “arreglar todo”.

Un CAPA existe para un slice concreto:

```text
Corregir el contrato del panel
Agregar validación de una regla
Crear una pantalla específica
Reproducir y corregir un bug puntual
Refactorizar una función delimitada
```

La jerarquía mental es:

```text
ADR / Visión      = dirección amplia del dominio
PBI / Backlog    = unidad priorizada de trabajo
CAPA             = ejecución controlada de un objetivo pequeño
Transición       = un solo paso verificable dentro de ese CAPA
```

---

## Las cinco dimensiones

CAPA conserva su núcleo original:

### C — Contexto

Qué objetivo exacto se está atacando, qué historia lo justifica, qué reglas aplican, qué invariantes no pueden romperse y qué trampas conocidas existen.

### A — Alcance

Qué entra, qué no entra, qué archivos o rutas pueden tocarse y qué hallazgos deben convertirse en otro PBI en vez de corregirse dentro del actual.

### P — Progreso

Registro vivo de estados, comandos, resultados, duración, evidencia y bloqueos. El progreso no es decoración: gobierna qué falta y qué puede seguir.

### A — Aseguramiento

Cada invariante debe mapearse a una assertion, una prueba, una evidencia y un resultado verificable.

### P — Poder

Decisiones de arquitectura, producto o firma que gobiernan el cambio. Si una decisión bloquea, el agente no debe avanzar sin aprobación.

---

## Lo que CAPA no debe ser

CAPA no debe convertirse en burocracia.

Debe evitar:

- ADR por cada microtarea;
- plantillas largas que nadie valida;
- muchas Skills visibles compitiendo entre sí;
- documentos manuales que se desincronizan;
- dashboards bonitos sobre datos débiles;
- hooks agresivos antes de tener un motor estable;
- correcciones automáticas de fallos fuera del objetivo;
- tareas de “5 minutos” que el agente extiende sin freno.

CAPA debe reducir incertidumbre, no aumentar ceremonia.

---

## Comando único

La experiencia deseada para el usuario es simple:

```bash
/capa iniciar "Corregir contrato del panel"
/capa estado
/capa vamos con lo que sigue
/capa aprobar
/capa bloquear "motivo"
/capa backlog
/capa siguiente
/capa cerrar pbi
/capa cerrar sprint
/capa compactar
```

El usuario no debe tener que invocar manualmente fases internas como `evidence`, `gate`, `graphify`, `test` o `code-review`.

CAPA debe leer la base local y saber qué transición corresponde.

---

## One-step execution

`/capa vamos con lo que sigue` no significa “continúa hasta terminar”.

Significa:

```text
1. Leer el PBI activo desde SQLite.
2. Identificar current_state y next_state.
3. Ejecutar exactamente una transición.
4. Registrar progreso y evidencia.
5. Calcular el próximo estado.
6. Detenerse.
```

Ejemplo de salida esperada:

```text
CAPA STOP

PBI: Panel DB Contract
Estado ejecutado: DEPLOY_VERIFY
Resultado: OK
Evidencia: push verificado, contrato OK contra DB
Próximo estado: E2E_UI

No continúo hasta recibir:
/capa vamos con lo que sigue
```

Esta regla existe para evitar que el agente encadene tareas, dé vueltas o se vaya por las ramas.

---

## DB-first runtime

CAPA debe evolucionar a una arquitectura DB-first:

```text
.capa/
  capa.db              # fuente de verdad operativa
  schema.sql           # esquema local
  config.json          # budgets, límites y reglas
  bin/
    capa.py            # CLI / runtime principal
    capa_db.py         # repositorio único de persistencia
    capa_guard.py      # validaciones y bloqueos
    capa_git.py        # diff/status resumido
    capa_compact.py    # compactación de PBI/sprint/contexto
    capa_api.py        # API local para frontend
```

La DB debe guardar, como mínimo:

- backlog / PBIs;
- sprint actual;
- estado actual y próximo estado;
- progreso;
- alcance permitido;
- evidencia;
- hallazgos;
- decisiones;
- tests;
- code reviews;
- cierres de PBI;
- cierres de sprint;
- compactaciones.

---

## Markdown como vista, no como verdad

CAPA puede generar archivos como:

```text
HANDOFF.md
CONTEXT.md
BACKLOG.md
SPRINT_SUMMARY.md
ADR.md
```

Pero esos archivos son exportes, no gobierno.

Si hay conflicto entre `.capa/capa.db` y un Markdown, gana SQLite.

---

## Máquina de estados objetivo

CAPA debe avanzar por estados explícitos.

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
CLOSURE
DONE
BLOCKED
```

Estados opcionales:

```text
GRAPHIFY        # si se toca código existente
REPRODUCE       # si el PBI es bug
ROOT_CAUSE      # si hay fallo reproducido
LESSONS         # si hubo aprendizaje real
COMPACTED       # después de cierre / compactación
```

Regla dura:

```text
No existen transiciones libres.
```

CAPA no debe “deducir” creativamente qué sigue. Debe leerlo de la base.

---

## Presupuesto operativo

“Tareas de máximo 5 minutos” no debe ser una frase blanda.

Debe convertirse en presupuesto operativo:

```json
{
  "max_minutes": 5,
  "max_tool_calls": 8,
  "max_bash_commands": 4,
  "max_file_reads": 5,
  "max_file_edits": 2,
  "max_files_touched": 2,
  "max_git_diff_lines": 200,
  "allow_auto_fix": false
}
```

Si el presupuesto se agota, CAPA debe bloquear y registrar el motivo.

---

## Hallazgos fuera de alcance

Cuando el agente detecta un problema lateral, CAPA no debe permitir corrección automática.

Flujo correcto:

```text
1. Registrar hallazgo.
2. Clasificar si pertenece al PBI actual.
3. Si no pertenece, crear nuevo PBI.
4. Detenerse.
5. Esperar aprobación humana.
```

Ejemplo:

```text
Hallazgo: E2E UI falla por selector inestable
Pertenece al PBI actual: NO
Acción: nuevo PBI creado
Estado: PAUSED_FOR_USER
No se modificó código.
```

---

## Graphify

Graphify sigue siendo una pieza importante, pero no debe usarse como religión.

Regla:

```text
Si se va a tocar código existente, graphify es obligatorio antes de leer/grepear archivos crudos.
Si no hay código fuente involucrado, graphify no aplica.
```

Todo claim sobre código debe tener:

- nodo o símbolo;
- archivo;
- comando o evidencia reproducible;
- clasificación de confianza.

---

## Evidencia

Toda afirmación relevante debe clasificarse:

```text
VERIFIED
PARTIAL
ASSUMPTION
UNKNOWN
```

La evidencia puede ser de distintos tipos:

```text
code
build
test
log
graph
api
e2e-ui
screenshot
browser
git_diff
user_acceptance
```

CAPA debe bloquear claims críticos sin evidencia.

---

## Code Review

CAPA debe incorporar code review como fase interna, no como exploración abierta.

Reglas:

```text
- revisar solo el diff del PBI actual;
- no auditar todo el repositorio;
- no abrir archivos completos salvo necesidad justificada;
- máximo hallazgos relevantes;
- bloquear solo por bug, seguridad, regresión, incumplimiento de alcance o falta de evidencia;
- no convertir code review en refactor general.
```

Flujo:

```text
IMPLEMENT
BUILD
TEST
CODE_REVIEW
CLOSURE
```

---

## Hooks y guard

Las instrucciones no bastan. CAPA debe tener bloqueos reales.

`capa_guard` debe impedir, como mínimo:

- editar archivos si el estado no es `IMPLEMENT`;
- tocar archivos fuera del alcance aprobado;
- corregir fallos durante `BUILD`, `TEST` o `CODE_REVIEW` sin crear hallazgo y pedir aprobación;
- continuar si el presupuesto se agotó;
- cerrar un PBI sin build/test/code review/evidencia mínima;
- marcar `DONE` sin prueba API o E2E cuando aplique.

El objetivo no es pedirle al agente que se porte bien.  
El objetivo es que no pueda avanzar si viola CAPA.

---

## Frontend local

CAPA debe tener un frontend local para observar y controlar el backlog.

El frontend no gobierna CAPA.  
El frontend no escribe directo en SQLite.  
El frontend solo llama a una API local que usa el mismo runtime.

Arquitectura objetivo:

```text
Frontend local → CAPA API → CAPA Repository → SQLite
```

Pantallas mínimas:

- Dashboard;
- Backlog;
- PBI activo;
- línea de estados;
- evidencia;
- progreso;
- hallazgos;
- tests;
- code review;
- cierres de PBI/sprint.

Acciones permitidas:

```text
Crear PBI
Ver estado
Ejecutar siguiente transición one-step
Aprobar Gate
Bloquear PBI
Cerrar PBI
Cerrar Sprint
Compactar
```

No debe existir botón para saltar arbitrariamente a `IMPLEMENT`.

---

## Compactación

CAPA debe compactar por PBI y por sprint.

### Cerrar PBI

Debe guardar:

- qué se pidió;
- qué se hizo;
- archivos tocados;
- evidencia;
- tests;
- decisiones;
- code review;
- riesgos abiertos;
- lecciones aprendidas;
- próximos PBIs generados.

### Cerrar Sprint

Debe guardar:

- PBIs completados;
- PBIs bloqueados;
- PBIs movidos;
- riesgos recurrentes;
- deuda técnica detectada;
- decisiones relevantes;
- próximo foco.

La compactación existe para que el agente no tenga que releer conversaciones largas ni documentos enormes.

---

## Portabilidad Claude Code / Codex

CAPA no debe depender exclusivamente de Claude Code.

El core debe vivir en `.capa/` y ser invocable por terminal.

Claude Code y Codex deben ser adaptadores:

```text
Claude Code → /capa → .capa/bin/capa.py
Codex      → AGENTS.md → .capa/bin/capa.py
Humano     → terminal → .capa/bin/capa.py
```

La metodología no debe duplicarse en `CLAUDE.md`, `AGENTS.md` o `SKILL.md`.

Esos archivos solo deben decir cómo invocar el runtime y qué no se puede saltar.

---

## Estado actual del repositorio

Este repositorio ya contiene una primera versión de CAPA como CLI de dossier, graphify, doctor anti-teatro, panel y dashboard.

Esa versión es valiosa, pero su modelo actual es principalmente:

```text
manifest + markdown + git + graphify → dashboard SQLite derivado
```

El objetivo vNext es migrar hacia:

```text
SQLite operativo + runtime + guard + API + frontend → vistas/exportes regenerables
```

No se debe perder lo bueno de la versión actual:

- CAPA por objetivo;
- anclaje a graphify;
- doctor anti-teatro;
- reglas de evidencia;
- dashboard;
- gobernanza;
- panel de ejecución.

Pero debe corregirse el punto débil:

```text
Los archivos de documentación no deben gobernar el estado del agente.
```

---

## Roadmap vNext

### Fase 1 — DB-first mínimo

- Crear `.capa/schema.sql`.
- Crear `.capa/config.json`.
- Crear repositorio de persistencia único.
- Crear comandos `init`, `status`, `next --one-step`, `approve`, `block`, `backlog`.
- Migrar el concepto de PBI activo a SQLite.

### Fase 2 — Guard y presupuestos

- Bloquear edición fuera de `IMPLEMENT`.
- Bloquear archivos fuera de alcance.
- Registrar hallazgos fuera de alcance.
- Aplicar límites de tiempo, comandos, lecturas y ediciones.

### Fase 3 — Evidencia, tests y code review

- Registrar evidencia clasificada.
- Registrar build/test runs.
- Ejecutar code review solo sobre diff.
- Bloquear cierre sin evidencia suficiente.

### Fase 4 — API y frontend local

- Crear API local.
- Crear tablero visual.
- Mostrar backlog, progreso, evidencia, hallazgos y estado activo.
- Ejecutar acciones controladas desde UI.

### Fase 5 — Cierre y compactación

- Implementar `cerrar pbi`.
- Implementar `cerrar sprint`.
- Generar handoff/context/export desde DB.
- Reducir dependencia de archivos largos.

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
