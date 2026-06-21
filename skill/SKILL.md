---
name: capa
description: Aterriza UN objetivo/iteración/módulo en un CAPA (Contexto·Alcance·Progreso·Aseguramiento·Poder) tan detallado que no le deja imaginación al agente, anclado al código vía graphify y verificado adversarialmente. Use cuando el usuario diga 'arranquemos X', 'documentá este objetivo con CAPA', 'creá el CAPA de <iteración>', 'qué sigue en <ADR>', o antes de codear cualquier paso. Un ADR es la visión; cada objetivo es 1 CAPA.
---

# CAPA — aterrizar un objetivo sin dejar imaginación al agente

> **Jerarquía.** Un **ADR = la visión** de un dominio (todo lo que queremos). Cada **iteración / módulo /
> objetivo = 1 CAPA**: la especificación de UN paso, tan detallada que el agente no improvisa nada.
> La fuente única de verdad es el código; CAPA lo aterriza y lo ancla (anti-teatro · ADR-0017).

## Reglas operativas (obligatorias)

- **Una duda a la vez**; no avanzar sin cerrar la previa.
- Cada slice sale con **código + pruebas mínimas + ejemplos Swagger** en el mismo PR.
- **Progreso con evidencia** reproducible. Cobertura incremental 20→40→60→80.
- **Sello anti-teatro:** todo claim cita un nodo graphify (existe) + un comando (corre verde). Si falta → MODO BLOQUEO.

## Flujo cuando te invocan (en este orden, una cosa a la vez)

### 1. Preguntar QUÉ se quiere hacer
Pedí el **objetivo concreto** (no el dominio entero): "¿qué paso aterrizamos?". Identificá a qué **ADR-visión**
pertenece (o proponé crearla con `capa vision`). Confirmá el objetivo en una frase antes de seguir.

### 2. Armar el PANEL de expertos
Proponé al usuario el panel para ESTE objetivo (qué lentes: dominio, costeo, fiscal, DBA, seguridad,
frontend…) y **pedí confirmación**. El panel define el "qué y cómo" al detalle. Comando base: `capa panel <ADR> --objetivo <slug> --json`.

### 3. Crear el CAPA y activar graphify sobre la ruta
- `capa new <ADR> --objetivo <slug> --route <paths>` (la ruta = carpetas que toca el objetivo).
- `capa thread <ADR> --objetivo <slug>` → activa graphify sobre la ruta e **hila las dependencias**
  (entrantes/salientes). Cada "depende de" debe ser un ancla declarada o un CAPA previo. Eso fuerza coherencia.

### 4. Documentar al EXTREMO (el panel redacta, anclado a graphify)
Cada experto redacta SU dimensión citando `node id` (`graphify explain/query`), nunca lectura cruda:
- **CONTEXTO** — el paso exacto (secuencia numerada), la invariante numérica, reglas 1.6, las trampas conocidas.
- **ALCANCE** — slices exactos de ESTE objetivo; lo demás va a §exclusiones (no "que el agente complete").
- **PROGRESO** — tabla viva; cada fila un comando reproducible (`manifest.evidence[]`).
- **ASEGURAMIENTO** — invariante → assertion exacta → test → ancla; estado 2-ejes.
- **PODER** — decisiones de firma que gobiernan este paso (`manifest.decisions[]`).

### 5. Verificación adversarial + gate
- Verificador (reusar `backend-reviewer`/`frontend-reviewer`): refuta cada claim contra el código. Lo que no
  sobrevive baja el eje (E2E-VERIFIED→PARTIAL→NONE).
- Gate: `capa doctor --adr <ADR>` verde (0 bloqueos). Si rojo, no se cierra el PR.

## El equipo (skills/agentes que ejecutan cada CAPA)

CAPA orquesta; estas skills hacen el trabajo. Encadenalas según el objetivo:
- **`ubp-bootstrap`** — cargar estado al arrancar la sesión.
- **`new-microservice` / `new-entity` / `new-proto`** — backend del slice (ADR-0002, gRPC-only).
- **`new-page` / `frontend-angular`** — el Contrato Front del objetivo.
- **Diseño (CAPA de front · obligatorio · E10):** `emil-design-eng` (polish/animación · Emil Kowalski) ·
  `impeccable` (audit/critique/polish · 23 comandos) · `design-taste-frontend` (dirección de diseño anti-slop).
  Un CAPA `frontend:true` DEBE invocarlas para la apariencia completa; `capa doctor` bloquea si no se declaran.
- **`backend-reviewer` / `frontend-reviewer`** — la verificación adversarial del paso 5.
- **`ubp-validate-story` / `ubp-sonar-check`** — el gate de calidad antes de cerrar.
- **`ubp-handoff`** — entregar el CAPA cerrado a la próxima sesión (git + resumen, sin KB).

## Anti-patrones (no hacer)

- ❌ Un CAPA por ADR. Es por **objetivo**. El ADR es la visión.
- ❌ Documentar el dominio entero en un CAPA. Un paso, al extremo.
- ❌ Escribir prosa sin ancla a código, o marcar verde sin comando.
- ❌ Leer archivos crudos antes de orientarte con graphify (y de hilar la ruta con `capa thread`).
