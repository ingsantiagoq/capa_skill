'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

assert.match(html, /CAPA Dashboard/);
assert.match(html, /action="\/evidence"/);
assert.match(html, /action="\/tests"/);
assert.match(html, /action="\/reviews"/);
assert.match(html, /action="\/findings"/);
assert.match(html, /action="\/close\/pbi"/);
assert.match(html, /action="\/close\/sprint"/);
assert.match(html, /method="post"/);

console.log('Dashboard actions smoke test OK');
