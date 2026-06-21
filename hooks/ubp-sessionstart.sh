#!/usr/bin/env bash
# SessionStart hook — orientación UBP al abrir sesión (reemplaza al ubp-bootstrap muerto).
# Lee el cwd de la sesión por stdin; SOLO emite si la sesión está en el proyecto UBP.
# Deriva todo del código (rama + capa status + próximo paso del HANDOFF) — sin KB.
set -uo pipefail

BACKEND="/Volumes/Datos/Proyectos/BTW/BTW UBP/btw-ubp-backend"
CAPA="$HOME/.local/bin/capa"
INPUT="$(cat)"   # el harness pasa el JSON del hook (con cwd) por stdin

python3 - "$BACKEND" "$CAPA" "$INPUT" <<'PY'
import json, sys, subprocess, re, os

backend, capa, raw = sys.argv[1], sys.argv[2], sys.argv[3]

# 1. Scope: solo en el proyecto UBP (mira el cwd que el harness pasa).
try:
    data = json.loads(raw)
except Exception:
    data = {}
cwd = str(data.get("cwd", ""))
if "BTW UBP" not in cwd or not os.path.isdir(backend):
    sys.exit(0)

def run(cmd):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        return ""

branch = run(f'git -C "{backend}" rev-parse --abbrev-ref HEAD') or "?"
status = run(f'cd "{backend}" && "{capa}" status 2>/dev/null | head -8') or "(capa status no disponible)"

# Próximo paso: primera línea no vacía bajo "### Próximo paso" del último bloque del HANDOFF.
prox = ""
try:
    txt = open(os.path.join(backend, "docs", "HANDOFF.md")).read()
    m = re.search(r"###\s*Pr[oó]ximo paso[^\n]*\n+([^\n]+)", txt)
    prox = m.group(1).strip() if m else ""
except Exception:
    pass

ctx = (
    f"\U0001F4CC UBP · arranque de sesión (derivado del código, no de KB)\n"
    f"Rama: {branch}\n"
    f"Próximo paso (docs/HANDOFF.md): {prox or '(ver HANDOFF.md)'}\n\n"
    f"Estado CAPA (capa status):\n{status}\n\n"
    f"Para retomar: leé btw-ubp-backend/docs/HANDOFF.md + git log; "
    f"corré graphify update . si el grafo está viejo y capa doctor antes de cerrar. "
    f"El viejo /ubp-bootstrap está archivado (leía una KB inexistente)."
)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": ctx}}))
PY
