#!/usr/bin/env node
'use strict';
// Validates the example documents and method descriptors against the JSON Schemas of the ERC assets,
// and checks the structural rules that schemas cannot express (element id uniqueness, relation endpoints,
// observation reconciliation, subject hashes).

const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { canonicalHash, elementId } = require('./lib/canonical');

const ROOT = path.join(__dirname, '..', 'assets', 'erc-auf');
const SCHEMAS = path.join(ROOT, 'schemas');
const EXAMPLES = path.join(ROOT, 'examples');
const METHODS = path.join(ROOT, 'vectors', 'methods');

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
for (const f of fs.readdirSync(SCHEMAS)) {
  if (f.endsWith('.schema.json')) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMAS, f), 'utf8')));
}
const validators = {
  'unit-definition': ajv.getSchema('urn:auf:v1:unit-definition.schema.json'),
  characterization: ajv.getSchema('urn:auf:v1:characterization.schema.json'),
  observation: ajv.getSchema('urn:auf:v1:observation.schema.json'),
  valuation: ajv.getSchema('urn:auf:v1:valuation-receipt.schema.json'),
  method: ajv.getSchema('urn:auf:v1:method-descriptor.schema.json'),
  profile: ajv.getSchema('urn:auf:v1:profile-descriptor.schema.json'),
};

let failures = 0;
function fail(file, msg) {
  failures++;
  console.error(`FAIL ${file}: ${msg}`);
}

const definitionsByHash = new Map();
const docs = [];
for (const dir of [EXAMPLES, METHODS]) {
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.json') || f === 'manifest.json') continue;
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    docs.push({ file: path.relative(ROOT, path.join(dir, f)), doc });
  }
}

// Pass 1: schema validation and definition hashes.
for (const { file, doc } of docs) {
  const v = validators[doc.kind];
  if (!v) {
    fail(file, `unknown kind ${doc.kind}`);
    continue;
  }
  if (!v(doc)) fail(file, ajv.errorsText(v.errors, { separator: '\n      ' }));
  if (doc.kind === 'unit-definition') definitionsByHash.set(canonicalHash(doc), { file, doc });
}

// Pass 2: structural rules.
for (const { file, doc } of docs) {
  if (doc.kind === 'unit-definition') {
    const ids = new Map();
    for (const e of doc.elements) {
      const id = elementId(e.kind, e.ref);
      if (ids.has(id)) fail(file, `duplicate elementId ${id}`);
      ids.set(id, e);
    }
    for (const r of doc.relations) {
      for (const end of [r.from, r.to]) {
        if (end !== 'unit' && !ids.has(end)) fail(file, `relation ${r.type} references unknown endpoint ${end}`);
      }
      if (r.type === 'contains') {
        const to = ids.get(r.to);
        if (!to || to.kind !== 'unit') fail(file, `contains must point to a unit element`);
        if (r.from !== 'unit') fail(file, `contains must start at the unit`);
      }
      if (r.from === r.to) fail(file, `relation ${r.type} is a self-loop`);
    }
    const portIds = new Set();
    for (const p of doc.ports) {
      if (portIds.has(p.id)) fail(file, `duplicate port id ${p.id}`);
      portIds.add(p.id);
    }
  } else if (doc.kind === 'method' || doc.kind === 'profile') {
    continue;
  } else {
    const def = definitionsByHash.get(doc.subject.boundaryHash);
    if (!def) fail(file, `subject boundaryHash ${doc.subject.boundaryHash} matches no example definition`);
    if (doc.kind === 'characterization' && def) {
      const ids = new Set(def.doc.elements.map((e) => elementId(e.kind, e.ref)));
      const ports = new Set(def.doc.ports.map((p) => p.id));
      for (const r of doc.roles || []) {
        if (r.scope.type === 'element' && !ids.has(r.scope.id)) fail(file, `role scope element ${r.scope.id} not in definition`);
        if (r.scope.type === 'port' && !ports.has(r.scope.id)) fail(file, `role scope port ${r.scope.id} not in definition`);
      }
    }
    if (doc.kind === 'observation') {
      for (const a of doc.assets) {
        const members = ['opening', 'closing', 'inflow', 'outflow', 'minted', 'burned', 'adjustments'];
        const missing = new Set(a.missing || []);
        for (const m of members) {
          if (missing.has(m) && a[m] !== undefined) fail(file, `asset ${a.asset}: member ${m} listed as missing but present`);
          if (!missing.has(m) && a[m] === undefined) fail(file, `asset ${a.asset}: member ${m} absent but not listed as missing`);
        }
        if (members.every((m) => a[m] !== undefined)) {
          const n = (s) => BigInt(Math.round(Number(s) * 1e6));
          const adj = a.adjustments.reduce((acc, x) => acc + n(x.amount), 0n);
          const lhs = n(a.closing) - n(a.opening);
          const rhs = n(a.inflow) - n(a.outflow) + n(a.minted) - n(a.burned) + adj;
          if (lhs !== rhs) fail(file, `asset ${a.asset}: reconciliation failed (${lhs} != ${rhs})`);
          const transfersIn = (a.transfers || []).filter((t) => t.direction === 'in').reduce((acc, t) => acc + n(t.amount), 0n);
          const transfersOut = (a.transfers || []).filter((t) => t.direction === 'out').reduce((acc, t) => acc + n(t.amount), 0n);
          if ((a.transfers || []).length && (transfersIn !== n(a.inflow) || transfersOut !== n(a.outflow))) {
            fail(file, `asset ${a.asset}: transfers do not add up to inflow/outflow`);
          }
        }
      }
    }
    if (doc.kind === 'valuation') {
      if (doc.assessmentBoundary && doc.assessmentBoundary.hash !== doc.subject.boundaryHash && !doc.assessmentBoundary.deltaURI) {
        fail(file, 'assessment boundary differs from the subject boundary but no deltaURI is given');
      }
      const r = doc.result;
      if (['not-valuable', 'insufficient-evidence', 'not-applicable'].includes(r.kind) && r.value !== undefined) {
        fail(file, 'result kind without value carries a value');
      }
    }
  }
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log(`validated ${docs.length} documents (${definitionsByHash.size} unit definitions) with 0 failures`);
