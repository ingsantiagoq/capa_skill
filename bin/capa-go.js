#!/usr/bin/env node
'use strict';

const items = require('../lib/runtime/items');

const result = items.moveNext({ root: process.cwd() });

console.log('CAPA GO');
if (!result.ok) {
  console.log(result.message);
} else {
  console.log('Run state: ' + result.state);
  console.log('Then: ' + (result.following || '-'));
  console.log('Do one state, complete it, stop.');
}
