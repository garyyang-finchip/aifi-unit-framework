'use strict';
// Resolver behaviour that needs registry state (statuses, validity windows), run against an in-memory source that
// mimics the on-chain registries. Covers exception vector 8 of the ERC, "Withdrawn evidence": O -> V -> revoke(O),
// its contrast (an observation whose validity window ended after the receipt's as-of time), and the other evidence
// statuses of Section 10.6 (expired, superseded, unresolved) as well as citation by content hash.
//
//   npm run test:tools        (or: node --test tools/test/resolve-evidence.test.js)

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveSummary, printSummary, assertionEntry, evidenceOf } = require('../resolve');
const { canonicalHash } = require('../lib/canonical');

const REGISTRY = '0x00000000000000000000000000000000000000f0';
const EVALUATOR = '0x00000000000000000000000000000000000000ef';
const OBSERVER = '0x00000000000000000000000000000000000000ea';
const ZERO = '0x' + '00'.repeat(32);
const now = Math.floor(Date.now() / 1000);

const definition = { auf: '1.0', kind: 'unit-definition', unit: { name: 'Evidence vector Unit' }, elements: [{ kind: 'financial-position', ref: 'eip155:11155111:0x00000000000000000000000000000000000000e1', label: 'Treasury' }], relations: [], ports: [], authorities: { definitionController: `eip155:11155111:${OBSERVER}` } };
const boundaryHash = canonicalHash(definition);
const subject = { registry: `eip155:11155111:${REGISTRY}`, unitId: 1, version: 1, boundaryHash };

// Timeline relative to the run: the receipts are as of 60 days ago.
const DAY = 86400;
const asOf = now - 60 * DAY;
const iso = (t) => new Date(t * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const observation = (source) => ({ auf: '1.0', kind: 'observation', subject, window: { from: iso(asOf - 30 * DAY), to: iso(asOf) }, snapshotAt: iso(asOf), assets: [], coverage: { observed: [], missing: [], method: 'test', source } });
const receipt = (cites, obsDoc, notes) => ({ auf: '1.0', kind: 'valuation', subject, assessmentBoundary: { hash: boundaryHash }, interest: { id: 'auf:interest:net-equity@1', perspective: 'holder' }, snapshot: { asOf: iso(asOf), ...(cites ? { observations: [cites] } : {}), hash: canonicalHash(obsDoc) }, method: { id: '0x' + 'aa'.repeat(32), name: 'auf:method:net-equity@1', params: {} }, inputs: { data: [{ observation: cites || canonicalHash(obsDoc) }] }, result: { kind: 'monetary', value: '70.00', denomination: 'USD', decimals: 2 }, evaluator: `eip155:11155111:${EVALUATOR}`, notes });
const envelope = (kind, status, asserter, contentHash, contentURI, extra = {}) => ({ kind, status, byController: false, version: 1, assertedAt: asOf, validFrom: 0, validUntil: 0, asserter, unitId: 1, profileId: ZERO, contentHash, supersedes: ZERO, supersededBy: ZERO, contentURI, ...extra });
const id = (byte) => '0x' + byte.repeat(32);

// A chain-like source over a Map of envelopes and a Map of documents; evidence is resolved as the real chain source does.
function sourceOver(chain, docs, order) {
  return {
    kind: 'chain', registry: REGISTRY,
    async version() { return { boundaryHash, descriptorURI: 'mock:def', contains: [], controller: OBSERVER, latest: 1 }; },
    async fetch(uri) { return docs[uri] || null; },
    async companions() { return []; },
    async assertions() {
      const lookup = async (x) => (chain.has(x) ? assertionEntry(x, chain.get(x)) : null);
      const out = [];
      for (const x of order) {
        const entry = await lookup(x);
        if (entry.kind === 'valuation') entry.valuation = { resultKind: 'monetary', value: '7000', decimals: 2, asOf };
        out.push(entry);
      }
      for (const entry of out) {
        if (entry.kind !== 'valuation') continue;
        entry.evidence = await evidenceOf(entry, await this.fetch(entry.contentURI), lookup, out);
        if (entry.evidence.status === 'withdrawn') entry.current = false;
      }
      return out;
    },
  };
}

test('exception vector 8: O -> V -> revoke(O) makes V withdrawn and not current; a window that ended after as-of is not withdrawal', async () => {
  const O = id('01'); // observation later revoked
  const O2 = id('02'); // observation whose validity ended after V2's as-of time
  const V = id('0a');
  const V2 = id('0b');
  const obsDocO = observation('O');
  const obsDocO2 = observation('O2');
  const docV = receipt(O, obsDocO, 'receipt V, rests on observation O');
  const docV2 = receipt(O2, obsDocO2, 'receipt V2, rests on observation O2');
  const chain = new Map([
    [O, envelope(2, 2, OBSERVER, canonicalHash(obsDocO), 'mock:O')], // kind 2 observation, status 2 revoked
    [V, envelope(3, 1, EVALUATOR, canonicalHash(docV), 'mock:V')], // kind 3 valuation, status 1 active
    [O2, envelope(2, 1, OBSERVER, canonicalHash(obsDocO2), 'mock:O2', { validUntil: asOf + 30 * DAY })], // active; window ended 30 days ago
    [V2, envelope(3, 1, EVALUATOR, canonicalHash(docV2), 'mock:V2')],
  ]);
  const docs = { 'mock:def': definition, 'mock:O': obsDocO, 'mock:V': docV, 'mock:O2': obsDocO2, 'mock:V2': docV2 };
  const summary = await resolveSummary(sourceOver(chain, docs, [O, V, O2, V2]), 1, 1);
  const lines = [];
  printSummary(summary, (l) => lines.push(l));
  const text = lines.join('\n');
  const byId = Object.fromEntries(summary.root.assertions.map((a) => [a.assertionId, a]));

  // the withdrawn case
  assert.equal(byId[O].status, 'revoked');
  assert.equal(byId[O].current, false);
  assert.equal(byId[V].status, 'active');
  assert.equal(byId[V].evidence.status, 'withdrawn');
  assert.equal(byId[V].evidence.contentVerified, true);
  assert.equal(byId[V].evidence.observations[0].citedBy, 'listed');
  assert.equal(byId[V].current, false);
  assert.match(text, /valuation 0x0a0a[0-9a-f]+ active \(not current\) .* evidence=withdrawn/);
  assert.match(text, /cites observation 0x0101[0-9a-f]+ revoked: withdrawn by its asserter/);

  // the contrast: O2 is no longer current, but it was inside its window at V2's as-of time
  assert.equal(byId[O2].status, 'active');
  assert.equal(byId[O2].current, false);
  assert.equal(byId[V2].evidence.status, 'supported');
  assert.equal(byId[V2].evidence.observations[0].withinWindowAtAsOf, true);
  assert.equal(byId[V2].evidence.observations[0].endedAfterAsOf, true);
  assert.equal(byId[V2].current, true);
  assert.match(text, /valuation 0x0b0b[0-9a-f]+ active by .* evidence=supported/);
  assert.match(text, /cites observation 0x0202[0-9a-f]+ active: validity ended after the receipt's as-of time; not a withdrawal/);

  assert.equal(summary.problems, 0);
});

test('an observation cited by content hash alone is resolved like a listed one', async () => {
  const O = id('01');
  const V = id('0a');
  const obsDocO = observation('O');
  const docV = receipt(null, obsDocO, 'receipt V, snapshot.hash is the content hash of O, nothing listed');
  assert.equal(docV.snapshot.observations, undefined);
  const chain = new Map([
    [O, envelope(2, 2, OBSERVER, canonicalHash(obsDocO), 'mock:O')],
    [V, envelope(3, 1, EVALUATOR, canonicalHash(docV), 'mock:V')],
  ]);
  const docs = { 'mock:def': definition, 'mock:O': obsDocO, 'mock:V': docV };
  const summary = await resolveSummary(sourceOver(chain, docs, [O, V]), 1, 1);
  const lines = [];
  printSummary(summary, (l) => lines.push(l));
  const byId = Object.fromEntries(summary.root.assertions.map((a) => [a.assertionId, a]));
  assert.equal(byId[V].evidence.status, 'withdrawn');
  assert.equal(byId[V].evidence.observations[0].citedBy, 'content-hash');
  assert.equal(byId[V].current, false);
  assert.match(lines.join('\n'), /cites observation 0x0101[0-9a-f]+ \(by content hash\) revoked/);
});

test('expired, superseded and unresolved evidence are ranked and reported without changing the receipt', async () => {
  const lookupOver = (chain) => async (x) => (chain.has(x) ? assertionEntry(x, chain.get(x)) : null);

  // expired: the cited observation's window had already ended at the receipt's as-of time
  const O5 = id('05');
  const obsDocO5 = observation('O5');
  const docV5 = receipt(O5, obsDocO5, 'receipt V5, rests on an observation that had expired at as-of');
  const chain5 = new Map([
    [O5, envelope(2, 1, OBSERVER, canonicalHash(obsDocO5), 'mock:O5', { validUntil: asOf - 1 * DAY })],
    [id('0e'), envelope(3, 1, EVALUATOR, canonicalHash(docV5), 'mock:V5')],
  ]);
  const v5 = assertionEntry(id('0e'), chain5.get(id('0e')));
  v5.evidence = await evidenceOf(v5, docV5, lookupOver(chain5));
  assert.equal(v5.evidence.status, 'expired');
  assert.equal(v5.evidence.observations[0].withinWindowAtAsOf, false);
  assert.equal(v5.current, true);

  // superseded: the cited observation was replaced by its asserter
  const O3 = id('03');
  const O4 = id('04');
  const obsDocO3 = observation('O3');
  const docV3 = receipt(O3, obsDocO3, 'receipt V3, rests on observation O3');
  const chain3 = new Map([
    [O3, envelope(2, 3, OBSERVER, canonicalHash(obsDocO3), 'mock:O3', { supersededBy: O4 })], // status 3 superseded
    [O4, envelope(2, 1, OBSERVER, canonicalHash(observation('O4')), 'mock:O4', { supersedes: O3 })],
    [id('0c'), envelope(3, 1, EVALUATOR, canonicalHash(docV3), 'mock:V3')],
  ]);
  const v3 = assertionEntry(id('0c'), chain3.get(id('0c')));
  v3.evidence = await evidenceOf(v3, docV3, lookupOver(chain3));
  assert.equal(v3.evidence.status, 'superseded');
  assert.equal(v3.evidence.observations[0].supersededBy, O4);
  assert.equal(v3.current, true);

  // unresolved: the cited id is unknown to the registry
  const docV4 = receipt(id('09'), obsDocO3, 'receipt V4, cites an observation the registry does not know');
  const chain4 = new Map([[id('0d'), envelope(3, 1, EVALUATOR, canonicalHash(docV4), 'mock:V4')]]);
  const v4 = assertionEntry(id('0d'), chain4.get(id('0d')));
  v4.evidence = await evidenceOf(v4, docV4, lookupOver(chain4));
  assert.equal(v4.evidence.status, 'unresolved');
  assert.equal(v4.evidence.observations[0].status, 'unknown');

  // ranking: one revoked citation outranks an unresolved one, whatever the order
  const docV6 = { ...docV3, snapshot: { ...docV3.snapshot, observations: [id('09'), O5, O3] } };
  const chain6 = new Map([...chain3, [O5, envelope(2, 2, OBSERVER, canonicalHash(obsDocO5), 'mock:O5')]]);
  const v6 = assertionEntry(id('0f'), envelope(3, 1, EVALUATOR, canonicalHash(docV6), 'mock:V6'));
  v6.evidence = await evidenceOf(v6, docV6, lookupOver(chain6));
  assert.equal(v6.evidence.status, 'withdrawn');
  assert.deepEqual(v6.evidence.observations.map((o) => o.status), ['unknown', 'revoked', 'superseded']);

  // a receipt that cites nothing and whose snapshot hash matches no sibling observation is not-cited
  const v7 = assertionEntry(id('1f'), envelope(3, 1, EVALUATOR, canonicalHash(docV4), 'mock:V7'));
  v7.evidence = await evidenceOf(v7, receipt(null, observation('nowhere'), 'receipt V7'), lookupOver(chain4), []);
  assert.equal(v7.evidence.status, 'not-cited');
});
