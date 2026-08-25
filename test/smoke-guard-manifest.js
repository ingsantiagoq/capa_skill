'use strict';

// Manifest-mode edit guard: an edit is allowed ONLY when a manifest objective is
// in focus and the target file is inside that objective's route. No focus, path
// outside route, or a closed objective => CAPA BLOCK (exit 2).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const bin = path.join(__dirname, '..', 'bin', 'capa.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-guardm-'));

function cli(args) {
  return spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8' });
}

// Hermetic project: config + one wip objective with a two-file route.
fs.writeFileSync(path.join(root, 'capa.config.json'), JSON.stringify({ project: 'test', dossierDir: 'capa' }));
const objDir = path.join(root, 'capa', 'ADR-0001-x', 'obj-a');
fs.mkdirSync(objDir, { recursive: true });
const manifestPath = path.join(objDir, 'manifest.json');
function writeManifest(extra) {
  fs.writeFileSync(manifestPath, JSON.stringify({
    parentAdr: 'ADR-0001-x', objetivo: 'obj-a', lifecycle: 'wip',
    route: ['src/a.js', 'src/feature'], ...extra,
  }, null, 2));
}
writeManifest();

// 1. No focus => BLOCK
let r = cli(['guard', 'edit', '--file', 'src/a.js', '--manifest']);
assert.equal(r.status, 2, 'sin foco debe bloquear');
assert.match(r.stdout, /CAPA BLOCK/);
assert.match(r.stdout, /No hay objetivo CAPA en foco/);

// 2. Focus on a nonexistent objective => error exit 1
r = cli(['focus', 'ADR-0001-x', 'no-existe']);
assert.equal(r.status, 1);
assert.match(r.stderr + r.stdout, /No existe el manifest/);

// 3. Focus on the real objective => ok
r = cli(['focus', 'ADR-0001-x', 'obj-a']);
assert.equal(r.status, 0);
assert.match(r.stdout, /Foco CAPA: ADR-0001-x\/obj-a/);
assert.ok(fs.existsSync(path.join(root, '.capa', 'focus.json')), 'focus.json escrito');

// 4. File inside route => ALLOW
r = cli(['guard', 'edit', '--file', 'src/a.js', '--manifest']);
assert.equal(r.status, 0, 'archivo en route debe permitir');
assert.match(r.stdout, /CAPA ALLOW/);

// 4b. File inside a route DIRECTORY => ALLOW
r = cli(['guard', 'edit', '--file', 'src/feature/deep/x.js', '--manifest']);
assert.equal(r.status, 0, 'archivo bajo carpeta del route debe permitir');
assert.match(r.stdout, /CAPA ALLOW/);

// 5. File outside route => BLOCK
r = cli(['guard', 'edit', '--file', 'src/other.js', '--manifest']);
assert.equal(r.status, 2, 'archivo fuera del route debe bloquear');
assert.match(r.stdout, /fuera del route/);

// 5c. El dossier de OTRO objetivo => BLOCK. La excepción del dossier propio no
//     puede convertirse en "todo capa/ es editable".
const otroDir = path.join(root, 'capa', 'ADR-0001-x', 'obj-b');
fs.mkdirSync(otroDir, { recursive: true });
fs.writeFileSync(path.join(otroDir, 'manifest.json'), JSON.stringify({
  parentAdr: 'ADR-0001-x', objetivo: 'obj-b', lifecycle: 'wip', route: ['src/b.js'],
}, null, 2));
r = cli(['guard', 'edit', '--file', 'capa/ADR-0001-x/obj-b/CONTEXTO.md', '--manifest']);
assert.equal(r.status, 2, 'el dossier de otro objetivo debe bloquear');
assert.match(r.stdout, /fuera del route/);

// 6. Closed objective (lifecycle=done) => BLOCK even for in-route files
writeManifest({ lifecycle: 'done' });
r = cli(['guard', 'edit', '--file', 'src/a.js', '--manifest']);
assert.equal(r.status, 2, 'objetivo cerrado debe bloquear');
assert.match(r.stdout, /cerrado/);

// 6b. Cerrado => ni siquiera su propio dossier. El chequeo de lifecycle va antes
//     que la excepción del dossier propio: un objetivo cerrado no se reescribe.
r = cli(['guard', 'edit', '--file', 'capa/ADR-0001-x/obj-a/PROGRESO.md', '--manifest']);
assert.equal(r.status, 2, 'objetivo cerrado no debe permitir ni su dossier');
assert.match(r.stdout, /cerrado/);
writeManifest();

// 7. Route missing => BLOCK
writeManifest({ route: [] });
r = cli(['guard', 'edit', '--file', 'src/a.js', '--manifest']);
assert.equal(r.status, 2, 'sin route debe bloquear');
assert.match(r.stdout, /no declara `route`/);

// 7b. …pero su PROPIO dossier sigue editable, incluso SIN route. Esta es la
//     circularidad que el guard tenía: escribir el dossier exigía que la route se
//     incluyera a sí misma, y arreglar la route exigía editar el manifest.json, que
//     vive en esa misma carpeta. Un objetivo recién creado quedaba indocumentable.
r = cli(['guard', 'edit', '--file', 'capa/ADR-0001-x/obj-a/CONTEXTO.md', '--manifest']);
assert.equal(r.status, 0, 'el dossier propio debe permitirse aun sin route');
assert.match(r.stdout, /CAPA ALLOW/);
r = cli(['guard', 'edit', '--file', 'capa/ADR-0001-x/obj-a/manifest.json', '--manifest']);
assert.equal(r.status, 0, 'el manifest propio debe permitirse para poder declarar la route');
assert.match(r.stdout, /CAPA ALLOW/);
writeManifest();

// 7c. Con route declarada, el dossier propio sigue permitido sin estar en ella.
r = cli(['guard', 'edit', '--file', 'capa/ADR-0001-x/obj-a/ALCANCE.md', '--manifest']);
assert.equal(r.status, 0, 'el dossier propio no necesita estar en la route');
assert.match(r.stdout, /CAPA ALLOW/);

// 8. Clear focus => back to BLOCK
r = cli(['focus', 'clear']);
assert.equal(r.status, 0);
r = cli(['guard', 'edit', '--file', 'src/a.js', '--manifest']);
assert.equal(r.status, 2, 'tras clear debe bloquear');
assert.match(r.stdout, /No hay objetivo CAPA en foco/);

// 9. A CAPA root with zero objectives is ungoverned => ALLOW (no brick).
const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-empty-'));
fs.writeFileSync(path.join(emptyRoot, 'capa.config.json'), JSON.stringify({ project: 'empty', dossierDir: 'capa' }));
fs.mkdirSync(path.join(emptyRoot, 'capa'), { recursive: true });
r = spawnSync(process.execPath, [bin, 'guard', 'edit', '--file', 'src/anything.js', '--manifest'], { cwd: emptyRoot, encoding: 'utf8' });
assert.equal(r.status, 0, 'raíz sin objetivos no debe bloquear');
assert.match(r.stdout, /CAPA ALLOW/);

console.log('Manifest guard smoke test OK');
