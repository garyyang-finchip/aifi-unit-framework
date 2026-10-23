#!/usr/bin/env node
'use strict';
// Builds the worked examples of the AIFi Unit Framework (ERC Reference Implementation section):
// Unit Definitions, characterizations, observations and valuation receipts, with element ids,
// boundary hashes and method ids computed by the canonicalization rules of the ERC.
//
//   node tools/build-examples.js [--registry 0x...] [--chain 11155111] [--out assets/erc-auf/examples]
//
// The registry address is a placeholder until the Sepolia deployment; re-run with --registry afterwards
// (the subject hashes change accordingly, as the ERC requires).

const fs = require('fs');
const path = require('path');
const { canonicalHash, elementId, unitRef, idOf } = require('./lib/canonical');

const args = process.argv.slice(2);
function arg(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}
const CHAIN = Number(arg('--chain', '11155111'));
const REGISTRY = String(arg('--registry', '0x00000000000000000000000000000000000000f0')).toLowerCase();
// Optional: one account that controls every example definition (used for the Sepolia evidence run, where the
// session deployer registers all Units). Without it, each example keeps its own fictitious controller.
const CONTROLLER_OVERRIDE = args.includes('--controller') ? String(arg('--controller')).toLowerCase() : null;
const DESCRIPTOR_BASE = arg('--descriptor-base', '');
const OUT = path.resolve(arg('--out', path.join(__dirname, '..', 'assets', 'erc-auf', 'examples')));
const METHODS_DIR = path.join(__dirname, '..', 'assets', 'erc-auf', 'vectors', 'methods');

const REGISTRY_CAIP10 = `eip155:${CHAIN}:${REGISTRY}`;

// Fictitious addresses. None of them is a live contract; they exist only to make the examples concrete.
const A = {
  skillToken: '0x00000000000000000000000000000000000000aa',
  taskToken: '0x00000000000000000000000000000000000000bb',
  stable: '0x00000000000000000000000000000000000000cc',
  swarmRegistry: '0x00000000000000000000000000000000000000ee',
  agentA: '0x00000000000000000000000000000000000000a1',
  agentB: '0x00000000000000000000000000000000000000a2',
  agentC: '0x00000000000000000000000000000000000000a3',
  agentOpc: '0x00000000000000000000000000000000000000a7',
  operator: '0x00000000000000000000000000000000000000a8',
  buyer: '0x00000000000000000000000000000000000000b1',
  worker: '0x00000000000000000000000000000000000000c1',
  judge: '0x00000000000000000000000000000000000000d1',
  treasury1: '0x00000000000000000000000000000000000000e1',
  treasuryA: '0x00000000000000000000000000000000000000e2',
  treasuryB: '0x00000000000000000000000000000000000000e3',
  treasurySwarm: '0x00000000000000000000000000000000000000e4',
  treasuryOpc: '0x00000000000000000000000000000000000000e7',
  skillOwner: '0x00000000000000000000000000000000000000f1',
  guarantor: '0x00000000000000000000000000000000000000f6',
  evaluator: '0x00000000000000000000000000000000000000ef',
  revenueToken: '0x00000000000000000000000000000000000000dd',
  fund: '0x00000000000000000000000000000000000000f7',
  fundDeskA: '0x00000000000000000000000000000000000000f8',
  fundDeskB: '0x00000000000000000000000000000000000000f9',
  fundTreasury: '0x00000000000000000000000000000000000000e8',
  analyst: '0x00000000000000000000000000000000000000d2',
  analystB: '0x00000000000000000000000000000000000000d3',
  fundG: '0x00000000000000000000000000000000000000fa',
  fundGTreasury: '0x00000000000000000000000000000000000000e9',
};
const caip10 = (addr) => `eip155:${CHAIN}:${addr}`;
const erc721 = (addr, id) => `eip155:${CHAIN}/erc721:${addr}/${id}`;
const STABLE = `eip155:${CHAIN}/erc20:${A.stable}`;

// Method ids from the published descriptors.
const methods = {};
for (const f of fs.readdirSync(METHODS_DIR)) {
  const doc = JSON.parse(fs.readFileSync(path.join(METHODS_DIR, f), 'utf8'));
  methods[doc.name] = canonicalHash(doc);
}
const M = {
  netEquity: methods['auf:method:net-equity@1'],
  realized: methods['auf:method:realized-net-cash-flow@1'],
  dcf: methods['auf:method:finite-horizon-dcf@1'],
  conditional: methods['auf:method:conditional-payoff@1'],
};

// ----------------------------------------------------------------------------- helpers

function el(kind, ref, extra = {}) {
  return { kind, ref, ...extra, _id: elementId(kind, ref) };
}
function strip(elements) {
  return elements.map(({ _id, ...rest }) => rest);
}
function rel(type, from, to, extra = {}) {
  return { type, from: from === 'unit' ? 'unit' : from._id, to: to === 'unit' ? 'unit' : to._id, ...extra };
}
// Set form of an identity relation (Section 3.4): holds between every pair of the listed elements.
function relSet(type, elements, extra = {}) {
  return { type, elements: elements.map((e) => e._id), ...extra };
}
function definition({ name, summary, tags, elements, relations, ports, authorities, validity, scale, extensions, metadata }) {
  if (CONTROLLER_OVERRIDE) authorities = { ...authorities, definitionController: caip10(CONTROLLER_OVERRIDE) };
  const doc = {
    auf: '1.0',
    kind: 'unit-definition',
    unit: { name, summary, ...(tags ? { tags } : {}) },
    elements: strip(elements),
    relations,
    ports,
    authorities,
  };
  if (validity) doc.validity = validity;
  if (scale) doc.scale = scale;
  if (extensions) doc.extensions = extensions;
  if (metadata) doc.metadata = metadata;
  return doc;
}
function subject(unitId, version, boundaryHash) {
  return { registry: REGISTRY_CAIP10, unitId, version, boundaryHash };
}
function roleStmt(role, scope, extra = {}) {
  return { role, scope, ...extra };
}
const S = {
  unit: () => ({ type: 'unit' }),
  port: (id) => ({ type: 'port', id }),
  element: (e) => ({ type: 'element', id: e._id }),
};

const written = [];
const companions = {}; // unitId -> [{file, kind, contentHash, profile, core}]
const RESULT_CODES = { monetary: 1, interval: 2, distribution: 3, scenario: 4, vector: 5, conditional: 6, score: 7, grade: 8, 'not-valuable': 9, 'insufficient-evidence': 10, 'not-applicable': 11 };
const unix = (t) => (t === undefined ? 0 : typeof t === 'number' ? t : Math.floor(Date.parse(t) / 1000));
function scaled(value, decimals) {
  // decimal string -> integer string scaled by 10^decimals (exact)
  const neg = value.startsWith('-');
  const [i, f = ''] = value.replace('-', '').split('.');
  const digits = (i + f.padEnd(decimals, '0').slice(0, decimals)).replace(/^0+(?=\d)/, '');
  return (neg && digits !== '0' ? '-' : '') + digits;
}
function write(name, doc) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
  written.push(name);
  if (doc.kind === 'characterization' || doc.kind === 'observation' || doc.kind === 'valuation') {
    const unitId = doc.subject.unitId;
    const entry = { file: name, kind: doc.kind, contentHash: canonicalHash(doc) };
    if (doc.kind === 'characterization') entry.profile = 'auf:characterization:v1@1';
    if (doc.kind === 'observation') {
      entry.profile = 'auf:observation:v1@1';
      entry.core = { snapshotHash: entry.contentHash, windowStart: unix(doc.window.from), windowEnd: unix(doc.window.to) };
    }
    if (doc.kind === 'valuation') {
      entry.profile = doc.method.name;
      const r = doc.result;
      const decimals = r.decimals || 0;
      const carries = ['monetary', 'interval', 'scenario', 'conditional'].includes(r.kind);
      entry.core = {
        methodId: doc.method.id,
        interestId: idOf(doc.interest.id),
        assessmentBoundaryHash: (doc.assessmentBoundary && doc.assessmentBoundary.hash) || doc.subject.boundaryHash,
        snapshotHash: doc.snapshot.hash || '0x' + '00'.repeat(32),
        resultKind: RESULT_CODES[r.kind],
        decimals: carries ? decimals : 0,
        value: carries && r.value !== undefined ? scaled(r.value, decimals) : '0',
        denominationId: r.denomination ? idOf(r.denomination) : '0x' + '00'.repeat(32),
        asOf: unix(doc.snapshot.asOf),
        horizonEnd: unix(doc.horizon && doc.horizon.to),
      };
    }
    (companions[unitId] = companions[unitId] || []).push(entry);
  }
  return p;
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = { chainId: CHAIN, registry: REGISTRY, controllerOverride: CONTROLLER_OVERRIDE, descriptorBase: DESCRIPTOR_BASE, note: 'Planned registration order; unitIds are assigned sequentially by the Unit Registry.', methods: M, units: [] };

// ----------------------------------------------------------------------------- 1. Skill with several non-exclusive licenses
(function skillMultiLicense() {
  const unitId = 1;
  const skill = el('skill', erc721(A.skillToken, 1), { label: 'Summarizer skill package v3 (token-bound executable skill)', controller: caip10(A.skillOwner) });
  const endpoint = el('service', 'https://skills.example/summarizer/v3', {
    label: 'Invocation endpoint of the skill',
    extensions: { 'x:auf.example:protocol-binding': { protocol: 'mcp', transport: 'https', required: false } },
  });
  const agentA = el('agent', caip10(A.agentA), { label: 'Licensee A' });
  const agentB = el('agent', caip10(A.agentB), { label: 'Licensee B' });
  const agentC = el('agent', caip10(A.agentC), { label: 'Licensee C' });
  const licA = el('financial-position', 'urn:x:license:skill-1:licensee-a:2026', { label: 'License fee receivable from A' });
  const licB = el('financial-position', 'urn:x:license:skill-1:licensee-b:2026', { label: 'License fee receivable from B' });
  const licC = el('financial-position', 'urn:x:license:skill-1:licensee-c:2026', { label: 'License fee receivable from C' });
  const hostingPayable = el('financial-position', 'urn:x:payable:hosting:2026-10', { label: 'Hosting invoice payable' });
  const treasury = el('financial-position', caip10(A.treasury1), { label: 'Treasury account (stable balance)' });
  const elements = [skill, endpoint, agentA, agentB, agentC, licA, licB, licC, hostingPayable, treasury];
  const license = (agent, lic) => [
    rel('licenses', agent, skill, { scope: 'inference calls, non-transferable, non-sublicensable', exclusive: false, validFrom: '2026-01-01T00:00:00Z', validUntil: '2026-12-31T23:59:59Z', basis: ['urn:x:agreement:' + agent.ref] }),
    rel('holds', 'unit', lic, { quantity: { amount: '1200', unit: 'USD' }, scope: 'annual license fee, paid monthly', counterparty: agent.ref }),
  ];
  const relations = [
    rel('owns', 'unit', skill, { exclusive: true, share: '1', basis: [skill.ref] }),
    rel('commits', 'unit', endpoint, { scope: 'keep the endpoint available to licensees at the agreed service level', obligations: '99.5% monthly availability' }),
    ...license(agentA, licA),
    ...license(agentB, licB),
    ...license(agentC, licC),
    rel('owes', 'unit', hostingPayable, { quantity: { amount: '30', unit: 'USD' }, scope: 'due on receipt' }),
    rel('holds', 'unit', treasury),
    rel('exchanges', endpoint, agentA, { scope: 'invocations' }),
  ];
  // Section 3.8: positions are additive only when declared distinct; one set-form declaration covers the five positions.
  const distinct = (positions, agents) => relSet('distinct-claim', positions, {
    scope: 'receivables from different licensees under separate agreements, one hosting invoice and one treasury account: five different claims',
    basis: [...agents.map((a) => 'urn:x:agreement:' + a.ref), 'urn:x:invoice:hosting:2026-10', treasury.ref],
  });
  relations.push(distinct([licA, licB, licC, hostingPayable, treasury], [agentA, agentB, agentC]));
  const ports = [
    { id: 'service-out', direction: 'out', class: 'deliverable', template: 'auf:port:service-out@1', conditions: 'licensee holds a valid license' },
    { id: 'fees-in', direction: 'in', class: 'funds', template: 'auf:port:funds-in@1', asset: STABLE, account: caip10(A.treasury1), conditions: 'monthly license fee' },
    { id: 'hosting-out', direction: 'out', class: 'funds', template: 'auf:port:funds-out@1', asset: STABLE, account: caip10(A.treasury1), conditions: 'hosting invoices' },
  ];
  const doc = definition({
    name: 'Summarizer Skill Business',
    summary: 'A static executable skill owned by one party and licensed non-exclusively to three agents. Shows the difference between the asset, the usage rights of the licensees and the revenue rights of the owner.',
    tags: ['skill', 'licensing'],
    elements, relations, ports,
    authorities: { definitionController: caip10(A.skillOwner), beneficiaries: [{ account: caip10(A.skillOwner), scope: 'license revenue' }], settlementAccounts: [caip10(A.treasury1)] },
    validity: { from: '2026-01-01T00:00:00Z', until: '2026-12-31T23:59:59Z' },
    scale: { window: 'P30D' },
  });
  const boundaryHash = canonicalHash(doc);
  write('skill-multi-license.json', doc);

  const characterization = {
    auf: '1.0', kind: 'characterization', subject: subject(unitId, 1, boundaryHash),
    roles: [
      roleStmt('source', S.port('service-out'), { mechanism: 'production', conditions: 'per licensed invocation' }),
      roleStmt('container', S.element(treasury), { mechanism: 'funds', state: 'liquid' }),
      roleStmt('damping', S.port('hosting-out'), { mechanism: 'resource-use', conditions: 'hosting cost per month' }),
      roleStmt('conductor', S.element(endpoint), { mechanism: 'transfer', conditions: 'delivers invocation results to licensees' }),
    ],
    attributes: { linearity: 'piecewise-linear', determinism: 'deterministic', timeVariance: 'time-varying', memory: 'memoryless' },
    structure: { profile: 'auf:structure:composite@1' },
    knowledge: { status: 'classified' },
  };
  write('skill-multi-license.characterization.json', characterization);

  const observation = {
    auf: '1.0', kind: 'observation', subject: subject(unitId, 1, boundaryHash),
    window: { from: '2026-10-01T00:00:00Z', to: '2026-10-31T23:59:59Z' }, snapshotAt: '2026-10-31T23:59:59Z',
    assets: [{
      asset: STABLE, opening: '0', closing: '65', inflow: '100', outflow: '35', minted: '0', burned: '0', adjustments: [],
      transfers: [
        { port: 'fees-in', direction: 'in', amount: '100', counterparty: 'licensees A, B, C', evidence: ['urn:x:tx:fees-2026-10'] },
        { port: 'hosting-out', direction: 'out', amount: '30', counterparty: 'compute provider', evidence: ['urn:x:tx:hosting-2026-10'] },
        { port: 'hosting-out', direction: 'out', amount: '5', counterparty: 'payment rail', evidence: ['urn:x:tx:fees-2026-10'] },
      ],
    }],
    nonCash: [{ subject: skill._id, kind: 'depreciation', from: 'v3 current', to: 'v3 one month older; no successor released', basis: ['urn:x:note:depreciation-policy'] }],
    coverage: { observed: ['stable balance and transfers of the treasury account', 'license invoices'], missing: [{ item: 'off-chain card payments of licensee C', reason: 'not yet reconciled' }], method: 'indexer over the treasury account plus invoice export', source: 'urn:x:indexer:example' },
  };
  const observationHash = canonicalHash(observation);
  write('skill-multi-license.observation.json', observation);

  write('skill-multi-license.valuation.realized-net-cash-flow.json', {
    auf: '1.0', kind: 'valuation', subject: subject(unitId, 1, boundaryHash), assessmentBoundary: { hash: boundaryHash },
    interest: { id: 'auf:interest:whole@1', perspective: 'analyst', detail: 'realized net cash flow of the business over October 2026 (an observation result, not a value)' },
    snapshot: { asOf: '2026-10-31T23:59:59Z', hash: observationHash },
    method: { id: M.realized, name: 'auf:method:realized-net-cash-flow@1', params: { asset: STABLE } },
    inputs: { data: [{ observation: observationHash }], coverage: 'as in the observation record; card payments of licensee C not covered' },
    result: { kind: 'monetary', value: '65.00', denomination: 'USD', decimals: 2 },
    horizon: { from: '2026-10-01T00:00:00Z', to: '2026-10-31T23:59:59Z' },
    evaluator: caip10(A.evaluator),
  });
  write('skill-multi-license.valuation.net-equity.json', {
    auf: '1.0', kind: 'valuation', subject: subject(unitId, 1, boundaryHash), assessmentBoundary: { hash: boundaryHash },
    interest: { id: 'auf:interest:net-equity@1', perspective: 'holder' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: observationHash },
    method: {
      id: M.netEquity, name: 'auf:method:net-equity@1',
      params: {
        denomination: 'USD',
        assets: [{ element: treasury._id, quantity: '100', price: '1', priceSource: 'stable at par', priceAt: '2026-11-01T00:00:00Z' }],
        liabilities: [{ element: hostingPayable._id, quantity: '30', price: '1', priceSource: 'invoice', priceAt: '2026-11-01T00:00:00Z' }],
      },
    },
    inputs: { data: [{ element: treasury._id, source: 'balance at snapshot' }, { element: hostingPayable._id, source: 'invoice' }], missing: [{ item: 'license receivables', reason: 'not priced in this receipt; see revenue-right valuation' }, { item: skill._id, reason: 'no observable price for the skill asset itself' }], coverage: 'cash and the open payable only' },
    result: { kind: 'monetary', value: '70.00', denomination: 'USD', decimals: 2 },
    evaluator: caip10(A.evaluator),
    notes: 'Vector "Net equity": cash 100, payable 30, no other positions. The skill asset and the receivables are deliberately left out and listed as missing.',
  });
  write('skill-multi-license.valuation.revenue-right-dcf.json', {
    auf: '1.0', kind: 'valuation', subject: subject(unitId, 1, boundaryHash), assessmentBoundary: { hash: boundaryHash },
    interest: { id: 'auf:interest:revenue-right@1', perspective: 'holder', detail: 'license fee stream of the three licenses, net of hosting and fees' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: observationHash },
    method: { id: M.dcf, name: 'auf:method:finite-horizon-dcf@1', params: { denomination: 'USD', cashflows: ['65', '65'], rate: '0.1', terminalValue: '0', periodLength: 'P30D', attribution: 'net license revenue to the owner', scenario: 'base' } },
    inputs: { data: [{ observation: observationHash, use: 'October realized net cash flow as the base of the two-period forecast' }], estimates: ['the two forecast periods repeat the October realized net cash flow'], coverage: 'two periods, no terminal value' },
    result: { kind: 'monetary', value: '112.81', denomination: 'USD', decimals: 2, uncertainty: { type: 'none-stated' } },
    horizon: { from: '2026-11-01T00:00:00Z', to: '2026-12-31T23:59:59Z' },
    evaluator: caip10(A.evaluator),
    notes: 'Vector "Finite-horizon DCF": 65/1.1 + 65/1.21 = 112.8099..., rounded to two decimals.',
  });

  // Version 2 of the same Unit: one element added (a fourth licensee). Used by the Sepolia lifecycle phase to show
  // that receipts recorded for version 1 do not carry over to version 2.
  const agentD = el('agent', caip10('0x00000000000000000000000000000000000000a4'), { label: 'Licensee D' });
  const licD = el('financial-position', 'urn:x:license:skill-1:licensee-d:2026', { label: 'License fee receivable from D' });
  const docV2 = definition({
    name: 'Summarizer Skill Business',
    summary: doc.unit.summary + ' Version 2 adds a fourth licensee.',
    tags: ['skill', 'licensing'],
    elements: [...elements, agentD, licD],
    relations: [...relations.filter((r) => r.type !== 'distinct-claim'), ...license(agentD, licD), distinct([licA, licB, licC, licD, hostingPayable, treasury], [agentA, agentB, agentC, agentD])],
    ports,
    authorities: doc.authorities,
    validity: { from: '2026-01-01T00:00:00Z', until: '2026-12-31T23:59:59Z' },
    scale: { window: 'P30D' },
  });
  const v2Hash = canonicalHash(docV2);
  fs.writeFileSync(path.join(OUT, 'skill-multi-license.v2.json'), JSON.stringify(docV2, null, 2) + '\n');
  written.push('skill-multi-license.v2.json');

  manifest.units.push({ unitId, name: doc.unit.name, file: 'skill-multi-license.json', boundaryHash, contains: [], elements: Object.fromEntries(elements.map((e) => [e.label || e.ref, e._id])), controller: CONTROLLER_OVERRIDE || A.skillOwner, v2: { file: 'skill-multi-license.v2.json', boundaryHash: v2Hash } });
})();

// ----------------------------------------------------------------------------- 2 and 3. Agent sub-units sharing one skill
function agentSubunit(unitId, letter, agentAddr, treasuryAddr) {
  const agent = el('agent', caip10(agentAddr), { label: `Agent ${letter}` });
  const skill = el('skill', erc721(A.skillToken, 1), { label: 'Summarizer skill (shared license)' });
  const treasury = el('financial-position', caip10(treasuryAddr), { label: `Treasury of agent ${letter}` });
  const elements = [agent, skill, treasury];
  const relations = [
    rel('licenses', 'unit', skill, { scope: 'inference calls under the swarm license', exclusive: false, share: '1/2', basis: ['urn:x:agreement:swarm-license'] }),
    rel('holds', 'unit', treasury),
    rel('controls', agent, treasury, { scope: 'spending policy of the sub-unit' }),
  ];
  const ports = [
    { id: 'service-out', direction: 'out', class: 'deliverable', template: 'auf:port:service-out@1' },
    { id: 'funds-in', direction: 'in', class: 'funds', template: 'auf:port:funds-in@1', asset: STABLE, account: caip10(treasuryAddr) },
  ];
  const doc = definition({
    name: `Agent ${letter} sub-unit`,
    summary: `Economic boundary of agent ${letter} inside Research Swarm Alpha. Holds half of the swarm's non-exclusive license to the summarizer skill.`,
    tags: ['agent', 'sub-unit'],
    elements, relations, ports,
    authorities: { definitionController: caip10(agentAddr), settlementAccounts: [caip10(treasuryAddr)] },
    scale: { window: 'P7D' },
  });
  const boundaryHash = canonicalHash(doc);
  const file = `agent-subunit-${letter.toLowerCase()}.json`;
  write(file, doc);
  write(file.replace('.json', '.characterization.json'), {
    auf: '1.0', kind: 'characterization', subject: subject(unitId, 1, boundaryHash),
    roles: [
      roleStmt('source', S.port('service-out'), { mechanism: 'production' }),
      roleStmt('container', S.element(treasury), { mechanism: 'funds' }),
      roleStmt('control', S.element(agent), { mechanism: 'budget', conditions: 'agent policy decides spending' }),
    ],
    structure: { profile: 'auf:structure:composite@1' },
    knowledge: { status: 'classified' },
  });
  manifest.units.push({ unitId, name: doc.unit.name, file, boundaryHash, contains: [], elements: Object.fromEntries(elements.map((e) => [e.label || e.ref, e._id])), controller: CONTROLLER_OVERRIDE || agentAddr });
  return { boundaryHash, skill, treasury };
}
const subA = agentSubunit(2, 'A', A.agentA, A.treasuryA);
const subB = agentSubunit(3, 'B', A.agentB, A.treasuryB);

// ----------------------------------------------------------------------------- 4. Swarm as an economic Unit
(function swarmUnit() {
  const unitId = 4;
  const swarmId = '0x' + '5a'.repeat(32);
  const swarm = el('x:finchip.ai:swarm', `eip155:${CHAIN}:${A.swarmRegistry}:${swarmId}`, { label: 'Swarm registry record (organizational boundary)' });
  const unitA = el('unit', unitRef(CHAIN, REGISTRY, 2, 1), { label: 'Agent A sub-unit, version 1' });
  const unitB = el('unit', unitRef(CHAIN, REGISTRY, 3, 1), { label: 'Agent B sub-unit, version 1' });
  const coordinator = el('agent', caip10(A.agentC), { label: 'Coordinator agent C', expectedAcks: ['participation'] });
  const model = el('model', 'urn:x:model:provider-example:frontier-v9', { label: 'External frontier model (API access only)' });
  const modelFee = el('financial-position', 'urn:x:liability:model-subscription:2026-11', { label: 'Model subscription payable for November' });
  const task = el('task', erc721(A.taskToken, 17), { label: 'Task tender 17 (translation corpus), accepted by the swarm' });
  const treasury = el('financial-position', caip10(A.treasurySwarm), { label: 'Swarm treasury (swarm account)' });
  // the sub-unit treasuries are reached through containment; they are listed here so that the swarm can state that the
  // four positions inside its boundary are distinct claims (Section 3.8)
  const treasuryA = el('financial-position', subA.treasury.ref, { label: 'Treasury of agent A (position of the contained sub-unit)' });
  const treasuryB = el('financial-position', subB.treasury.ref, { label: 'Treasury of agent B (position of the contained sub-unit)' });
  const elements = [swarm, unitA, unitB, coordinator, model, modelFee, task, treasury, treasuryA, treasuryB];
  const relations = [
    rel('depends-on', 'unit', swarm, { scope: 'membership, roles and charter are kept by the swarm registry; this Unit does not restate them' }),
    rel('contains', 'unit', unitA),
    rel('contains', 'unit', unitB),
    rel('licenses', 'unit', model, { scope: 'API access, 1,000,000 tokens per month', exclusive: false, validFrom: '2026-11-01T00:00:00Z', validUntil: '2026-11-30T23:59:59Z' }),
    rel('owes', 'unit', modelFee, { quantity: { amount: '30', unit: 'USD' }, scope: 'due 2026-11-30' }),
    rel('commits', 'unit', task, { scope: 'deliver the translated corpus before the tender deadline', counterparty: caip10(A.buyer), obligations: 'delivery accepted by the acceptance authority of the tender' }),
    rel('holds', 'unit', treasury),
    rel('controls', coordinator, treasury, { scope: 'budget decisions under the swarm charter' }),
    rel('exchanges', unitA, unitB, { scope: 'intermediate deliverables between the sub-units (internal transfer, crosses no port)' }),
    relSet('distinct-claim', [treasury, modelFee, treasuryA, treasuryB], {
      scope: 'three treasury accounts and one subscription payable: four different claims',
      basis: [treasury.ref, treasuryA.ref, treasuryB.ref, 'urn:x:invoice:model-subscription:2026-11'],
    }),
  ];
  const ports = [
    { id: 'deliverable-out', direction: 'out', class: 'deliverable', template: 'auf:port:deliverable-out@1', conditions: 'task deliveries' },
    { id: 'funds-in', direction: 'in', class: 'funds', template: 'auf:port:funds-in@1', asset: STABLE, account: caip10(A.treasurySwarm), conditions: 'task payouts and funding' },
    { id: 'model-fees-out', direction: 'out', class: 'funds', template: 'auf:port:funds-out@1', asset: STABLE, account: caip10(A.treasurySwarm), conditions: 'model subscription' },
    { id: 'decisions-in', direction: 'in', class: 'control', template: 'auf:port:control-in@1', conditions: 'decisions of the swarm council change budgets and task acceptance' },
  ];
  const doc = definition({
    name: 'Research Swarm Alpha (economic boundary)',
    summary: 'A purpose-bound agent swarm treated as one economic Unit: two agent sub-units, a coordinator, an external model license with a payable, a task obligation and a treasury. The organizational boundary (membership, roles, charter) stays in the swarm registry; this Unit states what is economically included and under which terms.',
    tags: ['swarm', 'composite', 'chip'],
    elements, relations, ports,
    authorities: { definitionController: caip10(A.agentC), representatives: [{ account: caip10(A.treasurySwarm), scope: 'swarm account acting under the charter' }], settlementAccounts: [caip10(A.treasurySwarm)], notes: 'Definition control sits with the coordinator; representation sits with the swarm account under its charter.' },
    scale: { window: 'P30D' },
  });
  const boundaryHash = canonicalHash(doc);
  write('swarm-unit.json', doc);

  write('swarm-unit.characterization.json', {
    auf: '1.0', kind: 'characterization', subject: subject(unitId, 1, boundaryHash),
    roles: [
      roleStmt('source', S.port('deliverable-out'), { mechanism: 'production', conditions: 'accepted task deliveries earn tender payouts' }),
      roleStmt('sink', S.element(model), { mechanism: 'consumption', conditions: 'model tokens consumed per task' }),
      roleStmt('damping', S.port('model-fees-out'), { mechanism: 'resource-use' }),
      roleStmt('container', S.element(treasury), { mechanism: 'funds' }),
      roleStmt('control', S.port('decisions-in'), { mechanism: 'governance', conditions: 'council decisions under the charter' }),
      roleStmt('pledge', S.element(task), { mechanism: 'performance-guarantee', conditions: 'commitment to deliver; failure forfeits the payout', state: 'in progress' }),
    ],
    attributes: { linearity: 'nonlinear', determinism: 'stochastic', timeVariance: 'time-varying', memory: 'history-dependent' },
    structure: { profile: 'auf:structure:chip@1', interfaces: ['deliverable-out', 'funds-in', 'model-fees-out', 'decisions-in'] },
    knowledge: { status: 'classified', notes: 'Sub-unit treasuries are inside the boundary through containment; the model is an external dependency with a usage right only.' },
  });

  write('swarm-unit.valuation.net-equity.json', {
    auf: '1.0', kind: 'valuation', subject: subject(unitId, 1, boundaryHash), assessmentBoundary: { hash: boundaryHash },
    interest: { id: 'auf:interest:net-equity@1', perspective: 'holder' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: canonicalHash({ note: 'state snapshot of the swarm treasury and payable at 2026-11-01', treasury: '100', modelFee: '30' }) },
    method: {
      id: M.netEquity, name: 'auf:method:net-equity@1',
      params: {
        denomination: 'USD',
        assets: [{ element: treasury._id, quantity: '100', price: '1', priceSource: 'stable at par', priceAt: '2026-11-01T00:00:00Z' }],
        liabilities: [{ element: modelFee._id, quantity: '30', price: '1', priceSource: 'subscription invoice', priceAt: '2026-11-01T00:00:00Z' }],
      },
    },
    inputs: { data: [{ element: treasury._id }, { element: modelFee._id }], missing: [{ item: 'sub-unit treasuries', reason: 'zero balances at snapshot' }, { item: subA.skill._id, reason: 'shared license counted once at the swarm level; no observable price' }], coverage: 'treasury and payable; the shared skill license reached through both sub-units is counted once and left unpriced' },
    result: { kind: 'monetary', value: '70.00', denomination: 'USD', decimals: 2 },
    evaluator: caip10(A.evaluator),
    notes: 'Exception vector "Shared right": the skill license appears in both sub-units with share 1/2 each and is counted once here.',
  });
  write('swarm-unit.valuation.fulfillment-claim.json', {
    auf: '1.0', kind: 'valuation', subject: subject(unitId, 1, boundaryHash), assessmentBoundary: { hash: boundaryHash },
    interest: { id: 'auf:interest:fulfillment-claim@1', perspective: 'executor', detail: 'payout of task tender 17 on accepted delivery' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: canonicalHash({ note: 'tender 17 state at 2026-11-01', escrow: '100', status: 'open' }) },
    method: { id: M.conditional, name: 'auf:method:conditional-payoff@1', params: { denomination: 'USD', scenarios: [{ name: 'accepted', probability: '0.6', payoff: '100' }, { name: 'rejected or late', probability: '0.4', payoff: '0' }], rate: '0.1', periods: 1, probabilityBasis: 'declared', costsIncluded: false } },
    inputs: { data: [{ element: task._id, source: 'tender terms' }], estimates: ['acceptance probability declared by the evaluator'], coverage: 'payout only; model and labour costs excluded' },
    result: { kind: 'scenario', denomination: 'USD', decimals: 2, scenarios: [{ name: 'accepted', probability: '0.6', value: '100' }, { name: 'rejected or late', probability: '0.4', value: '0' }], value: '54.55' },
    horizon: { to: '2026-12-01T00:00:00Z' },
    evaluator: caip10(A.evaluator),
    notes: 'Vector "Conditional payoff": (0.6 x 100 + 0.4 x 0) / 1.1 = 54.5454..., rounded to two decimals.',
  });

  manifest.units.push({ unitId, name: doc.unit.name, file: 'swarm-unit.json', boundaryHash, contains: [{ unitId: 2, version: 1 }, { unitId: 3, version: 1 }], elements: Object.fromEntries(elements.map((e) => [e.label || e.ref, e._id])), controller: CONTROLLER_OVERRIDE || A.agentC });
})();

// ----------------------------------------------------------------------------- 5. Task with escrow and conditional settlement
(function taskUnit() {
  const unitId = 5;
  const task = el('task', erc721(A.taskToken, 17), { label: 'Task tender 17 (translation corpus)' });
  const escrow = el('financial-position', 'urn:x:escrow:task-17', { label: 'Escrowed bounty held by the tender' });
  const buyer = el('agent', caip10(A.buyer), { label: 'Buyer (tender creator and funder)' });
  const worker = el('agent', caip10(A.worker), { label: 'Worker (accepted fulfiller)' });
  const judge = el('agent', caip10(A.judge), { label: 'Acceptance authority' });
  const deliverable = el('data', 'urn:x:deliverable:task-17:translated-corpus', { label: 'Deliverable (translated corpus)' });
  const elements = [task, escrow, buyer, worker, judge, deliverable];
  const relations = [
    rel('owns', 'unit', task, { exclusive: true }),
    rel('holds', 'unit', escrow, { quantity: { amount: '100', unit: 'USD' }, scope: 'visible, not withdrawable by the buyer while the tender is open' }),
    rel('pledges', 'unit', escrow, { scope: 'released to the worker on acceptance; refunded to the buyer on cancellation or expiry', obligations: 'release rule of the tender' }),
    rel('commits', worker, task, { scope: 'deliver the translated corpus before the deadline', counterparty: caip10(A.buyer) }),
    rel('depends-on', 'unit', judge, { scope: 'acceptance decision' }),
    rel('exchanges', buyer, escrow, { scope: 'funding of the bounty' }),
    rel('exchanges', escrow, worker, { scope: 'payout on acceptance' }),
    rel('controls', judge, escrow, { scope: 'acceptance releases the payout; rejection keeps the escrow' }),
    rel('exchanges', worker, deliverable, { scope: 'submission' }),
  ];
  const ports = [
    { id: 'bounty-in', direction: 'in', class: 'funds', template: 'auf:port:funds-in@1', asset: STABLE, conditions: 'funding by the buyer while the tender is open' },
    { id: 'deliverable-in', direction: 'in', class: 'deliverable', template: 'auf:port:deliverable-in@1', conditions: 'submission by the accepted worker before the deadline' },
    { id: 'acceptance-in', direction: 'in', class: 'control', template: 'auf:port:control-in@1', conditions: 'acceptance or rejection by the acceptance authority within the judgment window' },
    { id: 'payout-out', direction: 'out', class: 'funds', template: 'auf:port:funds-out@1', asset: STABLE, conditions: 'on acceptance, to the worker', stateEffects: 'escrow to zero, tender settled' },
    { id: 'refund-out', direction: 'out', class: 'funds', template: 'auf:port:funds-out@1', asset: STABLE, conditions: 'on cancellation or expiry, to the buyer', stateEffects: 'escrow to zero, tender closed' },
  ];
  const doc = definition({
    name: 'Task 17: translated corpus (conditional settlement)',
    summary: 'A task with an escrowed bounty and conditional settlement. The escrow is a container while funded, a pledge while delivery awaits acceptance, a valve and a conductor when it pays out. The bounty balance, the worker\'s fulfillment claim and the buyer\'s obligation are three different valuations.',
    tags: ['task', 'escrow', 'conditional-settlement'],
    elements, relations, ports,
    authorities: { definitionController: caip10(A.buyer), representatives: [{ account: caip10(A.judge), scope: 'acceptance decision only' }], beneficiaries: [{ account: caip10(A.worker), scope: 'payout on acceptance' }, { account: caip10(A.buyer), scope: 'refund on cancellation or expiry' }] },
    validity: { until: '2026-12-01T00:00:00Z' },
    scale: { window: 'P30D' },
  });
  const boundaryHash = canonicalHash(doc);
  write('task-conditional-settlement.json', doc);

  write('task-conditional-settlement.characterization.json', {
    auf: '1.0', kind: 'characterization', subject: subject(unitId, 1, boundaryHash),
    roles: [
      roleStmt('container', S.element(escrow), { mechanism: 'funds', state: 'funded', conditions: 'while the tender is open' }),
      roleStmt('pledge', S.element(escrow), { mechanism: 'reservation', state: 'awaiting acceptance', conditions: 'from submission until the judgment window closes' }),
      roleStmt('valve', S.port('payout-out'), { mechanism: 'trigger', conditions: 'opens only on acceptance' }),
      roleStmt('control', S.port('acceptance-in'), { mechanism: 'acceptance', conditions: 'one acceptance signal releases the whole bounty' }),
      roleStmt('conductor', S.port('payout-out'), { mechanism: 'transfer', conditions: 'escrow to worker' }),
      roleStmt('sink', S.port('deliverable-in'), { mechanism: 'consumption', conditions: 'the task absorbs the service demand of the buyer' }),
      roleStmt('damping', S.unit(), { mechanism: 'fee', conditions: 'protocol or judgment fees, if the tender charges any' }),
    ],
    attributes: { linearity: 'piecewise-linear', determinism: 'stochastic', timeVariance: 'time-varying', memory: 'history-dependent' },
    structure: { profile: 'auf:structure:composite@1', notes: 'Conditional settlement composite: reserve, obligation, acceptance condition and payment path.' },
    knowledge: { status: 'classified' },
  });

  const stateHash = canonicalHash({ note: 'tender 17 state at 2026-11-01', escrow: '100', status: 'open', submission: 'pending' });
  write('task-conditional-settlement.valuation.position.json', {
    auf: '1.0', kind: 'valuation', subject: subject(unitId, 1, boundaryHash), assessmentBoundary: { hash: boundaryHash },
    interest: { id: 'auf:interest:position@1', perspective: 'funder', detail: 'escrowed bounty balance' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: stateHash },
    method: { id: M.netEquity, name: 'auf:method:net-equity@1', params: { denomination: 'USD', assets: [{ element: escrow._id, quantity: '100', price: '1', priceSource: 'stable at par', priceAt: '2026-11-01T00:00:00Z', restrictions: ['locked', 'contingent'] }], liabilities: [] } },
    inputs: { data: [{ element: escrow._id, source: 'escrow balance' }], coverage: 'escrow balance only; the balance is locked and contingent' },
    result: { kind: 'monetary', value: '100.00', denomination: 'USD', decimals: 2 },
    evaluator: caip10(A.evaluator),
    notes: 'The bounty balance is a position, not the value of the task to anyone.',
  });
  write('task-conditional-settlement.valuation.fulfillment-claim.json', {
    auf: '1.0', kind: 'valuation', subject: subject(unitId, 1, boundaryHash), assessmentBoundary: { hash: boundaryHash },
    interest: { id: 'auf:interest:fulfillment-claim@1', perspective: 'executor', detail: 'the worker\'s conditional claim to the bounty' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: stateHash },
    method: { id: M.conditional, name: 'auf:method:conditional-payoff@1', params: { denomination: 'USD', scenarios: [{ name: 'accepted', probability: '0.6', payoff: '100' }, { name: 'rejected', probability: '0.4', payoff: '0' }], rate: '0.1', periods: 1, probabilityBasis: 'declared', costsIncluded: false } },
    inputs: { data: [{ element: task._id, source: 'tender terms' }], estimates: ['acceptance probability'], coverage: 'payout only; the worker\'s costs are excluded' },
    result: { kind: 'scenario', denomination: 'USD', decimals: 2, scenarios: [{ name: 'accepted', probability: '0.6', value: '100' }, { name: 'rejected', probability: '0.4', value: '0' }], value: '54.55' },
    evaluator: caip10(A.evaluator),
  });
  write('task-conditional-settlement.valuation.obligation.json', {
    auf: '1.0', kind: 'valuation', subject: subject(unitId, 1, boundaryHash), assessmentBoundary: { hash: boundaryHash },
    interest: { id: 'auf:interest:obligation@1', perspective: 'holder', detail: 'the buyer\'s expected payment under the tender (refund on rejection)' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: stateHash },
    method: { id: M.conditional, name: 'auf:method:conditional-payoff@1', params: { denomination: 'USD', scenarios: [{ name: 'accepted', probability: '0.6', payoff: '-100' }, { name: 'rejected', probability: '0.4', payoff: '0' }], rate: '0.1', periods: 1, probabilityBasis: 'declared', costsIncluded: false } },
    inputs: { data: [{ element: escrow._id }], estimates: ['acceptance probability'], coverage: 'payment only; the value of the deliverable to the buyer is a separate interest' },
    result: { kind: 'scenario', denomination: 'USD', decimals: 2, scenarios: [{ name: 'accepted', probability: '0.6', value: '-100' }, { name: 'rejected', probability: '0.4', value: '0' }], value: '-54.55' },
    evaluator: caip10(A.evaluator),
    notes: 'Negative results are first-class: an obligation valued from the holder\'s perspective.',
  });

  manifest.units.push({ unitId, name: doc.unit.name, file: 'task-conditional-settlement.json', boundaryHash, contains: [], elements: Object.fromEntries(elements.map((e) => [e.label || e.ref, e._id])), controller: CONTROLLER_OVERRIDE || A.buyer });
})();

// ----------------------------------------------------------------------------- 6. No cash flow, contingent obligation
(function contingentObligation() {
  const unitId = 6;
  const guarantee = el('financial-position', 'urn:x:guarantee:task-17:performance', { label: 'Performance guarantee for task 17 (pays the buyer 100 if the worker fails)' });
  const task = el('task', erc721(A.taskToken, 17), { label: 'Guaranteed task' });
  const beneficiary = el('agent', caip10(A.buyer), { label: 'Beneficiary of the guarantee' });
  const elements = [guarantee, task, beneficiary];
  const relations = [
    rel('owes', 'unit', guarantee, { quantity: { amount: '100', unit: 'USD' }, scope: 'contingent: payable only if the task is not accepted by the deadline', counterparty: caip10(A.buyer), validUntil: '2026-12-01T00:00:00Z' }),
    rel('depends-on', 'unit', task, { scope: 'trigger condition' }),
    rel('exchanges', 'unit', beneficiary, { scope: 'guarantee payment on trigger' }),
  ];
  const ports = [
    { id: 'guarantee-out', direction: 'out', class: 'funds', template: 'auf:port:funds-out@1', asset: STABLE, conditions: 'task 17 not accepted by 2026-12-01', stateEffects: 'guarantee discharged' },
  ];
  const doc = definition({
    name: 'Performance guarantee for task 17',
    summary: 'A Unit with no cash flow at all and one contingent payment obligation. Its value is negative or scenario-shaped, and it must be describable although nothing has happened yet.',
    tags: ['guarantee', 'contingent'],
    elements, relations, ports,
    authorities: { definitionController: caip10(A.guarantor) },
    validity: { until: '2026-12-01T00:00:00Z' },
    scale: { window: 'P30D' },
  });
  const boundaryHash = canonicalHash(doc);
  write('contingent-obligation-unit.json', doc);

  write('contingent-obligation-unit.characterization.json', {
    auf: '1.0', kind: 'characterization', subject: subject(unitId, 1, boundaryHash),
    roles: [
      roleStmt('pledge', S.element(guarantee), { mechanism: 'performance-guarantee', conditions: 'stands until acceptance or trigger' }),
      roleStmt('valve', S.port('guarantee-out'), { mechanism: 'trigger', conditions: 'non-acceptance by the deadline' }),
    ],
    attributes: { linearity: 'piecewise-linear', determinism: 'stochastic', timeVariance: 'time-varying', memory: 'memoryless' },
    structure: { profile: 'auf:structure:simple@1' },
    knowledge: { status: 'classified' },
  });
  const observation = {
    auf: '1.0', kind: 'observation', subject: subject(unitId, 1, boundaryHash),
    window: { from: '2026-10-01T00:00:00Z', to: '2026-10-31T23:59:59Z' }, snapshotAt: '2026-10-31T23:59:59Z',
    assets: [{ asset: STABLE, opening: '0', closing: '0', inflow: '0', outflow: '0', minted: '0', burned: '0', adjustments: [], transfers: [] }],
    coverage: { observed: ['guarantee-out port'], missing: [], method: 'indexer over the guarantor account', source: 'urn:x:indexer:example' },
  };
  const observationHash = canonicalHash(observation);
  write('contingent-obligation-unit.observation.json', observation);
  write('contingent-obligation-unit.valuation.obligation.json', {
    auf: '1.0', kind: 'valuation', subject: subject(unitId, 1, boundaryHash), assessmentBoundary: { hash: boundaryHash },
    interest: { id: 'auf:interest:obligation@1', perspective: 'holder' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: observationHash },
    method: { id: M.conditional, name: 'auf:method:conditional-payoff@1', params: { denomination: 'USD', scenarios: [{ name: 'task fails', probability: '0.4', payoff: '-100' }, { name: 'task accepted', probability: '0.6', payoff: '0' }], rate: '0.1', periods: 1, probabilityBasis: 'estimated', costsIncluded: true } },
    inputs: { data: [{ element: guarantee._id }], estimates: ['failure probability estimated from the worker\'s history'], coverage: 'full' },
    result: { kind: 'scenario', denomination: 'USD', decimals: 2, scenarios: [{ name: 'task fails', probability: '0.4', value: '-100' }, { name: 'task accepted', probability: '0.6', value: '0' }], value: '-36.36' },
    evaluator: caip10(A.evaluator),
    notes: '(0.4 x -100 + 0.6 x 0) / 1.1 = -36.3636..., rounded to two decimals.',
  });
  write('contingent-obligation-unit.valuation.insufficient-evidence.json', {
    auf: '1.0', kind: 'valuation', subject: subject(unitId, 1, boundaryHash), assessmentBoundary: { hash: boundaryHash },
    interest: { id: 'auf:interest:obligation@1', perspective: 'analyst' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: observationHash },
    method: { id: M.conditional, name: 'auf:method:conditional-payoff@1', params: { denomination: 'USD', rate: '0.1', periods: 1, probabilityBasis: 'estimated', costsIncluded: true } },
    inputs: { data: [{ element: guarantee._id }], missing: [{ item: 'failure probability', reason: 'no history of the worker available to this evaluator' }], coverage: 'trigger amount only' },
    result: { kind: 'insufficient-evidence', reason: 'the failure probability cannot be estimated from the evidence available; the obligation is not valued at zero', missing: ['failure probability'] },
    evaluator: caip10(A.operator),
    notes: 'Exception vector "Missing evidence": missing inputs produce insufficient-evidence, never a zero value.',
  });

  manifest.units.push({ unitId, name: doc.unit.name, file: 'contingent-obligation-unit.json', boundaryHash, contains: [], elements: Object.fromEntries(elements.map((e) => [e.label || e.ref, e._id])), controller: CONTROLLER_OVERRIDE || A.guarantor });
})();

// ----------------------------------------------------------------------------- 7. Running agent packaged as a chip
(function agentChip() {
  const unitId = 7;
  const agent = el('agent', caip10(A.agentOpc), { label: 'Running agent (one-person company)', extensions: { 'x:auf.example:agent-identity': { registry: 'agent identity registry', agentId: '11039' } } });
  const skill1 = el('skill', erc721(A.skillToken, 2), { label: 'Owned skill: research pipeline' });
  const skill2 = el('skill', erc721(A.skillToken, 1), { label: 'Licensed skill: summarizer' });
  const compute = el('compute', 'urn:x:compute:provider-example:gpu-hours:2026q4', { label: 'Reserved GPU hours' });
  const data = el('data', 'urn:x:data:corpus-example:v3', { label: 'Licensed corpus (access and use, no sublicensing)' });
  const treasury = el('financial-position', caip10(A.treasuryOpc), { label: 'Treasury' });
  const operator = el('agent', caip10(A.operator), { label: 'Human operator (policy control)' });
  const elements = [agent, skill1, skill2, compute, data, treasury, operator];
  const relations = [
    rel('owns', 'unit', skill1, { exclusive: true, share: '1' }),
    rel('licenses', 'unit', skill2, { scope: 'inference calls', exclusive: false, validUntil: '2026-12-31T23:59:59Z' }),
    rel('reserves', 'unit', compute, { quantity: { amount: '500', unit: 'GPU-hour' }, validFrom: '2026-10-01T00:00:00Z', validUntil: '2026-12-31T23:59:59Z' }),
    rel('licenses', 'unit', data, { scope: 'access and use for the agent\'s own outputs; no sublicensing; no ownership', exclusive: false }),
    rel('holds', 'unit', treasury),
    rel('controls', operator, agent, { scope: 'policy and budget limits' }),
    rel('controls', agent, treasury, { scope: 'spending within limits' }),
    rel('exchanges', agent, compute, { scope: 'consumption' }),
  ];
  const ports = [
    { id: 'service-out', direction: 'out', class: 'deliverable', template: 'auf:port:service-out@1', conditions: 'priced per request', extensions: { 'x:auf.example:protocol-binding': { protocol: 'x402', transport: 'https' } } },
    { id: 'revenue-in', direction: 'in', class: 'funds', template: 'auf:port:funds-in@1', asset: STABLE, account: caip10(A.treasuryOpc) },
    { id: 'compute-out', direction: 'out', class: 'funds', template: 'auf:port:funds-out@1', asset: STABLE, account: caip10(A.treasuryOpc), conditions: 'compute invoices' },
    { id: 'policy-in', direction: 'in', class: 'control', template: 'auf:port:control-in@1', conditions: 'operator changes policy or limits' },
  ];
  const doc = definition({
    name: 'Agent OPC (one-person company)',
    summary: 'A running agent with an owned skill, a licensed skill, reserved compute, a licensed corpus, a treasury and a human operator holding policy control. Packaged under the chip profile; carries source, container, damping, sink and control roles at the same time.',
    tags: ['agent', 'chip', 'opc'],
    elements, relations, ports,
    authorities: { definitionController: caip10(A.operator), representatives: [{ account: caip10(A.agentOpc), scope: 'service contracts within the operator\'s limits' }], settlementAccounts: [caip10(A.treasuryOpc)] },
    scale: { window: 'P30D' },
  });
  const boundaryHash = canonicalHash(doc);
  write('agent-chip.json', doc);

  write('agent-chip.characterization.json', {
    auf: '1.0', kind: 'characterization', subject: subject(unitId, 1, boundaryHash),
    roles: [
      roleStmt('source', S.port('service-out'), { mechanism: 'production', conditions: 'paid requests' }),
      roleStmt('container', S.element(treasury), { mechanism: 'funds' }),
      roleStmt('damping', S.port('compute-out'), { mechanism: 'resource-use', conditions: 'compute cost per request' }),
      roleStmt('sink', S.element(compute), { mechanism: 'consumption' }),
      roleStmt('control', S.port('policy-in'), { mechanism: 'budget', conditions: 'operator limits gate spending' }),
      roleStmt('control', S.element(agent), { mechanism: 'pricing', conditions: 'the agent sets per-request prices' }),
    ],
    attributes: { linearity: 'nonlinear', determinism: 'stochastic', timeVariance: 'time-varying', memory: 'history-dependent' },
    models: [{
      profile: 'auf:model:financial-circuit@1',
      variables: { q: { stands_for: 'stable balance of the treasury', unit: 'USD' }, i: { stands_for: 'net stable flow through revenue-in and compute-out', unit: 'USD per day' }, v: { stands_for: 'price margin per request over compute cost', unit: 'USD per request' }, phi: { stands_for: 'time integral of the margin', unit: 'USD per request times days' } },
      elements: [
        { scope: { type: 'port', id: 'service-out' }, type: 'source', parameters: { kind: 'flow source', notes: 'request volume drives i' } },
        { scope: { type: 'element', id: treasury._id }, type: 'capacitive', parameters: { notes: 'balance accumulates net flow' } },
        { scope: { type: 'port', id: 'compute-out' }, type: 'resistive', parameters: { notes: 'cost proportional to request volume within the reserved quota' } },
        { scope: { type: 'element', id: agent._id }, type: 'controlled', parameters: { notes: 'pricing policy modulates the source' } },
        { scope: { type: 'port', id: 'policy-in' }, type: 'switch', parameters: { notes: 'operator can halt spending' } },
      ],
      premises: { window: 'P30D', operatingRange: 'request volume within the reserved GPU hours', linearization: 'constant price and cost per request within the window', errorBound: 'not estimated' },
      applicability: { window: 'P30D', scale: 'daily flows', operatingRange: 'within quota', errorBound: 'not estimated' },
    }],
    structure: { profile: 'auf:structure:chip@1', interfaces: ['service-out', 'revenue-in', 'compute-out', 'policy-in'] },
    applications: [{ profile: 'auf:application:credit@1', parameters: { terms: ['compute credit line of the provider'], inputs: ['settled invoices', 'agent identity record'], rule: 'provider policy', downgrade: 'two missed invoices' } }],
    knowledge: { status: 'classified' },
  });
  const observation = {
    auf: '1.0', kind: 'observation', subject: subject(unitId, 1, boundaryHash),
    window: { from: '2026-10-01T00:00:00Z', to: '2026-10-31T23:59:59Z' }, snapshotAt: '2026-10-31T23:59:59Z',
    assets: [{ asset: STABLE, opening: '0', closing: '65', inflow: '100', outflow: '35', minted: '0', burned: '0', adjustments: [],
      transfers: [
        { port: 'revenue-in', direction: 'in', amount: '100', counterparty: 'paying clients' },
        { port: 'compute-out', direction: 'out', amount: '30', counterparty: 'compute provider' },
        { port: 'compute-out', direction: 'out', amount: '5', counterparty: 'payment rail fees' },
      ] }],
    nonCash: [{ subject: compute._id, kind: 'quota-consumption', from: '500 GPU-hours reserved', to: '380 GPU-hours remaining' }],
    coverage: { observed: ['treasury account'], missing: [], method: 'indexer', source: 'urn:x:indexer:example' },
  };
  const observationHash = canonicalHash(observation);
  write('agent-chip.observation.json', observation);
  write('agent-chip.valuation.whole-dcf.json', {
    auf: '1.0', kind: 'valuation', subject: subject(unitId, 1, boundaryHash), assessmentBoundary: { hash: boundaryHash },
    interest: { id: 'auf:interest:whole@1', perspective: 'holder' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: observationHash },
    method: { id: M.dcf, name: 'auf:method:finite-horizon-dcf@1', params: { denomination: 'USD', cashflows: ['65', '65'], rate: '0.1', terminalValue: '0', periodLength: 'P30D', attribution: 'net cash flow of the whole Unit' } },
    inputs: { data: [{ observation: observationHash }], estimates: ['two periods repeating October'], coverage: 'two periods, no terminal value, reserved compute not separately valued' },
    result: { kind: 'monetary', value: '112.81', denomination: 'USD', decimals: 2 },
    horizon: { from: '2026-11-01T00:00:00Z', to: '2026-12-31T23:59:59Z' },
    evaluator: caip10(A.evaluator),
  });

  manifest.units.push({ unitId, name: doc.unit.name, file: 'agent-chip.json', boundaryHash, contains: [], elements: Object.fromEntries(elements.map((e) => [e.label || e.ref, e._id])), controller: CONTROLLER_OVERRIDE || A.operator });
})();

// ----------------------------------------------------------------------------- 8 to 11. One revenue entitlement under two references
// Exception vector "Overlap under different references" (ERC Section 3.8 and 10.6). Fund F holds 40% of the license
// fee stream of the Summarizer Skill Business (Unit 1) through two wrappers set up at different times: an assignment
// agreement (Unit 9) and the later tokenization of that same agreement into RST tokens (Unit 8). The two positions
// have different references and therefore different element ids, but the same underlying. A composite defined by
// the fund declares `same-claim` with the tokenization terms as basis and is valued with the entitlement counted
// once (Unit 10). A composite defined by an analyst who contains both holdings without establishing the relation
// (Unit 11) has an unresolved overlap: its receipts are an interval and an insufficient-evidence statement.
(function overlapUnits() {
  const underlying = { ref: unitRef(CHAIN, REGISTRY, 1, 1), port: 'fees-in', share: '0.4' };
  const dcfReceipt = JSON.parse(fs.readFileSync(path.join(OUT, 'skill-multi-license.valuation.revenue-right-dcf.json'), 'utf8'));
  const dcfHash = canonicalHash(dcfReceipt);
  const TOKEN_TERMS = 'urn:x:terms:rst-tokenization-2026';
  const AGREEMENT = 'urn:x:agreement:summarizer-fee-assignment-2026';

  // 8. Token form
  const tokenPosition = el('financial-position', `eip155:${CHAIN}/erc20:${A.revenueToken}`, {
    label: 'RST revenue-share tokens (40% of the license fee stream of Unit 1)',
    underlying: { ...underlying, basis: [TOKEN_TERMS] },
  });
  const docToken = definition({
    name: 'Revenue right on the Summarizer business, token form',
    summary: 'Fund F holds 400 RST tokens, the tokenized form of a 40% assignment of the license fee stream of the Summarizer Skill Business. The position declares its underlying: Unit 1, port fees-in, share 0.4.',
    tags: ['revenue-right', 'position', 'overlap-vector'],
    elements: [tokenPosition],
    relations: [rel('holds', 'unit', tokenPosition, { quantity: { amount: '400', unit: 'RST' }, share: '0.4', counterparty: caip10(A.skillOwner), basis: [TOKEN_TERMS] })],
    ports: [{ id: 'distributions-in', direction: 'in', class: 'funds', template: 'auf:port:funds-in@1', asset: STABLE, account: caip10(A.fundTreasury), conditions: 'monthly distributions to RST holders' }],
    authorities: { definitionController: caip10(A.fundDeskA), settlementAccounts: [caip10(A.fundTreasury)] },
    scale: { window: 'P30D' },
  });
  const tokenHash = canonicalHash(docToken);
  write('revenue-right-token.json', docToken);
  write('revenue-right-token.characterization.json', {
    auf: '1.0', kind: 'characterization', subject: subject(8, 1, tokenHash),
    roles: [roleStmt('container', S.element(tokenPosition), { mechanism: 'rights', conditions: 'entitlement to 40% of the fee stream while the tokens are held' })],
    structure: { profile: 'auf:structure:simple@1' },
    knowledge: { status: 'classified' },
  });
  manifest.units.push({ unitId: 8, name: docToken.unit.name, file: 'revenue-right-token.json', boundaryHash: tokenHash, contains: [], elements: { [tokenPosition.label]: tokenPosition._id }, controller: CONTROLLER_OVERRIDE || A.fundDeskA });

  // 9. Contractual form
  const contractPosition = el('financial-position', AGREEMENT, {
    label: 'Assigned right to 40% of the license fee stream of Unit 1 (assignment agreement)',
    underlying: { ...underlying, basis: [AGREEMENT] },
  });
  const docContract = definition({
    name: 'Revenue right on the Summarizer business, contractual form',
    summary: 'Fund F is the assignee under an agreement that assigns 40% of the license fee stream of the Summarizer Skill Business. The position declares the same underlying as the token form: Unit 1, port fees-in, share 0.4.',
    tags: ['revenue-right', 'position', 'overlap-vector'],
    elements: [contractPosition],
    relations: [rel('holds', 'unit', contractPosition, { share: '0.4', counterparty: caip10(A.skillOwner), basis: [AGREEMENT] })],
    ports: [{ id: 'distributions-in', direction: 'in', class: 'funds', template: 'auf:port:funds-in@1', asset: STABLE, account: caip10(A.fundTreasury), conditions: 'monthly payments under the assignment' }],
    authorities: { definitionController: caip10(A.fundDeskB), settlementAccounts: [caip10(A.fundTreasury)] },
    scale: { window: 'P30D' },
  });
  const contractHash = canonicalHash(docContract);
  write('revenue-right-contract.json', docContract);
  write('revenue-right-contract.characterization.json', {
    auf: '1.0', kind: 'characterization', subject: subject(9, 1, contractHash),
    roles: [roleStmt('container', S.element(contractPosition), { mechanism: 'rights', conditions: 'entitlement to 40% of the fee stream under the assignment' })],
    structure: { profile: 'auf:structure:simple@1' },
    knowledge: { status: 'classified' },
  });
  manifest.units.push({ unitId: 9, name: docContract.unit.name, file: 'revenue-right-contract.json', boundaryHash: contractHash, contains: [], elements: { [contractPosition.label]: contractPosition._id }, controller: CONTROLLER_OVERRIDE || A.fundDeskB });

  const ENTITLEMENT_VALUE = '45.12'; // 0.4 x 112.81 (revenue-right DCF receipt of Unit 1), rounded to two decimals
  const TWICE = '90.24';
  const priceInput = (position) => ({ element: position._id, quantity: '1', price: ENTITLEMENT_VALUE, priceSource: `0.4 x the revenue-right DCF receipt of Unit 1 (${dcfHash})`, priceAt: '2026-11-01T00:00:00Z' });
  const snapshotHash = canonicalHash({ note: 'revenue-right DCF receipt of Unit 1 used as the price basis', receipt: dcfHash, share: '0.4' });

  // 10. Composite defined by the fund: overlap declared
  const unit8 = el('unit', unitRef(CHAIN, REGISTRY, 8, 1), { label: 'Token form, version 1' });
  const unit9 = el('unit', unitRef(CHAIN, REGISTRY, 9, 1), { label: 'Contractual form, version 1' });
  const docDeclared = definition({
    name: 'Fund F revenue holdings (overlap declared)',
    summary: 'The fund contains both holdings and states that the RST tokens are the tokenized form of the assignment agreement: the two positions are one economic claim under two references.',
    tags: ['composite', 'overlap-vector'],
    elements: [unit8, unit9, tokenPosition, contractPosition],
    relations: [
      rel('contains', 'unit', unit8),
      rel('contains', 'unit', unit9),
      rel('same-claim', tokenPosition, contractPosition, { scope: 'the RST tokens represent the rights under the assignment agreement; one 40% entitlement, not two', basis: [TOKEN_TERMS, AGREEMENT] }),
    ],
    ports: [{ id: 'distributions-in', direction: 'in', class: 'funds', template: 'auf:port:funds-in@1', asset: STABLE, account: caip10(A.fundTreasury) }],
    authorities: { definitionController: caip10(A.fund), settlementAccounts: [caip10(A.fundTreasury)] },
    scale: { window: 'P30D' },
  });
  const declaredHash = canonicalHash(docDeclared);
  write('revenue-holdings-declared.json', docDeclared);
  write('revenue-holdings-declared.characterization.json', {
    auf: '1.0', kind: 'characterization', subject: subject(10, 1, declaredHash),
    roles: [roleStmt('container', S.unit(), { mechanism: 'rights', conditions: 'one 40% entitlement held through two wrappers' })],
    structure: { profile: 'auf:structure:composite@1' },
    knowledge: { status: 'classified', notes: 'The same-claim relation between the two positions is declared by the fund with the tokenization terms as basis.' },
  });
  write('revenue-holdings-declared.valuation.net-equity.json', {
    auf: '1.0', kind: 'valuation', subject: subject(10, 1, declaredHash), assessmentBoundary: { hash: declaredHash },
    interest: { id: 'auf:interest:net-equity@1', perspective: 'holder' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: snapshotHash },
    method: { id: M.netEquity, name: 'auf:method:net-equity@1', params: { denomination: 'USD', assets: [priceInput(tokenPosition)], liabilities: [] } },
    inputs: {
      data: [{ element: tokenPosition._id, source: 'RST balance of the fund' }, { element: contractPosition._id, source: 'assignment agreement' }, { receipt: dcfHash, use: 'value of the whole fee stream' }],
      overlaps: [{ elements: [tokenPosition._id, contractPosition._id], treatment: 'counted-once', basis: [TOKEN_TERMS], notes: 'declared same-claim in the definition of this Unit; the entitlement enters the sum once' }],
      coverage: 'the 40% entitlement only; no other assets or liabilities',
    },
    result: { kind: 'monetary', value: ENTITLEMENT_VALUE, denomination: 'USD', decimals: 2 },
    evaluator: caip10(A.evaluator),
    notes: 'Exception vector "Overlap under different references", declared case: the two positions form one claim group and are counted once (0.4 x 112.81 = 45.12).',
  });
  manifest.units.push({ unitId: 10, name: docDeclared.unit.name, file: 'revenue-holdings-declared.json', boundaryHash: declaredHash, contains: [{ unitId: 8, version: 1 }, { unitId: 9, version: 1 }], elements: Object.fromEntries([unit8, unit9, tokenPosition, contractPosition].map((e) => [e.label || e.ref, e._id])), controller: CONTROLLER_OVERRIDE || A.fund });

  // 11. Composite defined by an analyst: overlap undeclared
  const docUndeclared = definition({
    name: 'Combined revenue holdings as seen by an analyst (overlap undeclared)',
    summary: 'An analyst contains both holdings without establishing whether they are one claim or two. The resolver reports an unresolved overlap candidate (same underlying, no declaration), and a point-valued sum is not admissible.',
    tags: ['composite', 'overlap-vector'],
    elements: [unit8, unit9],
    relations: [rel('contains', 'unit', unit8), rel('contains', 'unit', unit9)],
    ports: [],
    authorities: { definitionController: caip10(A.analyst) },
    scale: { window: 'P30D' },
  });
  const undeclaredHash = canonicalHash(docUndeclared);
  write('revenue-holdings-undeclared.json', docUndeclared);
  write('revenue-holdings-undeclared.characterization.json', {
    auf: '1.0', kind: 'characterization', subject: subject(11, 1, undeclaredHash),
    structure: { profile: 'auf:structure:composite@1' },
    knowledge: { status: 'insufficient-evidence', notes: 'Whether the token position and the contractual right are the same claim is not established in this definition.' },
  });
  write('revenue-holdings-undeclared.valuation.net-equity.interval.json', {
    auf: '1.0', kind: 'valuation', subject: subject(11, 1, undeclaredHash), assessmentBoundary: { hash: undeclaredHash },
    interest: { id: 'auf:interest:net-equity@1', perspective: 'analyst' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: snapshotHash },
    method: { id: M.netEquity, name: 'auf:method:net-equity@1', params: { denomination: 'USD', assets: [priceInput(tokenPosition), priceInput(contractPosition)], liabilities: [] } },
    inputs: {
      data: [{ element: tokenPosition._id, source: 'RST balance' }, { element: contractPosition._id, source: 'assignment agreement' }, { receipt: dcfHash, use: 'value of the whole fee stream' }],
      overlaps: [{ elements: [tokenPosition._id, contractPosition._id], treatment: 'unresolved', notes: 'same underlying (Unit 1, port fees-in, share 0.4), no same-claim or distinct-claim declaration, no acknowledgment by the obligor' }],
      coverage: 'the two positions only',
    },
    result: { kind: 'interval', low: ENTITLEMENT_VALUE, high: TWICE, denomination: 'USD', decimals: 2 },
    evaluator: caip10(A.evaluator),
    notes: 'Exception vector "Overlap under different references", undeclared case: low = the candidates counted once (45.12), high = counted separately (90.24); no point estimate is given.',
  });
  write('revenue-holdings-undeclared.valuation.net-equity.insufficient-evidence.json', {
    auf: '1.0', kind: 'valuation', subject: subject(11, 1, undeclaredHash), assessmentBoundary: { hash: undeclaredHash },
    interest: { id: 'auf:interest:net-equity@1', perspective: 'analyst' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: snapshotHash },
    method: { id: M.netEquity, name: 'auf:method:net-equity@1', params: { denomination: 'USD', assets: [priceInput(tokenPosition), priceInput(contractPosition)], liabilities: [] } },
    inputs: {
      data: [{ element: tokenPosition._id }, { element: contractPosition._id }],
      overlaps: [{ elements: [tokenPosition._id, contractPosition._id], treatment: 'unresolved' }],
      missing: [{ item: `${tokenPosition._id} / ${contractPosition._id}`, reason: 'identity of the two claims not established; a same-claim or distinct-claim declaration with a basis, or an acknowledgment by the obligor, is required before the positions can be added' }],
      coverage: 'the two positions only',
    },
    result: { kind: 'insufficient-evidence', reason: 'unresolved overlap between the token position and the contractual right', missing: [`${tokenPosition._id} / ${contractPosition._id}`] },
    evaluator: caip10(A.evaluator),
    notes: 'Exception vector "Overlap under different references", undeclared case, alternative statement to the interval receipt.',
  });
  manifest.units.push({ unitId: 11, name: docUndeclared.unit.name, file: 'revenue-holdings-undeclared.json', boundaryHash: undeclaredHash, contains: [{ unitId: 8, version: 1 }, { unitId: 9, version: 1 }], elements: Object.fromEntries([unit8, unit9].map((e) => [e.label || e.ref, e._id])), controller: CONTROLLER_OVERRIDE || A.analyst });

  // ----------------------------------------------------------------------------- 12 and 13. Additivity must be established (exception vector 9)
  // 12. References silent: the same two holdings listed directly, one without `underlying`, the other with an `underlying`
  // that names the fee stream under another URI. No overlap candidate is detected; the pair is unresolved all the same.
  const silentToken = el('financial-position', `eip155:${CHAIN}/erc20:${A.revenueToken}`, {
    label: 'RST revenue-share tokens (no underlying declared)',
  });
  const aliasedContract = el('financial-position', 'https://fund-f.example/agreements/summarizer-fee-assignment', {
    label: 'Assigned right to 40% of the Summarizer fee stream (agreement referenced by URL)',
    underlying: { ref: 'https://skills.example/summarizer/v3#license-fees', share: '0.4', basis: ['https://fund-f.example/agreements/summarizer-fee-assignment'] },
  });
  const docSilent = definition({
    name: 'Combined revenue holdings as seen by a second analyst (references silent)',
    summary: 'A second analyst lists the token position without an underlying and the assignment under a different URI, with an underlying that names the fee stream under yet another URI, and declares nothing about their relation. No overlap candidate is detected. The pair is an unresolved pair nevertheless: nothing states that the two positions are distinct claims, so a point-valued sum is not admissible.',
    tags: ['composite', 'additivity-vector'],
    elements: [silentToken, aliasedContract],
    relations: [rel('holds', 'unit', silentToken, { quantity: { amount: '400', unit: 'RST' } }), rel('holds', 'unit', aliasedContract, { share: '0.4' })],
    ports: [],
    authorities: { definitionController: caip10(A.analystB) },
    scale: { window: 'P30D' },
  });
  const silentHash = canonicalHash(docSilent);
  write('revenue-holdings-silent.json', docSilent);
  write('revenue-holdings-silent.characterization.json', {
    auf: '1.0', kind: 'characterization', subject: subject(12, 1, silentHash),
    structure: { profile: 'auf:structure:composite@1' },
    knowledge: { status: 'insufficient-evidence', notes: 'Neither position declares what the other is to it; no underlying matches; the absence of a detected overlap establishes nothing.' },
  });
  const silentOverlap = { elements: [silentToken._id, aliasedContract._id], treatment: 'unresolved', notes: 'no same-claim or distinct-claim declaration covers the pair; no overlap candidate was detected (one position has no underlying, the other names the fee stream under a URI that matches nothing), which does not establish that the claims are distinct' };
  write('revenue-holdings-silent.valuation.net-equity.interval.json', {
    auf: '1.0', kind: 'valuation', subject: subject(12, 1, silentHash), assessmentBoundary: { hash: silentHash },
    interest: { id: 'auf:interest:net-equity@1', perspective: 'analyst' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: snapshotHash },
    method: { id: M.netEquity, name: 'auf:method:net-equity@1', params: { denomination: 'USD', assets: [priceInput(silentToken), priceInput(aliasedContract)], liabilities: [] } },
    inputs: {
      data: [{ element: silentToken._id, source: 'RST balance' }, { element: aliasedContract._id, source: 'assignment agreement (URL)' }, { receipt: dcfHash, use: 'value of the whole fee stream' }],
      overlaps: [silentOverlap],
      coverage: 'the two positions only',
    },
    result: { kind: 'interval', low: ENTITLEMENT_VALUE, high: TWICE, denomination: 'USD', decimals: 2 },
    evaluator: caip10(A.evaluator),
    notes: 'Exception vector "Additivity must be established", silent case: low = the pair counted once (45.12), high = counted separately (90.24); no point estimate, because nothing establishes that the two references are two claims.',
  });
  write('revenue-holdings-silent.valuation.net-equity.insufficient-evidence.json', {
    auf: '1.0', kind: 'valuation', subject: subject(12, 1, silentHash), assessmentBoundary: { hash: silentHash },
    interest: { id: 'auf:interest:net-equity@1', perspective: 'analyst' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: snapshotHash },
    method: { id: M.netEquity, name: 'auf:method:net-equity@1', params: { denomination: 'USD', assets: [priceInput(silentToken), priceInput(aliasedContract)], liabilities: [] } },
    inputs: {
      data: [{ element: silentToken._id }, { element: aliasedContract._id }],
      overlaps: [{ elements: [silentToken._id, aliasedContract._id], treatment: 'unresolved' }],
      missing: [{ item: `${silentToken._id} / ${aliasedContract._id}`, reason: 'distinctness of the two positions not established; a distinct-claim declaration with a basis (separate source agreements, different obligors or disjoint cash-flow schedules), or evidence of the same kind stated by the evaluator, is required before they can be added' }],
      coverage: 'the two positions only',
    },
    result: { kind: 'insufficient-evidence', reason: 'unresolved pair: the token position and the assignment are neither one claim group nor declared distinct', missing: [`${silentToken._id} / ${aliasedContract._id}`] },
    evaluator: caip10(A.evaluator),
    notes: 'Exception vector "Additivity must be established", silent case, alternative statement to the interval receipt.',
  });
  manifest.units.push({ unitId: 12, name: docSilent.unit.name, file: 'revenue-holdings-silent.json', boundaryHash: silentHash, contains: [], elements: Object.fromEntries([silentToken, aliasedContract].map((e) => [e.label || e.ref, e._id])), controller: CONTROLLER_OVERRIDE || A.analystB });

  // 13. Two tranches declared distinct: the fund holds the tokenized 40% and a second assignment of another 40%, both on
  // the same underlying, and states with a basis that they are two claims.
  const AGREEMENT_B = 'urn:x:agreement:summarizer-fee-assignment-2026-b';
  const secondAssignment = el('financial-position', AGREEMENT_B, {
    label: 'Assigned right to a further 40% of the license fee stream of Unit 1 (second assignment agreement)',
    underlying: { ...underlying, basis: [AGREEMENT_B] },
  });
  const docDistinct = definition({
    name: 'Fund G revenue holdings (two tranches declared distinct)',
    summary: 'Fund G holds the RST tokens (the tokenized 40% of the fee stream) and a second assignment agreement for a further 40%. Both positions declare the same underlying, so they are overlap candidates; the fund declares them distinct claims with both source agreements as basis, and the net-equity method counts them separately.',
    tags: ['composite', 'additivity-vector'],
    elements: [tokenPosition, secondAssignment],
    relations: [
      rel('holds', 'unit', tokenPosition, { quantity: { amount: '400', unit: 'RST' }, share: '0.4', counterparty: caip10(A.skillOwner), basis: [TOKEN_TERMS] }),
      rel('holds', 'unit', secondAssignment, { share: '0.4', counterparty: caip10(A.skillOwner), basis: [AGREEMENT_B] }),
      relSet('distinct-claim', [tokenPosition, secondAssignment], { scope: 'two separate assignments of 40% each (80% of the stream in total), under the tokenization terms and under a second agreement', basis: [TOKEN_TERMS, AGREEMENT_B] }),
    ],
    ports: [{ id: 'distributions-in', direction: 'in', class: 'funds', template: 'auf:port:funds-in@1', asset: STABLE, account: caip10(A.fundGTreasury) }],
    authorities: { definitionController: caip10(A.fundG), settlementAccounts: [caip10(A.fundGTreasury)] },
    scale: { window: 'P30D' },
  });
  const distinctHash = canonicalHash(docDistinct);
  write('revenue-holdings-distinct.json', docDistinct);
  write('revenue-holdings-distinct.characterization.json', {
    auf: '1.0', kind: 'characterization', subject: subject(13, 1, distinctHash),
    roles: [roleStmt('container', S.unit(), { mechanism: 'rights', conditions: 'two 40% entitlements to the fee stream, held under two instruments' })],
    structure: { profile: 'auf:structure:composite@1' },
    knowledge: { status: 'classified', notes: 'The distinct-claim declaration is made by the fund with both source agreements as basis; it is claimed until the obligor endorses either position.' },
  });
  write('revenue-holdings-distinct.valuation.net-equity.json', {
    auf: '1.0', kind: 'valuation', subject: subject(13, 1, distinctHash), assessmentBoundary: { hash: distinctHash },
    interest: { id: 'auf:interest:net-equity@1', perspective: 'holder' },
    snapshot: { asOf: '2026-11-01T00:00:00Z', hash: snapshotHash },
    method: { id: M.netEquity, name: 'auf:method:net-equity@1', params: { denomination: 'USD', assets: [priceInput(tokenPosition), priceInput(secondAssignment)], liabilities: [] } },
    inputs: {
      data: [{ element: tokenPosition._id, source: 'RST balance of the fund' }, { element: secondAssignment._id, source: 'second assignment agreement' }, { receipt: dcfHash, use: 'value of the whole fee stream' }],
      overlaps: [{ elements: [tokenPosition._id, secondAssignment._id], treatment: 'distinct', basis: [TOKEN_TERMS, AGREEMENT_B], notes: 'declared distinct-claim in the definition of this Unit (same underlying, two separate assignments); each tranche enters the sum' }],
      coverage: 'the two entitlements only; no other assets or liabilities',
    },
    result: { kind: 'monetary', value: TWICE, denomination: 'USD', decimals: 2 },
    evaluator: caip10(A.evaluator),
    notes: 'Exception vector "Additivity must be established", declared case: two tranches of 40% each, counted separately (2 x 45.12 = 90.24).',
  });
  manifest.units.push({ unitId: 13, name: docDistinct.unit.name, file: 'revenue-holdings-distinct.json', boundaryHash: distinctHash, contains: [], elements: Object.fromEntries([tokenPosition, secondAssignment].map((e) => [e.label || e.ref, e._id])), controller: CONTROLLER_OVERRIDE || A.fundG });
})();

for (const u of manifest.units) u.companions = companions[u.unitId] || [];
manifest.files = written;
write('manifest.json', manifest);
console.log(`wrote ${written.length} example files to ${OUT}`);
for (const u of manifest.units) console.log(`  unit ${u.unitId}  ${u.boundaryHash}  ${u.name}`);
