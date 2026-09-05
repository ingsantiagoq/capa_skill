#!/usr/bin/env bash
# UserPromptSubmit hook — inyecta gate CAPA + lecciones aprendidas en CADA mensaje.
# Guardado: solo dispara dentro del proyecto UBP (no contamina otros proyectos).
#
# Lecciones (2026-09-05): el monolito docs/LECCIONES-APRENDIDAS.md quedó CONGELADO (cuatro colisiones
# de numeración en un día entre sesiones que appendeaban al mismo archivo). Las nuevas viven UNA por
# archivo en docs/lecciones/L-XXX-<slug>.md y se reclaman con tools/lecciones-next.sh --claim <slug>.
# Este hook inyecta el monolito (recortado) Y las lecciones por archivo, ordenadas por número.
set -uo pipefail

# Guard: solo UBP (capa.config.json o graphify-out presentes)
if [ ! -f btw-ubp-backend/capa.config.json ] && [ ! -f capa.config.json ] && [ ! -f graphify-out/graph.json ]; then
  exit 0
fi

python3 - <<'PY' 2>/dev/null || true
import glob, json, os, re

gate = (
    "⛔ GATE CAPA OBLIGATORIO.\n"
    "ROL: vos sos PO + Scrum Master; el usuario es el Usuario Final que trae necesidades EN BRUTO "
    "(vagas, incompletas, está bien). NO ejecutes su mensaje literal. Entrevistalo como PO: ¿PARA QUÉ? "
    "(qué logra) y ¿POR QUÉ? (qué dolor resuelve); si hace falta, ¿quién lo usa? y ¿cómo sabremos que sirve? "
    "(criterio de aceptación). Con eso VOS armás el cuerpo (Historia: Como <rol> quiero <qué> para <para qué> "
    "+ Criterios de Aceptación + objetivo acotado + ADR-visión) → eso es lo que CAPA consume. Recién con el "
    "cuerpo confirmado por el usuario, CAPA aterriza y se codea.\n"
    "1) Panel de viabilidad INLINE primero (3 líneas): Objetivo: / Lecciones que aplican: / "
    "Veredicto: GO · GO-con-riesgos · NO-VA.\n"
    "2) Ante mensaje vago: NO inventes — entrevistá como PO (una pregunta corta a la vez) para acotar a UN objetivo. "
    "No tocar código hasta tener el cuerpo.\n"
    "3) graphify ANTES de leer/grep.\n"
    "4) Si cambiás código: aterrizalo en un CAPA (Contexto·Alcance·Progreso·Aseguramiento·Poder) anclado a nodos "
    "del grafo; pasos ≤5 min con checkpoint y reporte entre cada uno.\n"
    "5) Alcance CERRADO: SOLO el objetivo; lo demás a §exclusiones (anti scope-creep).\n"
    "6) PROHIBIDO agentes largos (>5 min) y hot-patch fuera de CAPA. Evidencia = nodo + comando verde, o BLOQUEO.\n"
    "7) Al cerrar, creá la lección con tools/lecciones-next.sh --claim <slug> en docs/lecciones/ "
    "(btw-ubp-backend; UNA por archivo, el número lo da el script). NO appendear a "
    "docs/LECCIONES-APRENDIDAS.md: está congelado.\n"
    "Si el mensaje es trivial (saludo/confirmación/pregunta corta), respondé directo sin ceremonia."
)

MONOLITH_BUDGET = 6000    # el monolito histórico entra recortado (7k líneas no caben en cada prompt)
LESSONS_BUDGET = 16000    # docs/lecciones/: si no entran todas, se quedan las de número MÁS ALTO


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def lesson_number(path):
    m = re.search(r"L-(\d+)", os.path.basename(path))
    return int(m.group(1)) if m else 0


base = next(
    (b for b in ("btw-ubp-backend", ".")
     if os.path.exists(os.path.join(b, "docs/LECCIONES-APRENDIDAS.md"))
     or os.path.isdir(os.path.join(b, "docs/lecciones"))),
    None,
)

lessons = ""
if base:
    monolith = os.path.join(base, "docs/LECCIONES-APRENDIDAS.md")
    if os.path.exists(monolith):
        lessons = read(monolith)[:MONOLITH_BUDGET]
    files = sorted(glob.glob(os.path.join(base, "docs/lecciones/L-*.md")), key=lesson_number)
    chunks = [read(p).strip() for p in files]
    chunks = [c for c in chunks if c]
    while chunks and sum(len(c) + 2 for c in chunks) > LESSONS_BUDGET:
        chunks.pop(0)  # se descarta la más vieja: la trampa reciente es la que muerde
    if chunks:
        lessons += (
            "\n\n=== docs/lecciones/ — una lección por archivo (las más recientes; "
            "nueva = tools/lecciones-next.sh --claim <slug>) ===\n" + "\n\n".join(chunks)
        )

ctx = gate
if lessons:
    ctx += "\n\n=== LECCIONES APRENDIDAS — consultá antes del veredicto, no repetir ===\n" + lessons

print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": ctx}}))
PY
