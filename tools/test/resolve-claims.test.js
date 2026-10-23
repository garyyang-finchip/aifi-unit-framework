'use strict';
// Claim identity and additivity (ERC Sections 3.8 and 10.6), run on the worked examples: exception vectors 4 (shared
// right), 7 (overlap under different references) and 9 (additivity must be established). Checks that a pair of
// positions is resolved only by a claim group or a distinct-claim declaration, that silence (no underlying, aliased
// references) leaves the pair unresolved, that a point-valued receipt over an unresolved pair is rejected unless the
// evaluator resolves the pair with a basis, and that a declaration is reported as confirmed only on an endorsement.
//
//   npm run test:tools        (or: node --test tools/test/resolve-claims.test.js)

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { offlineSource, resolveSummary } = require('../resolve');

const ROOT = path.resolve(__dirname, '../..');
const EXAMPLES = path.join(ROOT, 'assets/erc-auf/examples');
const manifest = JSON.parse(fs.readFileSync(path.join(EXAMPLES, 'manifest.json'), 'utf8'));
const unit = (id) => manifest.units.find((u) => u.unitId === id);
const elementOf = (id, labelPart) => Object.entries(unit(id).elements).find(([label]) => label.includes(labelPart))[1];

test('vector 4: the skill license shared by the two sub-units is one claim group, counted once at the swarm', async () => {
  const s = await resolveSummary(offlineSource(), 4, 1);
  const shared = s.claimGroups.find((g) => g.members.includes(elementOf(2, 'Summarizer skill')));
  assert.ok(shared);
  assert.equal(shared.occurrences.length, 2);
  assert.equal(s.unresolvedPairs.length, 0, 'the swarm declares its four positions distinct');
  assert.equal(s.distinctPairs.length, 6);
  assert.ok(s.distinctPairs.every((d) => d.confirmation === 'claimed'));
  assert.equal(s.problems, 0);
});

test('vector 7: same underlying, no declaration -> unresolved pair marked as overlap candidate; declared same-claim -> one group', async () => {
  const undeclared = await resolveSummary(offlineSource(), 11, 1);
  assert.equal(undeclared.unresolvedPairs.length, 1);
  assert.match(undeclared.unresolvedPairs[0].sharedUnderlying, /#fees-in$/);
  assert.equal(undeclared.problems, 0, 'its receipts are an interval and an insufficient-evidence statement');
  const declared = await resolveSummary(offlineSource(), 10, 1);
  assert.equal(declared.unresolvedPairs.length, 0);
  assert.equal(declared.claimGroups.filter((g) => g.declaredBy.length).length, 1);
  assert.equal(declared.problems, 0);
});

test('vector 9: no underlying on one side and an aliased URI on the other leave the pair unresolved although no overlap is detected', async () => {
  const s = await resolveSummary(offlineSource(), 12, 1);
  assert.equal(s.unresolvedPairs.length, 1);
  assert.equal(s.unresolvedPairs[0].sharedUnderlying, null);
  assert.deepEqual(s.unresolvedPairs[0].underlying, [null, 'https://skills.example/summarizer/v3#license-fees']);
  assert.equal(s.distinctPairs.length, 0);
  assert.equal(s.problems, 0, 'the interval and insufficient-evidence receipts conform');
  const receipts = s.root.companions.filter((c) => c.kind === 'valuation').map((c) => c.summary.resultKind).sort();
  assert.deepEqual(receipts, ['insufficient-evidence', 'interval']);
});

test('vector 9: a distinct-claim declaration with a basis resolves the pair; the point value is admissible and reported as claimed', async () => {
  const s = await resolveSummary(offlineSource(), 13, 1);
  assert.equal(s.unresolvedPairs.length, 0);
  assert.equal(s.distinctPairs.length, 1);
  assert.match(s.distinctPairs[0].sharedUnderlying, /#fees-in$/);
  assert.equal(s.distinctPairs[0].confirmation, 'claimed');
  assert.deepEqual(s.distinctPairs[0].declaredBy[0].basis, ['urn:x:terms:rst-tokenization-2026', 'urn:x:agreement:summarizer-fee-assignment-2026-b']);
  const monetary = s.root.companions.find((c) => c.kind === 'valuation');
  assert.equal(monetary.summary.resultKind, 'monetary');
  assert.equal(monetary.summary.value, '90.24');
  assert.equal(s.problems, 0);
});

test('vector 9: the declaration is confirmed by a description endorsement of the controller of the underlying', async () => {
  const skillOwner = unit(1).controller.toLowerCase(); // Definition Controller of Unit 1, the underlying of both tranches
  const src = Object.assign(offlineSource(), { async endorsedBy(unitId, version, elementId, account) { return unitId === 13 && version === 1 && account === skillOwner; } });
  const s = await resolveSummary(src, 13, 1);
  assert.equal(s.distinctPairs[0].confirmation, 'confirmed');
  assert.equal(s.distinctPairs[0].confirmedBy, skillOwner);
  const stranger = Object.assign(offlineSource(), { async endorsedBy() { return false; } });
  assert.equal((await resolveSummary(stranger, 13, 1)).distinctPairs[0].confirmation, 'claimed');
});

function withExtraReceipt(t, file, doc) {
  // copy the tools and the examples so that the checked-in files stay untouched; run the resolver CLI on the copy
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auf-claims-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const dir of ['tools', 'assets']) fs.cpSync(path.join(ROOT, dir), path.join(tmp, dir), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'), 'junction');
  fs.writeFileSync(path.join(tmp, 'assets/erc-auf/examples', file), JSON.stringify(doc));
  return spawnSync(process.execPath, [path.join(tmp, 'tools/resolve.js'), '--unit', '12'], { encoding: 'utf8' });
}

test('vector 9: a point-valued receipt over the unresolved pair is rejected; the same receipt is accepted when the evaluator resolves the pair with a basis', (t) => {
  const interval = JSON.parse(fs.readFileSync(path.join(EXAMPLES, 'revenue-holdings-silent.valuation.net-equity.interval.json'), 'utf8'));
  const point = { ...interval, inputs: { ...interval.inputs, overlaps: [] }, result: { kind: 'monetary', value: '90.24', denomination: 'USD', decimals: 2 }, notes: 'negative test: a point value over an unresolved pair' };
  const rejected = withExtraReceipt(t, 'revenue-holdings-silent.valuation.net-equity.point.json', point);
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.match(rejected.stdout, /point monetary value although the pair .* is unresolved \(no declaration covers it\)/);

  const pair = interval.inputs.overlaps[0].elements;
  const own = { ...point, inputs: { ...point.inputs, overlaps: [{ elements: pair, treatment: 'distinct', basis: ['urn:x:agreement:summarizer-fee-assignment-2026-b'], notes: 'evaluator-side evidence: the URL resolves to a second, separate assignment' }] }, notes: 'the evaluator resolves the pair on its own evidence (Section 10.6)' };
  const accepted = withExtraReceipt(t, 'revenue-holdings-silent.valuation.net-equity.point.json', own);
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  assert.doesNotMatch(accepted.stdout, /point monetary value although/);
  assert.match(accepted.stdout, /UNRESOLVED PAIR/, 'the pair itself stays unresolved at the definition level; the receipt states its own resolution');
});
