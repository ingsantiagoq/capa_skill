'use strict';

const BASE_STATES = [
  'NEW',
  'DISCOVERY',
  'VIABILITY',
  'CONTEXT',
  'SCOPE',
  'GATE',
  'APPROVAL',
  'IMPLEMENT',
  'BUILD',
  'TEST',
  'CODE_REVIEW',
  'CLOSURE',
  'DONE',
];

function nextState(current) {
  const index = BASE_STATES.indexOf(current);
  if (index < 0) return null;
  return BASE_STATES[index + 1] || null;
}

module.exports = { BASE_STATES, nextState };
