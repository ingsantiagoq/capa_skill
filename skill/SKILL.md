---
name: capa
description: Aterriza UN objetivo/iteración/módulo en un CAPA (Contexto·Alcance·Progreso·Aseguramiento·Poder) tan detallado que no le deja imaginación al agente, anclado al código vía graphify y verificado adversarialmente. Use cuando el usuario diga 'arranquemos X', 'documentá este objetivo con CAPA', 'creá el CAPA de <iteración>', 'qué sigue en <ADR>', o antes de codear cualquier paso. Un ADR es la visión; cada objetivo es 1 CAPA.
---

# CAPA — aterrizar un objetivo sin dejar imaginación al agente

> **Jerarquía.** Un **ADR = la visión** de un dominio (todo lo que queremos). Cada **iteración / módulo /
> objetivo = 1 CAPA**: la especificación de UN paso, tan detallada que el agente no improvisa nada.
> La fuente única de verdad es el código; CAPA lo aterriza y lo ancla (anti-teatro · ADR-0017).

## Runtime único (no confundir)

**En UBP CAPA corre sobre MANIFESTS, no sobre la máquina de 12 nodos.**
- **Motor real:** `capa/ADR-*/<objetivo>/manifest.json` — `lifecycle` (wip/done) + `status` de **dos ejes**
  (`decision`: PROPUESTA/ACEPTADA · `implementation`: NONE/PARTIAL/E2E-VERIFIED) + 5 `dimensions` + `evidence[]` + `decisions[]`.
- **Gate real:** `capa doctor` (E4 anclas · E9 evidencia · E12 palanca · E13 dossier…).
- **Tablero:** `capa dashboard` → `capa-out/dashboard.html` (estático; único; nunca fabricar HTML a mano).
- ⚠️ La máquina de estados `NEW→…→DONE` con `capa go`/`.capa/capa.db` es el **runtime alfa del smoke** — **NO se usa en UBP**. No dirijas objetivos por ahí.

## Reglas operativas (obligatorias)

- **Trabajar A TRAVÉS de CAPA, no alrededor.** El hilo vive en `capa status`/`doctor`/manifest desde el arranque — **NO** en un todo-list del harness (`TaskCreate`). Descubrir afuera está bien; **entregar afuera, no**.
- **Una duda a la vez**; no avanzar sin cerrar la previa.
- Cada slice sale con **código + pruebas mínimas + ejemplos Swagger** en el mismo PR.
- **Progreso con evidencia** reproducible. Cobertura incremental 20→40→60→80.
- **Sello anti-teatro:** todo claim cita un nodo graphify (existe) + un comando (corre verde). Si falta → MODO BLOQUEO.
- **Si `capa doctor` bloquea → PARAR.** No rodear el guard, no maquillar el eje. Se arregla la causa o se declara PARTIAL honesto.

## Arranque OBLIGATORIO de sesión (antes de tocar nada)

Sin esto no hay edición. Es el gate que impide "confío que usás CAPA y no hacés nada":
1. `graphify update .` (desde `btw-ubp-backend/`) — orienta y evita anclas fantasma.
2. `capa status` + `capa doctor` — ver estado real y bloqueos vivos.
3. **Nombrar el objetivo** al que pertenece TODO lo que voy a hacer (buscar el existente en `capa/ADR-*/` antes de crear).
   Ningún `Edit`/`Write` fuera del `route` de un objetivo declarado.

## Los 7 pasos del objetivo (en orden, una transición a la vez)

Cada paso cierra con su comando+gate antes del siguiente:

1. **DISCOVERY** — orientar con graphify; registrar evidencia si útil. No editar.
2. **PLAN/PANEL** — proponer el panel de expertos (lentes: dominio, fiscal, DBA, seguridad, frontend…) y confirmar. Plan mínimo. No editar.
3. **SCOPE** — `capa new <ADR> --objetivo <slug> --route <paths>` + `capa thread` (hila dependencias entrantes/salientes). Define el `route`; nada se edita fuera de él.
4. **IMPLEMENT** — editar SOLO paths del `route`, tras pasar el edit-guard. Cada dimensión redactada citando `node id` (graphify), nunca lectura cruda.
5. **TEST** — correr/registrar tests + evidencia que **EJERCITA** (`kind: api`/`e2e-ui` cuentan para E2E; `gate`/`integration`/`unit` NO).
6. **CODE_REVIEW** — verificación adversarial (`backend-reviewer`/`frontend-reviewer`) refuta cada claim; lo que no sobrevive baja el eje (E2E-VERIFIED→PARTIAL→NONE).
7. **DONE** — `capa doctor --adr <ADR>` verde (0 bloqueos) + gate `/ubp-validate-story`. Recién ahí se cierra el PR.

## Las 5 dimensiones (se llenan en IMPLEMENT, ancladas a graphify)

Esqueleto vacío = bloqueo E13. Cada experto redacta la suya citando `node id`:
- **CONTEXTO** — el paso exacto (secuencia numerada), la invariante numérica, reglas 1.6, trampas conocidas.
- **ALCANCE** — slices exactos de ESTE objetivo; lo demás va a §exclusiones (no "que el agente complete").
- **PROGRESO** — tabla viva; cada fila un comando reproducible (`manifest.evidence[]`).
- **ASEGURAMIENTO** — invariante → assertion exacta → test → ancla; estado 2-ejes.
- **PODER** — decisiones de firma que gobiernan este paso (`manifest.decisions[]`).

## Cierre TERSO — mold obligatorio (campos de Codex, en este orden)

Toda entrega se reporta así. NO párrafos narrativos:
1. **Objetivo:** aterrizar `<slug>` (una frase).
2. **Lecciones que aplican:** L0xx/L0yy — reglas concretas del paso.
3. **Veredicto:** GO | PARTIAL | NONE + estado de implementación.
4. **Quedó definido:** bullets de decisiones de diseño.
5. **Validación:** `capa thread` (N nodos/M aristas) · `capa doctor` (objetivo OK, 0 bloqueos) · `git diff --check` (limpio) · Rama · estado commit/push.
6. **Dossier:** link al CAPA (`capa/ADR-*/<slug>`).
7. **Falta una firma de diseño:** `D-<slug>` — decisión PODER pendiente (si aplica).

## El equipo (skills/agentes que ejecutan cada CAPA)

CAPA orquesta; estas skills hacen el trabajo. Encadenalas según el objetivo:
- **`new-microservice` / `new-entity` / `new-proto`** — backend del slice (ADR-0002, gRPC-only).
- **`new-page` / `frontend-angular`** — el Contrato Front del objetivo.
- **Diseño (CAPA de front · obligatorio · E10):** `emil-design-eng` · `impeccable` · `design-taste-frontend`.
  Un CAPA `frontend:true` DEBE invocarlas; `capa doctor` bloquea si no se declaran.
- **`backend-reviewer` / `frontend-reviewer`** — la verificación adversarial del paso 6.
- **`ubp-validate-story` / `ubp-sonar-check`** — el gate de calidad antes de cerrar.

## Anti-patrones (no hacer)

- ❌ Decir "usé CAPA" sin manifest tocado, sin doctor, con cierre narrativo. Eso es trabajar **alrededor**.
- ❌ Conducir el avance con `TaskCreate`/todo-list del harness — pista paralela que compite con CAPA.
- ❌ Un CAPA por ADR. Es por **objetivo**. El ADR es la visión.
- ❌ Documentar el dominio entero en un CAPA. Un paso, al extremo.
- ❌ Escribir prosa sin ancla a código, o marcar verde sin comando.
- ❌ Leer archivos crudos antes de orientarte con graphify (y de hilar la ruta con `capa thread`).
- ❌ Dirigir objetivos por el runtime de 12 nodos (`capa go`) en UBP.
