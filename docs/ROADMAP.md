# ROADMAP

Estado actual: **7/10**  
Objetivo: **10/10**

---

## Alcance del producto

CAPA es un runtime local, DB-first y verificable para controlar trabajo asistido por agentes y cualquier superficie operada por LLMs. La fuente de verdad operativa vive en SQLite, no en el chat ni en archivos Markdown.

---

## Qué ya está hecho

- Runtime local con SQLite como fuente de verdad.
- Backlog, PBI activo y ejecución de una transición por vez.
- Guard de edición y scope aprobado.
- Registro de findings, evidencia, tests y reviews.
- Cierre de PBI y cierre de sprint.
- API local y dashboard local.
- Adaptadores iniciales para superficies usadas por agentes.

---

## Qué falta para llegar a 10/10

### 1) Hook/adaptador agnóstico del proveedor

Endurecer el punto de integración para que funcione con cualquier LLM y no quede acoplado a Codex, Claude u otra superficie concreta.

### 2) Presupuesto por transición

Limitar y registrar explícitamente:

- archivos leídos;
- archivos editados;
- comandos ejecutados;
- tamaño del diff.

### 3) Separación de legacy

Ocultar, aislar o retirar comandos legacy para que la experiencia principal sea corta, obvia y segura.

### 4) Validación en repos reales

Probar CAPA en varios repos y registrar:

- fricciones de adopción;
- falsos bloqueos;
- huecos de scope;
- fallas del guard;
- evidencia de cierre.

### 5) Onboarding de agentes

Reducir el costo de entrada para que un agente entienda:

- qué puede hacer;
- cuándo debe detenerse;
- cómo registrar evidencia;
- cómo cerrar una transición sin improvisar.

### 6) Export/handoff desde SQLite

Permitir reconstruir el estado operativo desde `.capa/capa.db` en formatos útiles para continuidad, auditoría y transferencia entre sesiones.

---

## PRs o slices esperados

- PR 1: hook/adaptador agnóstico del proveedor.
- PR 2: presupuesto por transición.
- PR 3: limpieza y aislamiento de legacy.
- PR 4: pruebas en repos reales y ajuste de guardrails.
- PR 5: onboarding y handoff/export desde SQLite.

---

## Criterios de aceptación para declarar CAPA estable

CAPA puede declararse estable cuando:

- el flujo principal funciona con cualquier superficie operada por LLMs;
- cada transición tiene presupuesto y guardrails claros;
- no hay dependencia operativa en Markdown para conocer el estado;
- el estado puede exportarse o transferirse desde SQLite;
- el runtime fue probado en repos reales con evidencia suficiente;
- onboarding, test y review permiten cerrar PBIs sin improvisación.
