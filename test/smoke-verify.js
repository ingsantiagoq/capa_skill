'use strict';

// `capa verify` — la evidencia dice CUÁNDO y contra QUÉ COMMIT pasó.
//
// El test que importa es T2: romper un comando a propósito TIENE que dar rojo. Si al romperlo el
// estado sigue verde, el verbo no ejecuta — adorna — y habríamos construido un sello de goma con
// timestamp, que es peor que no tener fecha porque parece verificación.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const binPath = path.join(root, 'bin', 'capa.js');

// Repo CAPA de juguete, con git de verdad: `capa verify` graba el commit contra el que corrió y la
// distancia hasta HEAD, y eso no se puede simular sin un árbol versionado.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-verify-'));
const dbPath = path.join(tmp, '.capa', 'capa.db');
const objetivoDir = path.join(tmp, 'capa', 'ADR-0004-operacion-y-plataforma', 'un-objetivo-de-prueba');

function git(...args) {
  execFileSync('git', ['-C', tmp, ...args], { encoding: 'utf8', stdio: 'pipe' });
}

function capa(args, opts = {}) {
  const res = spawnSync(process.execPath, [binPath, ...args], {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, CAPA_DB_PATH: dbPath, NO_COLOR: '1' },
  });
  if (!opts.allowFailure && res.status !== 0) {
    throw new Error(`capa ${args.join(' ')} salió ${res.status}\n${res.stdout}\n${res.stderr}`);
  }
  return { out: `${res.stdout}${res.stderr}`, status: res.status };
}

function writeManifest(commands) {
  fs.mkdirSync(objetivoDir, { recursive: true });
  fs.writeFileSync(path.join(objetivoDir, 'manifest.json'), JSON.stringify({
    parentAdr: 'ADR-0004',
    objetivo: 'un-objetivo-de-prueba',
    title: 'Un objetivo de prueba',
    lifecycle: 'wip',
    status: { decision: 'PROPUESTA', implementation: 'NONE', verified_against: null },
    route: [],
    evidence: commands.map((command, i) => ({ claim: `claim ${i + 1}`, command, expect: 'exit 0' })),
  }, null, 2));
}

fs.mkdirSync(path.join(tmp, 'capa'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'capa.config.json'), JSON.stringify({ dossierDir: 'capa' }, null, 2));
git('init', '-q');
git('config', 'user.email', 'smoke@example.com');
git('config', 'user.name', 'smoke');
git('add', '-A');
git('commit', '-qm', 'base');

// ── T3 · sin evidencia ejecutable NO se escribe ninguna corrida ────────────────────────────────
// Un objetivo sin comandos no queda verde por no haber fallado: queda sin corrida.
writeManifest([]);
const vacio = capa(['verify', 'ADR-0004', '--objetivo', 'un-objetivo-de-prueba']);
assert.match(vacio.out, /sin evidencia ejecutable/);
const sinCorrida = capa(['verify', 'ADR-0004', '--objetivo', 'un-objetivo-de-prueba', '--status']);
assert.doesNotMatch(sinCorrida.out, /verde/i, 'un objetivo sin comandos no puede figurar verde');

// ── T1 · ejecuta y registra fecha + commit ─────────────────────────────────────────────────────
writeManifest(['true']);
const verde = capa(['verify', 'ADR-0004', '--objetivo', 'un-objetivo-de-prueba']);
assert.match(verde.out, /VERDE/);

const estado = capa(['verify', 'ADR-0004', '--objetivo', 'un-objetivo-de-prueba', '--status']);
assert.match(estado.out, /verde/);
assert.match(estado.out, /\d{4}-\d{2}-\d{2}T/, 'la corrida tiene que registrar la fecha');

// ── T6 · la tabla llega a un repo cuyo .capa/schema.sql es VIEJO (10 tablas) ───────────────────
// db.js:ensureSchema() copia el esquema del paquete una sola vez. Los cuatro repos CAPA reales ya
// tienen su copia congelada: sin el arreglo, la tabla nueva no llega a ninguno.
{
  const schemaLocal = path.join(tmp, '.capa', 'schema.sql');
  const empaquetado = fs.readFileSync(path.join(root, '.capa', 'schema.sql'), 'utf8');
  const viejo = empaquetado.replace(/-- Corridas de la evidencia[\s\S]*?\);\n/, '');
  assert.ok(!/capa_evidence_runs/.test(viejo.split('CREATE INDEX')[0]), 'el esquema viejo no debe traer la tabla');
  fs.writeFileSync(schemaLocal, viejo);
  fs.rmSync(dbPath, { force: true });

  const tras = capa(['verify', 'ADR-0004', '--objetivo', 'un-objetivo-de-prueba']);
  assert.match(tras.out, /VERDE/, 'con esquema local viejo la corrida igual tiene que poder registrarse');
  fs.writeFileSync(schemaLocal, empaquetado);
}

// ── T5 · el verde envejece: commits nuevos ⇒ la salida dice la distancia ───────────────────────
fs.writeFileSync(path.join(tmp, 'otro.txt'), 'cambio posterior a la corrida');
git('add', '-A');
git('commit', '-qm', 'un commit despues de la corrida');
const envejecido = capa(['verify', 'ADR-0004', '--objetivo', 'un-objetivo-de-prueba', '--status']);
assert.match(envejecido.out, /commit\(s\) atrás/, 'un verde contra un commit anterior tiene que mostrar la distancia');

// ── ⭐ T2 · CONTROL POSITIVO: el comando roto TIENE que dar ROJO ───────────────────────────────
// Es el control del objetivo entero. Sin él, «hay corridas verdes» sería cierto también porque la
// corrida nueva nunca se registró.
writeManifest(['exit 3']);
const rojo = capa(['verify', 'ADR-0004', '--objetivo', 'un-objetivo-de-prueba'], { allowFailure: true });
assert.match(rojo.out, /ROJO/, 'romper el comando a propósito TIENE que dar rojo — si sale verde, el verbo no ejecuta');
assert.match(rojo.out, /exit 3/, 'el exit code real tiene que quedar registrado');
assert.strictEqual(rojo.status, 1, 'un objetivo en rojo tiene que salir distinto de cero');

const estadoRojo = capa(['verify', 'ADR-0004', '--objetivo', 'un-objetivo-de-prueba', '--status']);
assert.match(estadoRojo.out, /ROJO/);

// ── T4 · tres estados y no se colapsan ─────────────────────────────────────────────────────────
// Un comando corrido en verde + uno nunca corrido NO es un objetivo verde.
writeManifest(['true', 'echo comando-que-nadie-corrio']);
const mixto = capa(['verify', 'ADR-0004', '--objetivo', 'un-objetivo-de-prueba', '--status']);
assert.match(mixto.out, /sin corrida/, 'el comando nuevo tiene que aparecer sin corrida');
assert.match(mixto.out, /SIN CORRIDA/, '«sin corrida» no se colapsa en verde');

// ── AC1 · no hay forma de fijar la fecha desde afuera ──────────────────────────────────────────
// La superficie pública del verbo no acepta el resultado: si algún día alguien agrega una bandera
// para declararlo, este assert cae.
const fuente = fs.readFileSync(path.join(root, 'lib', 'runtime', 'verify.js'), 'utf8');
const firmaRun = fuente.match(/function run\(\{([^}]*)\}\)/);
assert.ok(firmaRun, 'run() tiene que existir con destructuring de argumentos');
for (const prohibido of ['ranAt', 'ran_at', 'exitCode', 'exit_code', 'ranAtCommit', 'state']) {
  assert.ok(!firmaRun[1].includes(prohibido), `run() no puede recibir "${prohibido}": la fecha se deriva de ejecutar, no se declara`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Verify (la evidencia tiene fecha de corrida · control positivo del rojo) smoke test OK');
