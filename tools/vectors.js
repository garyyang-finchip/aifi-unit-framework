#!/usr/bin/env node
'use strict';
// Generates the test vectors of the ERC assets (assets/erc-auf/vectors/*.json). The Foundry suite
// (test/Vectors.t.sol) reads the same files and checks every value against the Solidity side.
//
//   node tools/vectors.js          (requires `forge build` first for the interface ids)

const fs = require('fs');
const path = require('path');
const { keccak256, toUtf8Bytes, AbiCoder, TypedDataEncoder, Wallet } = require('ethers');
const C = require('./lib/canonical');
const V = require('./lib/valuation');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'erc-auf', 'vectors');
const ART = path.join(ROOT, 'out');

function readArtifact(file, name) {
  const p = path.join(ART, file, `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`artifact missing: ${p} (run forge build)`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function write(name, doc) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(doc, null, 2) + '\n');
  console.log(`wrote vectors/${name}`);
}

// ----------------------------------------------------------------------------- interface ids
const unitAbi = readArtifact('IAUFUnitRegistry.sol', 'IAUFUnitRegistry').abi;
const assertionAbi = readArtifact('IAUFAssertionRegistry.sol', 'IAUFAssertionRegistry').abi;
const interfaceIds = {
  IAUFUnitRegistry: C.interfaceId(unitAbi),
  IAUFAssertionRegistry: C.interfaceId(assertionAbi),
  IERC165: '0x01ffc9a7',
  note: 'XOR of the selectors of all functions declared in the interface (ERC-165), excluding supportsInterface.',
};
write('interface-ids.json', interfaceIds);

// ----------------------------------------------------------------------------- identifiers
const profiles = {
  role: ['source', 'sink', 'conductor', 'damping', 'container', 'pledge', 'valve', 'control'].map((r) => `auf:role:${r}@1`),
  structure: ['auf:structure:simple@1', 'auf:structure:composite@1', 'auf:structure:chip@1'],
  application: ['auf:application:credit@1'],
  model: ['auf:model:financial-circuit@1'],
  characterization: ['auf:characterization:v1@1'],
  observation: ['auf:observation:v1@1'],
  method: ['auf:method:net-equity@1', 'auf:method:realized-net-cash-flow@1', 'auf:method:finite-horizon-dcf@1', 'auf:method:conditional-payoff@1'],
  interest: ['whole', 'net-equity', 'revenue-right', 'usage-right', 'fulfillment-claim', 'obligation', 'position'].map((i) => `auf:interest:${i}@1`),
  port: ['funds-in', 'funds-out', 'service-out', 'deliverable-in', 'deliverable-out', 'commitment-in', 'control-in'].map((p) => `auf:port:${p}@1`),
};
const identifiers = { profileIds: {}, descriptorKinds: {}, denominationIds: {}, methodIds: {}, elementIdExample: {} };
for (const cls of Object.keys(profiles)) for (const id of profiles[cls]) identifiers.profileIds[id] = C.idOf(id);
for (const k of ['auf:method', 'auf:profile', 'auf:schema']) identifiers.descriptorKinds[k] = C.idOf(k);
for (const d of ['USD', 'EUR', 'eip155:1/slip44:60']) identifiers.denominationIds[d] = C.idOf(d);
const methodsDir = path.join(OUT, 'methods');
for (const f of fs.readdirSync(methodsDir).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(methodsDir, f), 'utf8'));
  identifiers.methodIds[doc.name] = { file: `methods/${f}`, methodId: C.canonicalHash(doc) };
}
const exKind = 'skill';
const exRef = 'eip155:11155111/erc721:0x00000000000000000000000000000000000000aa/1';
identifiers.elementIdExample = { kind: exKind, ref: exRef, preimage: `${exKind}:${exRef}`, elementId: C.elementId(exKind, exRef) };
const exRelation = { type: 'distinct-claim', elements: ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32)], basis: ['urn:x:agreement:a', 'urn:x:agreement:b'] };
identifiers.relationIdExample = { relation: exRelation, jcs: C.canonicalString(exRelation), relationId: C.relationId(exRelation) };
identifiers.note = 'profileId / interestId / denominationId / descriptorKind = keccak256(UTF-8(identifier)); methodId = keccak256(UTF-8(JCS(descriptor))); relationId = keccak256(UTF-8(JCS(relation))) for identity relations (Section 3.4)';
write('identifiers.json', identifiers);

// ----------------------------------------------------------------------------- canonicalization
const canonDoc = { kind: 'unit-definition', auf: '1.0', unit: { name: 'Vector Unit' }, elements: [], relations: [], ports: [], authorities: { definitionController: 'none' } };
const canonical = C.canonicalString(canonDoc);
write('canonicalization.json', {
  input: canonDoc,
  canonical,
  canonicalHex: '0x' + Buffer.from(canonical, 'utf8').toString('hex'),
  boundaryHash: C.canonicalHash(canonDoc),
  note: 'boundaryHash = keccak256(UTF-8(RFC 8785 canonical JSON))',
});

// ----------------------------------------------------------------------------- valuation vectors
const wad = (s) => V.toWad(s).toString();
const vectors = [
  {
    name: 'net-equity',
    method: 'auf:method:net-equity@1',
    inputs: { denomination: 'USD', assets: [{ element: 'cash', quantity: '100', price: '1' }], liabilities: [{ element: 'payable due now', quantity: '30', price: '1' }] },
    fixedPoint: { assetsWad: [wad('100')], liabilitiesWad: [wad('30')] },
    expected: { kind: 'monetary', value: V.fromWad(V.netEquity([V.toWad('100')], [V.toWad('30')])), denomination: 'USD', valueWad: V.netEquity([V.toWad('100')], [V.toWad('30')]).toString() },
  },
  {
    name: 'realized-net-cash-flow',
    method: 'auf:method:realized-net-cash-flow@1',
    inputs: { asset: 'USD stable', inflows: ['100'], outflows: ['30', '5'], note: 'settled revenue 100, compute expense 30, external fees 5, no internal transfers' },
    fixedPoint: { inflowsWad: [wad('100')], outflowsWad: [wad('30'), wad('5')] },
    expected: { kind: 'monetary', value: V.fromWad(V.realizedNetCashFlow([V.toWad('100')], [V.toWad('30'), V.toWad('5')])), denomination: 'USD', valueWad: V.realizedNetCashFlow([V.toWad('100')], [V.toWad('30'), V.toWad('5')]).toString() },
  },
  {
    name: 'finite-horizon-dcf',
    method: 'auf:method:finite-horizon-dcf@1',
    inputs: { denomination: 'USD', cashflows: ['65', '65'], rate: '0.1', terminalValue: '0' },
    fixedPoint: { cashflowsWad: [wad('65'), wad('65')], rateWad: wad('0.1'), terminalValueWad: '0' },
    expected: { kind: 'monetary', value: V.fromWad(V.finiteHorizonDCF([V.toWad('65'), V.toWad('65')], V.toWad('0.1'), 0n)), denomination: 'USD', valueWad: V.finiteHorizonDCF([V.toWad('65'), V.toWad('65')], V.toWad('0.1'), 0n).toString(), exact: '65/1.1 + 65/1.21 = 112.80991735537190082644...' },
  },
  {
    name: 'conditional-payoff',
    method: 'auf:method:conditional-payoff@1',
    inputs: { denomination: 'USD', scenarios: [{ name: 'success', probability: '0.6', payoff: '100' }, { name: 'failure', probability: '0.4', payoff: '0' }], rate: '0.1', periods: 1, probabilityBasis: 'declared', costsIncluded: false },
    fixedPoint: { payoffsWad: [wad('100'), '0'], probabilitiesWad: [wad('0.6'), wad('0.4')], rateWad: wad('0.1'), periods: 1 },
    expected: { kind: 'scenario', value: V.fromWad(V.conditionalPayoff([V.toWad('100'), 0n], [V.toWad('0.6'), V.toWad('0.4')], V.toWad('0.1'), 1)), denomination: 'USD', valueWad: V.conditionalPayoff([V.toWad('100'), 0n], [V.toWad('0.6'), V.toWad('0.4')], V.toWad('0.1'), 1).toString(), exact: '(0.6 x 100 + 0.4 x 0) / 1.1 = 54.5454...' },
  },
  {
    name: 'conditional-payoff-obligation',
    method: 'auf:method:conditional-payoff@1',
    inputs: { denomination: 'USD', scenarios: [{ name: 'task fails', probability: '0.4', payoff: '-100' }, { name: 'task accepted', probability: '0.6', payoff: '0' }], rate: '0.1', periods: 1, probabilityBasis: 'estimated', costsIncluded: true },
    fixedPoint: { payoffsWad: [wad('-100'), '0'], probabilitiesWad: [wad('0.4'), wad('0.6')], rateWad: wad('0.1'), periods: 1 },
    expected: { kind: 'scenario', value: V.fromWad(V.conditionalPayoff([V.toWad('-100'), 0n], [V.toWad('0.4'), V.toWad('0.6')], V.toWad('0.1'), 1)), denomination: 'USD', valueWad: V.conditionalPayoff([V.toWad('-100'), 0n], [V.toWad('0.4'), V.toWad('0.6')], V.toWad('0.1'), 1).toString(), exact: '(0.4 x -100 + 0.6 x 0) / 1.1 = -36.3636...' },
  },
];
const exceptions = [
  { name: 'missing-evidence', rule: 'A receipt whose inputs lack a price for a material position has result kind insufficient-evidence and lists the position under inputs.missing; it never values the position at zero.', example: 'examples/contingent-obligation-unit.valuation.insufficient-evidence.json' },
  { name: 'boundary-change', rule: 'A receipt recorded for version 1 of a Unit is not returned as a valuation of version 2; assertions are kept per (unitId, version) and assertionCount(unitId, 2) does not include it.', test: 'test/Vectors.t.sol#testBoundaryChangeSeparatesReceipts' },
  { name: 'internal-transfer', rule: 'A payment between two elements of the same Unit that crosses no port is not inflow or outflow of the Unit; the realized net cash flow attributable to it is 0.', example: 'examples/swarm-unit.json (relation exchanges between the two sub-units)' },
  { name: 'shared-right', rule: 'A skill included by two child Units with share 1/2 each is counted once at the parent level by the net-equity method.', example: 'examples/swarm-unit.valuation.net-equity.json' },
  { name: 'expired-or-revoked', rule: 'An assertion past validUntil, revoked or superseded is returned only when marked as such and is never presented as current.', test: 'test/AUFAssertionRegistry.t.sol#testRevoke, testSupersede' },
  { name: 'unsupported-extension', rule: 'A document with an extension member marked required whose identifier the consumer does not know is reported as unsupported.', test: 'tools/resolve.js (reports unsupported)' },
  { name: 'overlap-under-different-references', rule: 'Two positions with different element ids but the same underlying are one claim group only when a same-claim relation with a basis links them; then the net-equity method counts the entitlement once (45.12). Without a same-claim or distinct-claim declaration the overlap is unresolved and no point monetary value is admissible: the receipt is an interval (low 45.12 counted once, high 90.24 counted separately) or insufficient-evidence listing the pair under inputs.overlaps.', example: 'examples/revenue-holdings-declared.valuation.net-equity.json, examples/revenue-holdings-undeclared.valuation.net-equity.interval.json, examples/revenue-holdings-undeclared.valuation.net-equity.insufficient-evidence.json; tools/resolve.js --unit 11 (reports the unresolved overlap)' },
  {
    name: 'withdrawn-evidence',
    rule: 'O -> V -> revoke(O): observer X records observation O, evaluator Y records receipt V citing O (snapshot.observations, snapshot.hash), X revokes O. O is revoked and not current; V keeps status active (X cannot revoke or supersede V; the assertion count is unchanged); a resolver presents V with evidence status withdrawn, lists O as revoked, and does not present V as current. Contrast: receipt V2 cites observation O2 whose validity window ends after V2\'s as-of time; after the window ends, O2 is not current but V2\'s evidence status is supported and V2 is current. Had O2\'s window ended before the as-of time, the evidence status would be expired and V2 would still be returned as current.',
    sequence: [
      { step: 1, actor: 'observer X', action: 'assertStatement(kind observation) -> O', status: { O: 'active' } },
      { step: 2, actor: 'evaluator Y', action: 'assertStatement(kind valuation) -> V, content cites O in snapshot.observations and carries snapshot.hash = contentHash(O)', status: { O: 'active', V: 'active' }, resolver: { V: { current: true, evidence: 'supported' } } },
      { step: 3, actor: 'observer X', action: 'revoke(O)', status: { O: 'revoked', V: 'active' }, assertionCount: 'unchanged', reverts: ['revoke(V) by X: AUF_NotAsserter', 'an assertion by X with supersedes = V: AUF_SupersedeMismatch'], resolver: { O: { current: false }, V: { current: false, evidence: 'withdrawn', observations: [{ id: 'O', status: 'revoked' }] } } },
      { step: 4, actor: 'evaluator Y', action: 'supersede(V) with a corrected receipt or one of kind insufficient-evidence (expected, not required)', status: { V: 'superseded' } },
    ],
    evidenceStatuses: ['not-cited', 'withdrawn', 'superseded', 'unresolved', 'expired', 'supported'],
    test: 'test/AUFAssertionRegistry.t.sol#testRevokedObservationLeavesDependentReceiptActive (registry); tools/test/resolve-evidence.test.js (resolver output)',
  },
  {
    name: 'additivity-must-be-established',
    rule: 'Two positions of different claim groups are additive only when a distinct-claim declaration with a basis covers the pair (or the evaluator states treatment distinct with a basis under inputs.overlaps). A missing underlying, two different underlying references, two URIs for what may be one entitlement, or simply the absence of a detected overlap never establish distinctness: the pair is unresolved and the net-equity receipt is an interval (45.12 counted once, 90.24 counted separately) or insufficient-evidence. With a distinct-claim declaration (two separate assignments of 40% each) the method counts the tranches separately (90.24); the resolver reports the declaration as claimed until the controller of the underlying endorses either position, and as confirmed after.',
    cases: [
      { case: 'silent', definition: 'examples/revenue-holdings-silent.json (no underlying on the token position; the assignment under a URL, with an underlying that names the fee stream under another URI; no declaration)', expected: 'unresolved pair, no overlap candidate; receipts examples/revenue-holdings-silent.valuation.net-equity.interval.json (45.12 to 90.24) and examples/revenue-holdings-silent.valuation.net-equity.insufficient-evidence.json; a point-valued receipt is reported as non-conforming' },
      { case: 'declared distinct', definition: 'examples/revenue-holdings-distinct.json (same underlying, distinct-claim set with the two agreements as basis)', expected: 'pair resolved as distinct (claimed); receipt examples/revenue-holdings-distinct.valuation.net-equity.json monetary 90.24 with treatment distinct and basis' },
      { case: 'evaluator-side evidence', definition: 'examples/revenue-holdings-silent.json', expected: 'a monetary receipt whose inputs.overlaps states treatment distinct with a basis for the pair is accepted; the pair stays unresolved at the definition level and is still reported' },
      { case: 'confirmation binds to the relation', definition: 'examples/revenue-holdings-distinct.json (relationId of its distinct-claim declaration listed in examples.json)', expected: 'a description-endorsement whose subject is the relationId, on version 1 of Unit 13, by the Definition Controller of Unit 1 (the underlying of both tranches) makes the declaration confirmed; an endorsement of the token position alone (on Unit 8 or on Unit 13), an endorsement of the relationId on another version, or one by an account that controls no covered position leaves it claimed; with different obligors (Unit 1), a pair is confirmed only when an account for each side has endorsed the declaration' },
    ],
    test: 'tools/test/resolve-claims.test.js',
  },
];
write('valuation-vectors.json', { fixedPoint: '18 decimals, truncating division (as AUFValuationLib.sol)', vectors, exceptions });

// ----------------------------------------------------------------------------- EIP-712
const assertionTypeString = 'Assertion(uint8 kind,uint256 unitId,uint32 version,bytes32 profileId,bytes32 contentHash,string contentURI,uint64 validFrom,uint64 validUntil,bytes32 supersedes,bytes32 payloadHash,uint256 nonce,uint256 deadline)';
const types = {
  Assertion: [
    { name: 'kind', type: 'uint8' },
    { name: 'unitId', type: 'uint256' },
    { name: 'version', type: 'uint32' },
    { name: 'profileId', type: 'bytes32' },
    { name: 'contentHash', type: 'bytes32' },
    { name: 'contentURI', type: 'string' },
    { name: 'validFrom', type: 'uint64' },
    { name: 'validUntil', type: 'uint64' },
    { name: 'supersedes', type: 'bytes32' },
    { name: 'payloadHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};
const core = {
  methodId: identifiers.methodIds['auf:method:net-equity@1'].methodId,
  interestId: C.idOf('auf:interest:net-equity@1'),
  assessmentBoundaryHash: '0x' + '11'.repeat(32),
  snapshotHash: '0x' + '22'.repeat(32),
  resultKind: 1,
  decimals: 2,
  value: 7000n,
  denominationId: C.idOf('USD'),
  asOf: 1700000000n,
  horizonEnd: 0n,
};
const payload = C.encodeValuationCore(core);
const sample = {
  kind: 3,
  unitId: 1n,
  version: 1,
  profileId: core.methodId,
  contentHash: '0x' + '33'.repeat(32),
  contentURI: 'ipfs://bafy-valuation',
  validFrom: 0n,
  validUntil: 0n,
  supersedes: '0x' + '00'.repeat(32),
  payloadHash: keccak256(payload),
  nonce: 0n,
  deadline: 1800000000n,
};
const structHash = TypedDataEncoder.from(types).hash(sample);
const wallet = new Wallet('0x' + 'ab'.repeat(32));
const domain = { name: 'AUFAssertionRegistry', version: '1', chainId: 31337, verifyingContract: '0x' + '00'.repeat(19) + '42' };
const digest = TypedDataEncoder.hash(domain, types, sample);
write('eip712.json', {
  typeString: assertionTypeString,
  typeHash: keccak256(toUtf8Bytes(assertionTypeString)),
  domainTypeHash: keccak256(toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
  nameHash: keccak256(toUtf8Bytes('AUFAssertionRegistry')),
  versionHash: keccak256(toUtf8Bytes('1')),
  valuationCore: { ...core, value: core.value.toString(), asOf: core.asOf.toString(), horizonEnd: core.horizonEnd.toString() },
  payload,
  input: { ...sample, unitId: sample.unitId.toString(), validFrom: '0', validUntil: '0', nonce: '0', deadline: sample.deadline.toString() },
  structHash,
  exampleDomain: domain,
  exampleDomainSeparator: TypedDataEncoder.hashDomain(domain),
  exampleDigest: digest,
  exampleSigner: wallet.address,
  exampleSignature: wallet.signingKey.sign(digest).serialized,
  note: 'structHash is independent of the domain and is checked against structHashOf() on chain; the example digest and signature use the example domain shown here.',
});

// ----------------------------------------------------------------------------- examples
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'erc-auf', 'examples', 'manifest.json'), 'utf8'));
write('examples.json', {
  registry: manifest.registry,
  chainId: manifest.chainId,
  units: manifest.units.map((u) => ({ unitId: u.unitId, file: `examples/${u.file}`, boundaryHash: u.boundaryHash, contains: u.contains, controller: u.controller, companions: u.companions, declarations: declarationsOf(u.file), ...(u.v2 ? { v2: { file: `examples/${u.v2.file}`, boundaryHash: u.v2.boundaryHash, declarations: declarationsOf(u.v2.file) } } : {}) })),
  note: 'declarations lists the identity relations of each definition with their relationId, the subject of a confirming description-endorsement (Sections 3.4 and 3.8).',
});
// identity relations of a definition file with their relationId
function declarationsOf(file) {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'erc-auf', 'examples', file), 'utf8'));
  return (doc.relations || []).filter((r) => r.type === 'same-claim' || r.type === 'distinct-claim').map((r) => ({ type: r.type, elements: r.elements || [r.from, r.to], relationId: C.relationId(r) }));
}
console.log('done');
