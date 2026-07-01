# CAPA

**CAPA** — Contexto · Alcance · Progreso · Aseguramiento.

CAPA es un runtime local para controlar trabajo asistido por agentes de IA en Claude Code, Codex u otras herramientas. Su objetivo no es generar más documentación, sino lograr trabajo pequeño, verificable, persistente y sin scope creep.

---

## Problema que CAPA busca resolver

Los agentes suelen fallar así:

- leen demasiado contexto;
- continúan más allá de lo pedido;
- corrigen hallazgos laterales sin aprobación;
- dan por hecho cosas sin evidencia;
- mezclan discovery, implementación, test y review en una sola corrida;
- usan Markdown o memoria de conversación como si fueran estado confiable.

CAPA existe para impedir eso con una regla central:

```text
Cada /capa ejecuta una sola transición, registra evidencia y se detiene.
```

---

## Principio rector

```text
Si no está en la base local de CAPA, no existe como estado operativo.
```

La fuente de verdad debe ser:

```text
.capa/capa.db
```

Markdown puede existir solo como vista, exporte o adaptador. Si hay conflicto entre SQLite y un `.md`, gana SQLite.

---

## Qué es un CAPA

Un CAPA es la ejecución controlada de **un objetivo pequeño**.

Ejemplos:

```text
Corregir contrato del panel
Agregar una validación puntual
Crear una pantalla específica
Reproducir y corregir un bug delimitado
Refactorizar una función concreta
```

Jerarquía:

```text
ADR / Visión      = dirección amplia
PBI / Backlog    = unidad priorizada de trabajo
CAPA             = ejecución controlada de un objetivo pequeño
Transición       = un solo paso verificable
```

---

## Las cuatro dimensiones CAPA

### C — Contexto

Objetivo exacto, historia, reglas, invariantes, dependencias y trampas conocidas.

### A — Alcance

Qué entra, qué no entra, qué rutas pueden tocarse y qué hallazgos deben convertirse en otro PBI.

### P — Progreso

Estados, comandos, resultados, duración, evidencia y bloqueos. El progreso gobierna qué falta y qué puede seguir.

### A — Aseguramiento

Cada invariante debe tener assertion, prueba, evidencia y resultado verificable.

---

## Gobernanza / Poder de decisión

Gobernanza no cambia el acrónimo. Es una capacidad transversal para decisiones que requieren aprobación.

Puede registrar:

- firma del PO;
- decisión de arquitectura;
- restricción de seguridad;
- aprobación para salir del alcance;
- autorización para corregir un hallazgo lateral.

---

## Comando único

La experiencia deseada para el usuario debe ser:

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

El usuario no debe invocar fases internas como `evidence`, `gate`, `graphify`, `test` o `code-review`. CAPA debe leer la DB y decidir la siguiente transición válida.

---

## One-step execution

`/capa vamos con lo que sigue` significa:

```text
1. Leer el PBI activo desde SQLite.
2. Identificar current_state y next_state.
3. Ejecutar exactamente una transición.
4. Registrar progreso y evidencia.
5. Calcular el próximo estado.
6. Detenerse.
```

Ejemplo:

```text
CAPA STOP

PBI: Panel DB Contract
Estado ejecutado: DEPLOY_VERIFY
Resultado: OK
Próximo estado: E2E_UI

No continúo hasta recibir:
/capa vamos con lo que sigue
```

---

## DB-first runtime objetivo

CAPA debe evolucionar hacia:

```text
.capa/
  capa.db              # fuente de verdad operativa
  schema.sql           # esquema local
  config.json          # budgets y reglas
  bin/
    capa.py            # CLI principal
    capa_db.py         # persistencia
    capa_guard.py      # validaciones
    capa_git.py        # diff/status resumido
    capa_compact.py    # compactación
    capa_api.py        # API local para frontend
```

La DB debe guardar:

- PBIs / backlog;
- sprint actual;
- estado actual y próximo estado;
- progreso;
- alcance permitido;
- evidencia;
- hallazgos;
- decisiones;
- tests;
- code reviews;
- cierres de PBI y sprint;
- compactaciones.

---

## Máquina de estados objetivo

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

---

## Presupuesto operativo

“Tareas de máximo 5 minutos” debe convertirse en presupuesto operativo:

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

Si el presupuesto se agota, CAPA registra el motivo y se detiene.

---

## Hallazgos fuera de alcance

Cuando el agente detecta un problema lateral:

```text
1. Registrar hallazgo.
2. Clasificar si pertenece al PBI actual.
3. Si no pertenece, crear nuevo PBI.
4. Detenerse.
5. Esperar aprobación humana.
```

No se corrige automáticamente lo que no pertenece al objetivo activo.

---

## Graphify

Regla:

```text
Si se va a tocar código existente, graphify es obligatorio antes de leer/grepear archivos crudos.
Si no hay código fuente involucrado, graphify no aplica.
```

Todo claim sobre código debe tener archivo, símbolo/nodo, comando o evidencia reproducible y clasificación de confianza.

---

## Evidencia

Clasificaciones:

```text
VERIFIED
PARTIAL
ASSUMPTION
UNKNOWN
```

Tipos de evidencia:

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

---

## Code Review

Code Review debe ser una fase interna, no una exploración abierta.

Reglas:

- revisar solo el diff del PBI activo;
- no auditar todo el repo;
- no abrir archivos completos sin motivo;
- no convertir review en refactor general;
- revisar contra alcance, tests, evidencia y riesgos del cambio.

---

## Frontend local

CAPA debe tener un frontend local para observar y controlar el backlog.

Arquitectura objetivo:

```text
Frontend local → CAPA API → CAPA Repository → SQLite
```

El frontend no escribe directo en SQLite y no salta estados. Solo dispara acciones válidas del runtime.

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

---

## Compactación

CAPA debe compactar por PBI y por sprint.

Cerrar PBI guarda qué se pidió, qué se hizo, evidencia, tests, decisiones, code review, riesgos, lecciones y próximos PBIs.

Cerrar sprint guarda PBIs completados, bloqueados, movidos, riesgos recurrentes, deuda técnica, decisiones relevantes y próximo foco.

---

## Portabilidad Claude Code / Codex

El core debe vivir en `.capa/` y ser invocable por terminal.

```text
Claude Code → /capa → .capa/bin/capa.py
Codex      → AGENTS.md → .capa/bin/capa.py
Humano     → terminal → .capa/bin/capa.py
```

La metodología no debe duplicarse en `CLAUDE.md`, `AGENTS.md` o `SKILL.md`. Esos archivos solo deben indicar cómo invocar el runtime.

---

## Estado actual y objetivo vNext

Este repositorio ya contiene una primera versión de CAPA como CLI de dossier, graphify, doctor anti-teatro, panel y dashboard.

Modelo actual:

```text
manifest + markdown + git + graphify → dashboard SQLite derivado
```

Objetivo vNext:

```text
SQLite operativo + runtime + guard + API + frontend → vistas/exportes regenerables
```

No se debe perder:

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

- Validar edición solo en el estado correcto.
- Validar archivos dentro de alcance.
- Registrar hallazgos fuera de alcance.
- Aplicar límites de tiempo, comandos, lecturas y ediciones.

### Fase 3 — Evidencia, tests y code review

- Registrar evidencia clasificada.
- Registrar build/test runs.
- Ejecutar code review solo sobre diff.
- Impedir cierre sin evidencia suficiente.

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
