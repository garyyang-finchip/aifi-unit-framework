'use strict';
// Canonicalization and identifier helpers of the AIFi Unit Framework (ERC Sections 3.2, 3.3, 6.3, 10.6).
const canonicalize = require('canonicalize');
const { keccak256, toUtf8Bytes, concat, AbiCoder, Interface } = require('ethers');

/** RFC 8785 canonical JSON string of a document. */
function canonicalString(doc) {
  return canonicalize(doc);
}

/** Keccak-256 of the UTF-8 bytes of the canonical JSON (boundaryHash / contentHash / methodId). */
function canonicalHash(doc) {
  return keccak256(toUtf8Bytes(canonicalString(doc)));
}

/** elementId = keccak256(UTF-8(kind) || 0x3A || UTF-8(ref)). */
function elementId(kind, ref) {
  return keccak256(concat([toUtf8Bytes(kind), new Uint8Array([0x3a]), toUtf8Bytes(ref)]));
}

/** profileId / interestId / denominationId / descriptorKind = keccak256(UTF-8(identifier)). */
function idOf(identifier) {
  return keccak256(toUtf8Bytes(identifier));
}

/** Unit reference string (Section 3.3). */
function unitRef(chainId, registry, unitId, version) {
  return `auf:eip155:${chainId}:${registry.toLowerCase()}:${unitId}@${version}`;
}

/** Parse a Unit reference string; returns null when the string is not a Unit reference. */
function parseUnitRef(ref) {
  const m = /^auf:eip155:(\d+):(0x[0-9a-f]{40}):(\d+)@(\d+)$/.exec(ref);
  if (!m) return null;
  return { chainId: Number(m[1]), registry: m[2], unitId: Number(m[3]), version: Number(m[4]) };
}

/** ERC-165 interface id: XOR of all function selectors of an ABI (excluding supportsInterface). */
function interfaceId(abi) {
  const iface = new Interface(abi);
  let acc = 0n;
  iface.forEachFunction((f) => {
    if (f.name === 'supportsInterface') return;
    acc ^= BigInt(f.selector);
  });
  return '0x' + acc.toString(16).padStart(8, '0');
}

/** ABI-encode a ValuationCore struct (Section 11). */
function encodeValuationCore(core) {
  return AbiCoder.defaultAbiCoder().encode(
    ['tuple(bytes32,bytes32,bytes32,bytes32,uint8,uint8,int256,bytes32,uint64,uint64)'],
    [[
      core.methodId,
      core.interestId,
      core.assessmentBoundaryHash,
      core.snapshotHash,
      core.resultKind,
      core.decimals,
      core.value,
      core.denominationId,
      core.asOf,
      core.horizonEnd,
    ]],
  );
}

/** ABI-encode an ObservationCore struct (Section 11). */
function encodeObservationCore(core) {
  return AbiCoder.defaultAbiCoder().encode(
    ['tuple(bytes32,uint64,uint64)'],
    [[core.snapshotHash, core.windowStart, core.windowEnd]],
  );
}

module.exports = {
  canonicalString,
  canonicalHash,
  elementId,
  idOf,
  unitRef,
  parseUnitRef,
  interfaceId,
  encodeValuationCore,
  encodeObservationCore,
};
