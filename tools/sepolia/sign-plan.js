#!/usr/bin/env node
'use strict';
// Turns the Foundry broadcast records of an Anvil rehearsal (run with the real deployer and evaluator keys,
// chain id 11155111, so that every CREATE address and EIP-712 signature already matches Sepolia) into a
// list of signed EIP-1559 transactions that a relay can broadcast in order. No key leaves this machine.
//
//   PRIVATE_KEY=0x... EVALUATOR_PK=0x... node tools/sepolia/sign-plan.js --out plan.json [--max-fee-gwei 2] [--prio-gwei 0.1]
//
// The plan carries, per transaction: phase, index, label, sender, nonce, gas limit, hash and the raw bytes.

const fs = require('fs');
const path = require('path');
const { Wallet, Transaction, parseUnits } = require('ethers');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const OUT = arg('--out', 'sepolia-plan.json');
const MAX_FEE = parseUnits(arg('--max-fee-gwei', '2'), 'gwei');
const PRIO = parseUnits(arg('--prio-gwei', '0.1'), 'gwei');
const GAS_MULT = Number(arg('--gas-mult', '2'));
// Optional per-index gas limits taken from live eth_estimateGas on the target network ({"<index>": <gasLimit>}).
const OVERRIDES = args.includes('--gas-overrides') ? JSON.parse(fs.readFileSync(arg('--gas-overrides'), 'utf8')) : {};
const CHAIN_ID = 11155111;
const DIR = path.join(__dirname, '..', '..', 'broadcast', 'SepoliaEvidence.s.sol', String(CHAIN_ID));
const PHASES = ['deployCore', 'registerAll', 'assertAll', 'lifecycle'];

const wallets = {};
for (const [name, env] of [['deployer', 'PRIVATE_KEY'], ['evaluator', 'EVALUATOR_PK']]) {
  if (!process.env[env]) throw new Error(`${env} not set`);
  const w = new Wallet(process.env[env]);
  wallets[w.address.toLowerCase()] = { name, wallet: w };
}

const plan = [];
let index = 0;
for (const phase of PHASES) {
  const file = path.join(DIR, `${phase}-latest.json`);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const receipts = new Map(j.receipts.map((r) => [r.transactionHash, r]));
  for (const t of j.transactions) {
    const tx = t.transaction;
    const from = tx.from.toLowerCase();
    const signer = wallets[from];
    if (!signer) throw new Error(`no key for sender ${from}`);
    const used = BigInt(receipts.get(t.hash).gasUsed);
    const limitFromForge = BigInt(tx.gas);
    const scaled = used * BigInt(Math.round(GAS_MULT * 100)) / 100n;
    let limit = scaled > limitFromForge ? scaled : limitFromForge;
    if (OVERRIDES[String(index)] !== undefined) limit = BigInt(OVERRIDES[String(index)]);
    const unsigned = Transaction.from({
      type: 2,
      chainId: CHAIN_ID,
      nonce: Number(tx.nonce),
      to: tx.to || null,
      value: BigInt(tx.value || 0),
      data: tx.input,
      gasLimit: limit,
      maxFeePerGas: MAX_FEE,
      maxPriorityFeePerGas: PRIO,
    });
    const raw = signer.wallet.signingKey.sign(unsigned.unsignedHash);
    unsigned.signature = raw;
    const signed = unsigned.serialized;
    plan.push({
      index: index++,
      phase,
      label: t.transactionType === 'CREATE' ? `CREATE ${t.contractName} -> ${t.contractAddress}` : `${t.function || 'call'} -> ${tx.to}`,
      sender: signer.name,
      from: tx.from,
      nonce: Number(tx.nonce),
      gasUsedOnAnvil: used.toString(),
      gasLimit: limit.toString(),
      hash: Transaction.from(signed).hash,
      raw: signed,
    });
  }
}
fs.writeFileSync(OUT, JSON.stringify({ chainId: CHAIN_ID, maxFeePerGas: MAX_FEE.toString(), maxPriorityFeePerGas: PRIO.toString(), transactions: plan }, null, 2));
const bytes = plan.reduce((a, p) => a + (p.raw.length - 2) / 2, 0);
console.log(`${plan.length} transactions signed, ${bytes} bytes of raw transactions, written to ${OUT}`);
for (const p of plan) console.log(`${String(p.index).padStart(2)} ${p.phase.padEnd(12)} ${p.sender.padEnd(9)} nonce ${String(p.nonce).padStart(2)} gas ${p.gasLimit.padStart(8)} ${p.label}`);
