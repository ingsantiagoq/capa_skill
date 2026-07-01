#!/usr/bin/env bash
# UserPromptSubmit hook — inyecta gate CAPA + lecciones aprendidas en CADA mensaje.
# Guardado: solo dispara dentro del proyecto UBP (no contamina otros proyectos).
set -uo pipefail

# Guard: solo UBP (capa.config.json o graphify-out presentes)
if [ ! -f btw-ubp-backend/capa.config.json ] && [ ! -f capa.config.json ] && [ ! -f graphify-out/graph.json ]; then
  exit 0
fi

python3 - <<'PY' 2>/dev/null || true
import json, os

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
    "7) Al cerrar, appendeá la causa raíz a btw-ubp-backend/docs/LECCIONES-APRENDIDAS.md.\n"
    "Si el mensaje es trivial (saludo/confirmación/pregunta corta), respondé directo sin ceremonia."
)

lessons = ""
for p in ("btw-ubp-backend/docs/LECCIONES-APRENDIDAS.md", "docs/LECCIONES-APRENDIDAS.md"):
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            lessons = f.read()[:6000]
        break

ctx = gate
if lessons:
    ctx += "\n\n=== LECCIONES APRENDIDAS — consultá antes del veredicto, no repetir ===\n" + lessons

print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": ctx}}))
PY
