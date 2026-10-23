'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { equalDecimalSums } = require('../lib/decimal');

const ROOT = path.resolve(__dirname, '../..');

test('decimal sums preserve arbitrary precision, signs, and trailing zeros', () => {
  assert.equal(equalDecimalSums(['9007199254740992', '1'], ['9007199254740993']), true);
  assert.equal(equalDecimalSums(['9007199254740992'], ['9007199254740993']), false);
  assert.equal(equalDecimalSums(['0.000000000000000000000000000001'], ['0']), false);
  assert.equal(equalDecimalSums(['001.20', '-0.2', '-0.000'], ['1.0000']), true);
  assert.equal(equalDecimalSums(['-0.1', '-0.2'], ['-0.3']), true);
  assert.equal(equalDecimalSums([], ['0']), true);
});

test('decimal sums reject representations outside decimalString', () => {
  for (const value of [1, null, '1e-18', '+1', ' 1', '1.', '.1', 'NaN']) {
    assert.throws(() => equalDecimalSums([value], ['0']), /not a decimal string/);
  }
});

function checkObservation(t, patch, { validatorProblem = null, resolverProblem = null } = {}) {
  // Exercise the actual CLIs with isolated fixtures, leaving checked-in hashes unchanged.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auf-observation-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const dir of ['tools', 'assets']) fs.cpSync(path.join(ROOT, dir), path.join(tmp, dir), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'), 'junction');
  const filename = path.join(tmp, 'assets/erc-auf/examples/skill-multi-license.observation.json');
  const doc = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const asset = {
    ...doc.assets[0], opening: '0', closing: '0', inflow: '0', outflow: '0',
    minted: '0', burned: '0', adjustments: [], transfers: [], ...patch,
  };
  for (const member of asset.missing || []) delete asset[member];
  doc.assets[0] = asset;
  fs.writeFileSync(filename, JSON.stringify(doc));
  const run = (name, args = []) => {
    const result = spawnSync(process.execPath, [path.join(tmp, 'tools', name), ...args], { encoding: 'utf8' });
    assert.ifError(result.error);
    return result;
  };
  const validation = run('validate.js');
  if (validatorProblem) {
    assert.equal(validation.status, 1, validation.stdout + validation.stderr);
    assert.match(validation.stderr, validatorProblem);
  } else {
    assert.equal(validation.status, 0, validation.stdout + validation.stderr);
  }
  const resolution = run('resolve.js', ['--unit', '1', '--json']);
  assert.equal(resolution.status, resolverProblem ? 1 : 0, resolution.stderr);
  const report = JSON.parse(resolution.stdout)[0];
  assert.equal(report.root.verified, true);
  const observation = report.root.companions.find((c) => c.kind === 'observation');
  assert.ok(observation);
  assert.equal(observation.subjectMatches, true);
  if (resolverProblem) assert.match(observation.problems.join('\n'), resolverProblem);
  else assert.deepEqual(observation.problems, []);
}

test('CLIs reject an unexplained one-unit difference at 18 decimals', (t) => {
  checkObservation(t, { closing: '0.000000000000000001' }, {
    validatorProblem: /reconciliation failed/, resolverProblem: /reconciliation failed/,
  });
});

test('CLIs reject a one-unit difference above Number.MAX_SAFE_INTEGER', (t) => {
  checkObservation(t, { opening: '9007199254740992', closing: '9007199254740993' }, {
    validatorProblem: /reconciliation failed/, resolverProblem: /reconciliation failed/,
  });
});

test('CLIs do not truncate observations to 18 decimal places', (t) => {
  checkObservation(t, { closing: '0.000000000000000000001' }, {
    validatorProblem: /reconciliation failed/, resolverProblem: /reconciliation failed/,
  });
});

test('CLIs accept a mixed-precision balance that per-term rounding breaks', (t) => {
  checkObservation(t, { closing: '0.00000080', inflow: '0.0000004', minted: '0.00000040' });
});

test('CLIs reconcile large quantities and signed adjustments exactly', (t) => {
  checkObservation(t, {
    opening: '9007199254740992', closing: '9007199254740992.000000000000000001',
    inflow: '0.000000000000000003', minted: '0.000000000000000002', burned: '0.000000000000000001',
    adjustments: [{ amount: '-0.000000000000000003', reason: 'correction' }],
  });
});

test('validator rejects a sub-micro-unit transfer-total mismatch', (t) => {
  checkObservation(t, {
    closing: '0.000000000000000001', inflow: '0.000000000000000001',
    transfers: [{ port: 'fees-in', direction: 'in', amount: '0' }],
  }, { validatorProblem: /transfers do not add up/ });
});

test('validator accepts exact transfer totals across mixed precisions', (t) => {
  checkObservation(t, {
    closing: '0.000000000000000003', inflow: '0.0000000000000000030',
    transfers: [
      { port: 'fees-in', direction: 'in', amount: '0.000000000000000001' },
      { port: 'fees-in', direction: 'in', amount: '0.0000000000000000020' },
    ],
  });
});

test('missing amounts remain unknown rather than zero', (t) => {
  checkObservation(t, { missing: ['inflow'] }, { resolverProblem: /not checkable.*unknown, not zero/ });
});

test('CLIs report invalid decimal strings without accepting them', (t) => {
  checkObservation(t, { closing: '1e-18' }, {
    validatorProblem: /invalid observation amount/, resolverProblem: /invalid observation amount/,
  });
});
