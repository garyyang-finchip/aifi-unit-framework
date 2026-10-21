'use strict';
// Reference arithmetic of the four valuation profiles (ERC Section 14.4), mirroring AUFValuationLib.sol
// bit for bit: 18-decimal fixed point with floor division, so that JavaScript and Solidity agree exactly.

const WAD = 10n ** 18n;

/** Parse a decimal string ("112.81", "-30", "0.6") into an 18-decimal BigInt. */
function toWad(s) {
  const str = String(s).trim();
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(str);
  if (!m) throw new Error(`not a decimal string: ${s}`);
  const neg = !!m[1];
  const intPart = BigInt(m[2]);
  const frac = (m[3] || '').padEnd(18, '0').slice(0, 18);
  const v = intPart * WAD + BigInt(frac);
  return neg ? -v : v;
}

/** Format an 18-decimal BigInt as a decimal string with `decimals` places (round half away from zero). */
function fromWad(v, decimals = 2) {
  const neg = v < 0n;
  let a = neg ? -v : v;
  const scale = 10n ** BigInt(18 - decimals);
  let q = a / scale;
  const r = a % scale;
  if (r * 2n >= scale) q += 1n;
  const s = q.toString().padStart(decimals + 1, '0');
  const out = decimals === 0 ? s : `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
  return (neg && q !== 0n ? '-' : '') + out;
}

/** Floor division towards negative infinity is NOT used; Solidity truncates towards zero. */
function divTrunc(a, b) {
  return a / b; // BigInt division truncates towards zero, like Solidity
}

function netEquity(assetsWad, liabilitiesWad) {
  let v = 0n;
  for (const a of assetsWad) v += a;
  for (const l of liabilitiesWad) v -= l;
  return v;
}

function realizedNetCashFlow(inflowsWad, outflowsWad) {
  let v = 0n;
  for (const a of inflowsWad) v += a;
  for (const l of outflowsWad) v -= l;
  return v;
}

function finiteHorizonDCF(cashflowsWad, rateWad, terminalValueWad) {
  if (cashflowsWad.length === 0) throw new Error('empty input');
  let factor = WAD;
  let value = 0n;
  for (const cf of cashflowsWad) {
    factor = (factor * WAD) / (WAD + rateWad);
    value += divTrunc(cf * factor, WAD);
  }
  value += divTrunc(terminalValueWad * factor, WAD);
  return value;
}

function conditionalPayoff(payoffsWad, probabilitiesWad, rateWad, periods) {
  if (payoffsWad.length === 0) throw new Error('empty input');
  if (payoffsWad.length !== probabilitiesWad.length) throw new Error('length mismatch');
  let sum = 0n;
  let expectation = 0n;
  for (let j = 0; j < payoffsWad.length; j++) {
    sum += probabilitiesWad[j];
    expectation += divTrunc(payoffsWad[j] * probabilitiesWad[j], WAD);
  }
  if (sum !== WAD) throw new Error(`probabilities not normalized: ${sum}`);
  let factor = WAD;
  for (let t = 0; t < periods; t++) factor = (factor * WAD) / (WAD + rateWad);
  return divTrunc(expectation * factor, WAD);
}

module.exports = { WAD, toWad, fromWad, netEquity, realizedNetCashFlow, finiteHorizonDCF, conditionalPayoff };
