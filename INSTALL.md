# Instalación en un PC nuevo — stack completo (CAPA + graphify + skills)

Esta guía deja un PC nuevo con **todo el stack de trabajo asistido por agentes**:
el CLI **CAPA**, **graphify** (grafo de código, dependencia dura de CAPA), las
**11 skills globales** de Claude Code, y los **hooks** que fuerzan el flujo.

> Fuente única: este repo (`capa_skill`). Un solo `git clone` trae CAPA **y** las
> skills. graphify se instala aparte (vive en otro repo, es un paquete Python).

---

## 0. Qué se instala y dónde queda

| Pieza | Origen | Dónde queda en el PC nuevo |
| --- | --- | --- |
| **CAPA** (`capa`, `capa-go`, `capa-agent-edit-guard`) | este repo → `npm link` | binario en `~/.local/bin/` (o el prefix de npm), código donde clonaste |
| **graphify** | `pipx` desde GitHub | `~/.local/bin/graphify` |
| **Skills globales** (11) | este repo → `skills-global/` | `~/.claude/skills/` |
| **Hooks** (graphify + CAPA) | este repo → `hooks/` + `~/.claude/settings.json` | `~/.claude/settings.json` referencia `<REPO>/hooks/` |

Las 11 skills: `capa`, `caveman`, `design-taste-frontend`, `emil-design-eng`,
`frontend-angular`, `impeccable`, `review-animations`, `new-entity`,
`new-microservice`, `new-page`, `new-proto`.

---

## 1. Requisitos

```text
git
Node.js >= 18        (probado en v24)
npm
Python 3             (para pipx y para los hooks)
pipx                 (python3 -m pip install --user pipx && pipx ensurepath)
```

Verificá:

```bash
git --version && node -v && npm -v && python3 --version && pipx --version
```

---

## 2. graphify (primero — CAPA lo necesita)

graphify vive en su propio repo y se instala como CLI con `pipx`:

```bash
pipx install "git+https://github.com/safishamsi/graphify.git@v8"
graphify --version   # esperado: 0.8.x
```

> Si la URL de graphify cambió, ajustá el `git+https://...@v8` de arriba.

---

## 3. CAPA

```bash
# Elegí una carpeta base para los repos de BTW, p.ej.:
mkdir -p ~/Proyectos/BTW && cd ~/Proyectos/BTW

git clone https://github.com/ingsantiagoq/capa_skill.git
cd capa_skill
npm install
npm link            # publica capa / capa-go / capa-agent-edit-guard en el PATH
```

> ⚠️ Si el repo de CAPA se movió a otra URL (p.ej. Azure DevOps de BTW),
> reemplazá la URL del `git clone`. El resto no cambia.

Validá:

```bash
capa version
npm test            # smoke completo (better-sqlite3 debe compilar en Node >=18)
```

---

## 4. Skills globales de Claude Code

Vienen dentro de este repo, en `skills-global/`. Copialas al directorio global
de Claude Code:

```bash
mkdir -p ~/.claude/skills
cp -R skills-global/* ~/.claude/skills/
ls ~/.claude/skills/   # deben aparecer las 11
```

> Las skills del **proyecto UBP** (`ubp-validate-story`, `ubp-sonar-check`,
> `ubp-legacy-form-to-story`) **no** se copian acá: viven dentro del repo de UBP
> en `BTW UBP/.claude/skills/` y llegan al clonar UBP.

---

## 5. Hooks (graphify + CAPA) en `~/.claude/settings.json`

Los hooks hacen dos cosas: (a) obligan a consultar **graphify** antes de
grep/read cuando existe `graphify-out/graph.json`, y (b) inyectan estado de CAPA
al iniciar sesión y en cada prompt.

Pegá este bloque `hooks` en `~/.claude/settings.json` (fusionalo si el archivo
ya tiene otras claves). **Reemplazá `<REPO>` por la ruta absoluta real donde
clonaste este repo** (p.ej. `/Users/tu-usuario/Proyectos/BTW/capa_skill`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "CMD=$(python3 -c \"import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',d).get('command',''))\" 2>/dev/null || true); case \"$CMD\" in *grep*|*rg\\ *|*ripgrep*|*find\\ *|*fd\\ *|*ack\\ *|*ag\\ *)   [ -f graphify-out/graph.json ] &&   echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"MANDATORY: graphify-out/graph.json exists. You MUST run `graphify query \\\"<question>\\\"` before grepping raw files. Only grep after graphify has oriented you, or to modify/debug specific lines.\"}}'   || true ;; esac"
          }
        ]
      },
      {
        "matcher": "Read|Glob",
        "hooks": [
          {
            "type": "command",
            "command": "HIT=$(python3 -c \"import json,sys;d=json.load(sys.stdin);t=d.get('tool_input',d);s=(str(t.get('file_path') or '')+' '+str(t.get('pattern') or '')+' '+str(t.get('path') or '')).lower().replace(chr(92),'/');exts=('.py','.js','.ts','.tsx','.jsx','.go','.rs','.java','.rb','.c','.h','.cpp','.hpp','.cc','.cs','.kt','.swift','.php','.scala','.lua','.sh','.md','.rst','.txt','.mdx');sys.stdout.write('1' if 'graphify-out/' not in s and any(e in s for e in exts) else '')\" 2>/dev/null || true); if [ \"$HIT\" = 1 ] && [ -f graphify-out/graph.json ]; then echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"MANDATORY: graphify-out/graph.json exists. You MUST run graphify before reading source files. Use: `graphify query \\\"<question>\\\"` (scoped subgraph), `graphify explain \\\"<concept>\\\"`, or `graphify path \\\"<A>\\\" \\\"<B>\\\"`. Only read raw files after graphify has oriented you, or to modify/debug specific lines. This rule applies to subagents too — include it in every subagent prompt involving code exploration.\"}}'; fi || true"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "<REPO>/hooks/ubp-sessionstart.sh" }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "<REPO>/hooks/ubp-userprompt-capa.sh" }
        ]
      }
    ]
  }
}
```

> 🐞 **Corregido respecto a la Mac original:** allí los hooks apuntaban a una
> ruta inexistente (`.../capa-cli/hooks/...`). La ruta correcta es la de **este
> repo** (`capa_skill`) → usá `<REPO>/hooks/...`.

### 5.1 Ajuste obligatorio del hook de sesión

`hooks/ubp-sessionstart.sh` tiene **hardcodeada la ruta del backend de UBP**.
Editá esa línea para que apunte a donde clonaste UBP en el PC nuevo:

```sh
# hooks/ubp-sessionstart.sh
BACKEND="/ruta/en/este/PC/BTW UBP/btw-ubp-backend"
```

(La ruta al binario `capa` en ese script ya es portable: usa `$HOME/.local/bin/capa`.)

Dales permiso de ejecución:

```bash
chmod +x hooks/ubp-sessionstart.sh hooks/ubp-userprompt-capa.sh
```

---

## 6. Verificación de punta a punta

```bash
capa version                       # CAPA en el PATH
graphify --version                 # graphify en el PATH
ls ~/.claude/skills/ | wc -l       # 11 skills
```

En un repo con UBP clonado, generá el grafo y probá el gate:

```bash
cd "<ruta>/BTW UBP/btw-ubp-backend"
graphify update .                  # crea graphify-out/graph.json
capa status
capa doctor                        # exige graphify-out/graph.json (paso anterior)
```

Abrí una sesión nueva de Claude Code: el hook `SessionStart` debe inyectar el
estado de CAPA. Si no aparece, revisá la ruta `<REPO>` del settings.json y los
permisos `chmod +x`.

---

## 7. Rutas que dependen de la máquina (checklist)

Todo lo demás es portable; solo estas rutas absolutas cambian por PC:

- [ ] `~/.claude/settings.json` → `<REPO>/hooks/...` (ruta real del clone de `capa_skill`)
- [ ] `hooks/ubp-sessionstart.sh` → `BACKEND=...` (ruta real del backend de UBP)
- [ ] URL del `git clone` de CAPA (§3) si el repo se movió
- [ ] URL de graphify (§2) si cambió el remote/tag

---

## 8. Resumen ultra-corto (para quien ya sabe)

```bash
pipx install "git+https://github.com/safishamsi/graphify.git@v8"
git clone https://github.com/ingsantiagoq/capa_skill.git && cd capa_skill
npm install && npm link && npm test
mkdir -p ~/.claude/skills && cp -R skills-global/* ~/.claude/skills/
chmod +x hooks/*.sh
# editar ~/.claude/settings.json (bloque hooks, <REPO>) y hooks/ubp-sessionstart.sh (BACKEND)
```
