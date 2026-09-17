'use strict';

// Un ancla tiene que resolver aunque graphify haya cambiado CÓMO nombra sus nodos — y NO tiene que
// resolver cuando la coincidencia es sólo de nombre.
//
// Defecto real (medido 2026-09-17, tras regenerar el grafo de la raíz):
// `capa doctor` pasó de ~788 a 2822 bloqueos de un día para el otro, con 1969 `[E4] ancla NO existe
// en el grafo (drift)` sobre 442 dossiers. NO se habían perdido símbolos: graphify 0.8.44 deriva el
// id de un nodo de archivo como `{directorio_padre}_{stem}` (`extract.py:88-95`, issues #550 y
// #1033), mientras los dossiers anclan con el esquema viejo, derivado de la RUTA COMPLETA. Medido
// sobre las 154.586 rutas del manifest: con la regla larga matchean 41; con la corta, 100.430.
//
// ⚠ El id corto es AMBIGUO: `endpoints_v1tenantendpoints` nombra a la vez
// `ubp-admin-bff/src/Ubp.AdminBff.Api/Endpoints/V1TenantEndpoints.cs` y
// `ubp-bff/src/Ubp.Bff.Api/Endpoints/V1TenantEndpoints.cs`. Por eso el match corto SÓLO vale si el
// `source_file` del nodo confirma la ruta que el ancla declara en `src`. Sin esa confirmación
// cambiaríamos 1969 bloqueos por un verde que no mide nada, que es lo que el gate existe para
// evitar.
//
// Los cuatro casos de abajo son el testigo: dos tienen que ponerse VERDES y dos tienen que seguir
// ROJOS. Si los rojos se ponen verdes, el match quedó laxo y el arreglo es peor que el problema.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadGraph, anchorShortId } = require('../lib/graph');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-anchor-ids-'));

// Grafo sintético con el esquema NUEVO de graphify: el id conserva UN nivel de directorio padre.
const nodes = [
  {
    id: 'ubp_parties_domain_party',
    label: 'Party.cs',
    source_file: 'btw-ubp-backend/ubp-parties-service/src/Ubp.Parties.Domain/Party.cs',
    source_location: 'L14',
  },
  // Los dos homónimos que hacen ambiguo al id corto. Son archivos DISTINTOS de servicios distintos.
  {
    id: 'endpoints_v1tenantendpoints',
    label: 'V1TenantEndpoints.cs',
    source_file: 'btw-ubp-backend/ubp-bff/src/Ubp.Bff.Api/Endpoints/V1TenantEndpoints.cs',
    source_location: 'L20',
  },
  {
    id: 'endpoints_v1tenantendpoints',
    label: 'V1TenantEndpoints.cs',
    source_file: 'btw-ubp-backend/ubp-admin-bff/src/Ubp.AdminBff.Api/Endpoints/V1TenantEndpoints.cs',
    source_location: 'L31',
  },
];
fs.writeFileSync(path.join(dir, 'graph.json'), JSON.stringify({ nodes, links: [] }));
const graph = loadGraph(path.join(dir, 'graph.json'));

// El helper de normalización tiene que reproducir la receta de graphify (`ids.py:33-40`): NFKC,
// runs de no-palabra a un guion bajo, colapsar, recortar y minúsculas. Si esto se aparta, todo lo
// demás mide otra cosa.
assert.strictEqual(
  anchorShortId('btw-ubp-backend/ubp-parties-service/src/Ubp.Parties.Domain/Party.cs'),
  'ubp_parties_domain_party',
  'el id corto sale de <directorio padre>/<stem>, normalizado como graphify');
assert.strictEqual(
  anchorShortId('a/b/Año Fiscal.ts'), 'b_año_fiscal',
  'los acentos sobreviven: graphify normaliza con \\w unicode, no los colapsa');

// ── A · VERDE: id LARGO del esquema viejo, con su `src`. Es el caso de los 1775 ────────────────
assert.ok(
  graph.resolveAnchor(
    'ubp_parties_service_src_ubp_parties_domain_party',
    'ubp-parties-service/src/Ubp.Parties.Domain/Party.cs'),
  'A · un ancla con el id largo debe resolver contra el nodo de id corto que declara la misma ruta');

// ── B · VERDE, y apuntando AL NODO CORRECTO: id ambiguo desempatado por `src` ──────────────────
const b = graph.resolveAnchor(
  'endpoints_v1tenantendpoints', 'ubp-bff/src/Ubp.Bff.Api/Endpoints/V1TenantEndpoints.cs');
assert.ok(b, 'B · el ancla ambigua debe resolver cuando su `src` identifica a uno solo');
assert.strictEqual(
  b.source_file, 'btw-ubp-backend/ubp-bff/src/Ubp.Bff.Api/Endpoints/V1TenantEndpoints.cs',
  'B · y debe resolver al de ubp-bff, NO al homónimo de admin-bff');

// ── C · ROJO Y TIENE QUE SEGUIR ROJO: homónimo cuya ruta declarada no existe ───────────────────
assert.strictEqual(
  graph.resolveAnchor(
    'endpoints_v1tenantendpoints', 'ubp-inexistente/src/Endpoints/V1TenantEndpoints.cs'),
  null,
  'C · un homónimo con una ruta que ningún nodo confirma NO debe resolver: es el falso positivo '
  + 'que convertiría el arreglo en un verde que no mide nada');

// ── C2 · el id ambiguo SIN `src` sigue resolviendo, y eso NO lo introduce este arreglo ─────────
// ⚠ Debilidad PREEXISTENTE, documentada acá para que no se lea como una regresión: con ids
// repetidos, el índice `byId` se queda con el último y `graph.has(id)` ya devolvía verde antes de
// este cambio. Endurecerlo pondría en rojo anclas que hoy están verdes, que es otra decisión y otro
// objetivo. Lo que este arreglo garantiza es no ser MÁS laxo que antes — el caso C de arriba es la
// prueba de eso.
const c2 = graph.resolveAnchor('endpoints_v1tenantendpoints', null);
assert.ok(c2, 'C2 · sin `src`, el comportamiento es el de antes del arreglo: el id exacto resuelve');
assert.strictEqual(c2.id, 'endpoints_v1tenantendpoints', 'C2 · y resuelve a un nodo con ese id');

// ── D · ROJO: un ancla que no existe en NINGÚN esquema sigue siendo drift de verdad ────────────
// (En el repo real éste es el caso de `building_blocks_ubp_buildingblocks_grpc_permission-
// enforcementinterceptor`, uno de los 142 que el arreglo NO apaga: si se pusiera verde, el match
// estaría inventando.)
assert.strictEqual(
  graph.resolveAnchor(
    'building_blocks_ubp_buildingblocks_grpc_permissionenforcementinterceptor',
    'building-blocks/Ubp.BuildingBlocks.Grpc/PermissionEnforcementInterceptor.cs'),
  null,
  'D · un ancla sin nodo en ninguno de los dos esquemas debe seguir bloqueando');

// ── E · el id exacto sigue mandando: si el nodo existe con ese id, no se busca por ruta ────────
assert.ok(graph.resolveAnchor('ubp_parties_domain_party', null),
  'E · un ancla ya escrita con el id corto resuelve sin necesitar `src`');

console.log('smoke-anchor-id-schemes OK');
