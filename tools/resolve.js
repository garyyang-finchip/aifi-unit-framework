#!/usr/bin/env node
'use strict';
// Reference resolver of the AIFi Unit Framework (ERC Sections 3.6, 6.4, 8.3, 10.6, 13.3).
//
// Offline mode (default): resolves the worked examples from assets/erc-auf/examples using manifest.json
// as the "registry" (unitId -> definition file), verifies hashes, expands containment by pinned versions,
// groups elements into claim groups (same element id or declared same-claim), resolves every pair of positions
// (declared distinct, or unresolved; overlap candidates marked), checks observation reconciliation and the
// point-value rule for receipts over unresolved pairs, and reports required extensions it does not know.
//
//   node tools/resolve.js                       all example units
//   node tools/resolve.js --unit 4              one example unit
//   node tools/resolve.js --examples deployments/sepolia/examples --unit 1    the descriptors of the Sepolia run
//
// On-chain mode: reads a deployed Unit Registry and Assertion Registry.
//
//   node tools/resolve.js --rpc <url> --registry <unitRegistry> --assertions <assertionRegistry> --unit <id> [--version <n>]
//
// Descriptor URIs of kind data:, http(s): and ipfs:// (through --ipfs-gateway) are fetched; anything else is
// reported as unfetched (unverified, not invalid).

const fs = require('fs');
const path = require('path');
const { JsonRpcProvider, Contract } = require('ethers');
const { canonicalHash, elementId, parseUnitRef } = require('./lib/canonical');
const { equalDecimalSums } = require('./lib/decimal');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(n);

const MAX_DEPTH = Number(arg('--max-depth', '8'));
const MAX_NODES = Number(arg('--max-nodes', '200'));
const KNOWN_EXTENSIONS = new Set((arg('--known-extensions', '') || '').split(',').filter(Boolean));

const UNIT_ABI = [
  'function latestVersion(uint256) view returns (uint32)',
  'function controllerOf(uint256) view returns (address)',
  'function versionOf(uint256,uint32) view returns (bytes32,string,uint64,uint256)',
  'function containedAt(uint256,uint32,uint256) view returns (tuple(uint256 unitId,uint32 version))',
  'function acknowledgedAt(uint256,uint32,bytes32,uint8,address) view returns (uint64)',
];
const ASSERTION_ABI = [
  'function assertionCount(uint256,uint32) view returns (uint256)',
  'function assertionAt(uint256,uint32,uint256) view returns (bytes32)',
  'function assertionOf(bytes32) view returns (tuple(uint8 kind,uint8 status,bool byController,uint32 version,uint64 assertedAt,uint64 validFrom,uint64 validUntil,address asserter,uint256 unitId,bytes32 profileId,bytes32 contentHash,bytes32 supersedes,bytes32 supersededBy,string contentURI))',
  'function valuationCoreOf(bytes32) view returns (tuple(bytes32 methodId,bytes32 interestId,bytes32 assessmentBoundaryHash,bytes32 snapshotHash,uint8 resultKind,uint8 decimals,int256 value,bytes32 denominationId,uint64 asOf,uint64 horizonEnd))',
];
const KIND = ['none', 'characterization', 'observation', 'valuation', 'extension'];
const STATUS = ['none', 'active', 'revoked', 'superseded'];
const RESULT = ['unspecified', 'monetary', 'interval', 'distribution', 'scenario', 'vector', 'conditional', 'score', 'grade', 'not-valuable', 'insufficient-evidence', 'not-applicable'];

// ----------------------------------------------------------------------------- sources

function offlineSource(examplesDir) {
  const dir = examplesDir || arg('--examples', path.join(__dirname, '..', 'assets', 'erc-auf', 'examples'));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const byId = new Map(manifest.units.map((u) => [u.unitId, u]));
  return {
    kind: 'offline',
    registry: manifest.registry,
    chainId: manifest.chainId,
    allUnitIds: () => manifest.units.map((u) => u.unitId),
    async version(unitId, version) {
      const u = byId.get(unitId);
      if (!u) throw new Error(`unit ${unitId} not in manifest`);
      if (version !== 1) throw new Error(`unit ${unitId} version ${version} not in manifest`);
      return { boundaryHash: u.boundaryHash, descriptorURI: `file:${u.file}`, contains: u.contains, controller: u.controller };
    },
    async fetch(uri) {
      if (uri.startsWith('file:')) return JSON.parse(fs.readFileSync(path.join(dir, uri.slice(5)), 'utf8'));
      return null;
    },
    async companions(unitId, version) {
      const u = byId.get(unitId);
      const base = u.file.replace(/\.json$/, '');
      return fs.readdirSync(dir).filter((f) => f.startsWith(base + '.') && f !== u.file).map((f) => ({ file: f, doc: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) })).filter(({ doc }) => doc.kind !== 'unit-definition');
    },
    async assertions() { return []; },
  };
}

function chainSource() {
  const provider = new JsonRpcProvider(arg('--rpc'));
  const units = new Contract(arg('--registry'), UNIT_ABI, provider);
  const assertions = arg('--assertions') ? new Contract(arg('--assertions'), ASSERTION_ABI, provider) : null;
  const gateway = arg('--ipfs-gateway', 'https://ipfs.io/ipfs/');
  return {
    kind: 'chain',
    registry: arg('--registry').toLowerCase(),
    allUnitIds: () => { throw new Error('--unit is required in on-chain mode'); },
    async version(unitId, version) {
      const latest = Number(await units.latestVersion(unitId));
      if (version > latest) throw new Error(`unit ${unitId} has no version ${version}`);
      const [boundaryHash, descriptorURI, , containsCount] = await units.versionOf(unitId, version);
      const contains = [];
      for (let i = 0; i < Number(containsCount); i++) {
        const r = await units.containedAt(unitId, version, i);
        contains.push({ unitId: Number(r.unitId), version: Number(r.version) });
      }
      return { boundaryHash, descriptorURI, contains, controller: await units.controllerOf(unitId), latest };
    },
    // description-endorsement (AckKind 4) of an element of a version by an account (Section 3.8 confirmation)
    async endorsedBy(unitId, version, elementId, account) {
      return Number(await units.acknowledgedAt(unitId, version, elementId, 4, account)) > 0;
    },
    async fetch(uri) {
      if (uri.startsWith('data:')) {
        const m = /^data:([^,;]*)(;base64)?,(.*)$/s.exec(uri);
        const body = m[2] ? Buffer.from(m[3], 'base64').toString('utf8') : decodeURIComponent(m[3]);
        return JSON.parse(body);
      }
      let url = uri;
      if (uri.startsWith('ipfs://')) url = gateway + uri.slice(7);
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      }
      return null;
    },
    async companions() { return []; },
    async assertions(unitId, version) {
      if (!assertions) return [];
      const n = Number(await assertions.assertionCount(unitId, version));
      const lookup = async (id) => {
        try { return assertionEntry(id, await assertions.assertionOf(id)); } catch (e) { return null; }
      };
      const out = [];
      for (let i = 0; i < n; i++) {
        const id = await assertions.assertionAt(unitId, version, i);
        const entry = await lookup(id);
        if (entry.kind === 'valuation') {
          const c = await assertions.valuationCoreOf(id);
          entry.valuation = { methodId: c.methodId, interestId: c.interestId, assessmentBoundaryHash: c.assessmentBoundaryHash, snapshotHash: c.snapshotHash, resultKind: RESULT[Number(c.resultKind)], value: c.value.toString(), decimals: Number(c.decimals), denominationId: c.denominationId, asOf: Number(c.asOf), horizonEnd: Number(c.horizonEnd) };
        }
        out.push(entry);
      }
      // dependent evidence (Section 10.6): resolved once every assertion of the version is known, so that an
      // observation cited by content hash is found among them
      for (const entry of out) {
        if (entry.kind !== 'valuation') continue;
        let doc = null;
        try { doc = await this.fetch(entry.contentURI); } catch (e) { doc = null; }
        entry.doc = doc; // kept for the Section 10.6 checks; stripped from --json output
        entry.evidence = await evidenceOf(entry, doc, lookup, out);
        if (entry.evidence.status === 'withdrawn') entry.current = false;
      }
      return out;
    },
  };
}

// Envelope of an on-chain assertion as the resolver presents it (Section 6.4: current = active and inside its validity window).
function assertionEntry(id, a) {
  const entry = {
    assertionId: id, kind: KIND[Number(a.kind)], status: STATUS[Number(a.status)], byController: a.byController,
    asserter: a.asserter, profileId: a.profileId, contentHash: a.contentHash, contentURI: a.contentURI,
    validFrom: Number(a.validFrom), validUntil: Number(a.validUntil), assertedAt: Number(a.assertedAt),
    supersedes: a.supersedes, supersededBy: a.supersededBy,
  };
  const now = Math.floor(Date.now() / 1000);
  entry.current = entry.status === 'active' && now >= entry.validFrom && (entry.validUntil === 0 || now <= entry.validUntil);
  return entry;
}

// Evidence status of a valuation receipt (Section 10.6, dependent evidence). A receipt cites an observation by listing
// its assertion id in snapshot.observations; a registered observation of the same subject version whose contentHash
// equals snapshot.hash counts as cited as well (`siblings` are the assertions of that version). The statuses, from
// weakest to strongest: supported (every cited observation is active and was inside its validity window at the
// receipt's as-of time), expired (one was outside its window at the as-of time), unresolved (a citation cannot be
// resolved or is not an observation), superseded, withdrawn (a cited observation is revoked). The end of an
// observation's validity window after the as-of time is not withdrawal. The receipt's own status is never changed here.
const EVIDENCE_RANK = { supported: 0, expired: 1, unresolved: 2, superseded: 3, withdrawn: 4 };

async function evidenceOf(receipt, doc, lookup, siblings = []) {
  const out = { status: 'not-cited', observations: [], contentVerified: null };
  if (doc) out.contentVerified = canonicalHash(doc) === receipt.contentHash;
  if (!doc || !doc.snapshot) return out;
  const cited = new Map(); // assertion id -> how the receipt cites it
  for (const id of Array.isArray(doc.snapshot.observations) ? doc.snapshot.observations : []) cited.set(String(id).toLowerCase(), 'listed');
  if (typeof doc.snapshot.hash === 'string') {
    for (const s of siblings) {
      if (s.kind !== 'observation' || !s.contentHash || s.contentHash.toLowerCase() !== doc.snapshot.hash.toLowerCase()) continue;
      if (!cited.has(s.assertionId.toLowerCase())) cited.set(s.assertionId.toLowerCase(), 'content-hash');
    }
  }
  if (!cited.size) return out;
  const asOf = doc.snapshot.asOf ? Math.floor(Date.parse(doc.snapshot.asOf) / 1000) : (receipt.valuation ? receipt.valuation.asOf : 0);
  const now = Math.floor(Date.now() / 1000);
  let status = 'supported';
  const raise = (s) => { if (EVIDENCE_RANK[s] > EVIDENCE_RANK[status]) status = s; };
  for (const [id, citedBy] of cited) {
    const o = await lookup(id);
    if (!o) { out.observations.push({ assertionId: id, citedBy, status: 'unknown' }); raise('unresolved'); continue; }
    const withinWindowAtAsOf = asOf >= o.validFrom && (o.validUntil === 0 || asOf <= o.validUntil);
    const endedAfterAsOf = o.validUntil !== 0 && o.validUntil >= asOf && o.validUntil < now;
    out.observations.push({ assertionId: id, citedBy, kind: o.kind, status: o.status, supersededBy: o.status === 'superseded' ? o.supersededBy : undefined, validFrom: o.validFrom, validUntil: o.validUntil, withinWindowAtAsOf, endedAfterAsOf });
    if (o.kind !== 'observation') { raise('unresolved'); continue; }
    if (o.status === 'revoked') raise('withdrawn');
    else if (o.status === 'superseded') raise('superseded');
    else if (!withinWindowAtAsOf) raise('expired');
  }
  out.status = status;
  return out;
}

// ----------------------------------------------------------------------------- resolution

function checkExtensions(doc, where, report) {
  const walk = (obj, p) => {
    if (!obj || typeof obj !== 'object') return;
    if (obj.extensions && typeof obj.extensions === 'object') {
      for (const [k, v] of Object.entries(obj.extensions)) {
        if (v && v.required === true && !KNOWN_EXTENSIONS.has(k)) report.unsupported.push({ where: `${where}${p}`, extension: k });
      }
    }
    for (const [k, v] of Object.entries(obj)) if (k !== 'extensions') walk(v, `${p}.${k}`);
  };
  walk(doc, '');
}

function checkObservation(doc) {
  const problems = [];
  for (const a of doc.assets || []) {
    const members = ['opening', 'closing', 'inflow', 'outflow', 'minted', 'burned', 'adjustments'];
    const missing = new Set(a.missing || []);
    const absent = members.filter((m) => a[m] === undefined && !missing.has(m));
    if (absent.length) problems.push(`asset ${a.asset}: members absent without being listed as missing: ${absent.join(', ')}`);
    if (members.every((m) => a[m] !== undefined)) {
      try {
        if (!equalDecimalSums([a.closing, a.outflow, a.burned],
          [a.opening, a.inflow, a.minted, ...a.adjustments.map((x) => x.amount)])) {
          problems.push(`asset ${a.asset}: reconciliation failed`);
        }
      } catch (e) {
        problems.push(`asset ${a.asset}: invalid observation amount (${e.message})`);
      }
    } else {
      problems.push(`asset ${a.asset}: reconciliation not checkable (missing: ${[...missing].join(', ')}); missing values are unknown, not zero`);
    }
  }
  return problems;
}

async function resolveUnit(src, unitId, version, report, pathSoFar = [], depth = 0) {
  if (report.nodes.length >= MAX_NODES) { report.partial.push({ unitId, version, reason: 'max nodes reached' }); return null; }
  if (depth > MAX_DEPTH) { report.partial.push({ unitId, version, reason: 'max depth reached' }); return null; }
  const v = await src.version(unitId, version);
  const node = { unitId, version, boundaryHash: v.boundaryHash, controller: v.controller, descriptorURI: v.descriptorURI, verified: false, elements: [], children: [], problems: [] };
  report.nodes.push(node);
  let doc = null;
  try { doc = await src.fetch(v.descriptorURI); } catch (e) { node.problems.push(`fetch failed: ${e.message}`); }
  if (!doc) { node.problems.push('descriptor not fetched; unverified'); }
  else {
    const h = canonicalHash(doc);
    node.verified = h === v.boundaryHash;
    if (!node.verified) node.problems.push(`descriptor hash ${h} does not match on-chain boundaryHash ${v.boundaryHash}`);
    node.name = doc.unit && doc.unit.name;
    checkExtensions(doc, `unit ${unitId}@${version}`, report);
    const ids = new Map();
    for (const e of doc.elements || []) {
      const id = elementId(e.kind, e.ref);
      if (ids.has(id)) node.problems.push(`duplicate elementId ${id}`);
      ids.set(id, e);
      node.elements.push({ elementId: id, kind: e.kind, ref: e.ref, label: e.label });
      const key = id;
      if (!report.elementIndex.has(key)) report.elementIndex.set(key, []);
      report.elementIndex.get(key).push({ path: [...pathSoFar, `${unitId}@${version}`], unitId, version, relation: null, label: e.label, controller: e.controller, underlying: e.underlying, counterparty: null });
      if (e.kind === 'financial-position' && !report.positions.has(id)) report.positions.set(id, { kind: e.kind, ref: e.ref, label: e.label });
      if (e.underlying && e.underlying.ref) {
        const ukey = `${e.underlying.ref}${e.underlying.port ? '#' + e.underlying.port : ''}`;
        if (!report.underlying.has(ukey)) report.underlying.set(ukey, new Set());
        report.underlying.get(ukey).add(id);
      }
    }
    for (const r of doc.relations || []) {
      const identity = r.type === 'same-claim' || r.type === 'distinct-claim';
      if (Array.isArray(r.elements)) {
        // set form (Section 3.4): the relation holds between every pair of the listed elements
        for (const id of r.elements) if (!ids.has(id)) node.problems.push(`${r.type} set references unknown element ${id}`);
        if (identity && r.elements.length >= 2) report.claimDeclarations.push({ type: r.type, members: [...new Set(r.elements)], basis: r.basis || [], declaredIn: `${unitId}@${version}`, unitId, version });
        continue;
      }
      for (const end of [r.from, r.to]) if (end !== 'unit' && !ids.has(end)) node.problems.push(`relation ${r.type} references unknown endpoint ${end}`);
      if (r.type === 'licenses' || r.type === 'owns' || r.type === 'holds' || r.type === 'revenue-share' || r.type === 'owes') {
        const hits = report.elementIndex.get(r.to);
        if (hits) { hits[hits.length - 1].relation = { type: r.type, share: r.share, exclusive: r.exclusive }; if (r.counterparty) hits[hits.length - 1].counterparty = r.counterparty; }
      }
      if (identity && r.from !== 'unit' && r.to !== 'unit') {
        report.claimDeclarations.push({ type: r.type, members: [r.from, r.to], basis: r.basis || [], declaredIn: `${unitId}@${version}`, unitId, version });
      }
    }
    // containment: on-chain list must match the definition's contains relations
    const declared = (doc.relations || []).filter((r) => r.type === 'contains').map((r) => ids.get(r.to)).filter(Boolean).map((e) => parseUnitRef(e.ref)).filter(Boolean);
    const declaredSet = new Set(declared.map((d) => `${d.registry}:${d.unitId}@${d.version}`));
    const onchainSet = new Set(v.contains.map((c) => `${src.registry}:${c.unitId}@${c.version}`));
    for (const d of declaredSet) if (!onchainSet.has(d)) node.problems.push(`contains ${d} declared in the definition but not recorded on chain`);
    for (const c of onchainSet) if (!declaredSet.has(c)) node.problems.push(`contains ${c} recorded on chain but not declared in the definition`);
  }
  for (const c of v.contains) {
    const child = await resolveUnit(src, c.unitId, c.version, report, [...pathSoFar, `${unitId}@${version}`], depth + 1);
    if (child) node.children.push(child);
  }
  // companions (offline) and assertions (chain)
  const companions = await src.companions(unitId, version);
  node.companions = [];
  for (const { file, doc: cdoc } of companions) {
    const entry = { file, kind: cdoc.kind, contentHash: canonicalHash(cdoc), subjectMatches: cdoc.subject && cdoc.subject.boundaryHash === v.boundaryHash, doc: cdoc };
    checkExtensions(cdoc, `${file}`, report);
    if (cdoc.kind === 'observation') entry.problems = checkObservation(cdoc);
    if (cdoc.kind === 'valuation') {
      entry.summary = { interest: cdoc.interest.id, perspective: cdoc.interest.perspective, method: cdoc.method.name || cdoc.method.id, resultKind: cdoc.result.kind, value: cdoc.result.value, denomination: cdoc.result.denomination, assessmentBoundaryDiffers: !!(cdoc.assessmentBoundary && cdoc.assessmentBoundary.hash !== cdoc.subject.boundaryHash) };
      // offline: there is no registry state, so statuses are unknown; report which observation record (by content
      // hash) the snapshot rests on. Statuses are resolved in chain mode (evidenceOf).
      const obs = companions.find(({ doc: d }) => d.kind === 'observation' && cdoc.snapshot && canonicalHash(d) === cdoc.snapshot.hash);
      entry.evidence = obs ? { status: 'supported', citedBy: 'content-hash', observation: obs.file } : { status: cdoc.snapshot && Array.isArray(cdoc.snapshot.observations) && cdoc.snapshot.observations.length ? 'unresolved' : 'not-cited' };
    }
    node.companions.push(entry);
  }
  node.assertions = await src.assertions(unitId, version);
  return node;
}

// Claim groups (Section 3.8): elements with the same id are one element; elements linked by same-claim are one claim.
function claimGroups(report) {
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { parent.set(find(a), find(b)); };
  for (const id of report.elementIndex.keys()) parent.set(id, id);
  for (const d of report.claimDeclarations) {
    if (d.type !== 'same-claim') continue;
    for (const x of d.members) if (!parent.has(x)) parent.set(x, x);
    for (let i = 1; i < d.members.length; i++) union(d.members[0], d.members[i]);
  }
  const groups = new Map();
  for (const id of parent.keys()) { const r = find(id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(id); }
  const out = [];
  for (const members of groups.values()) {
    const occurrences = [];
    for (const id of members) for (const h of report.elementIndex.get(id) || []) occurrences.push({ elementId: id, path: h.path.join(' > '), relation: h.relation, label: h.label });
    const declared = report.claimDeclarations.filter((d) => d.type === 'same-claim' && d.members.some((m) => members.includes(m)));
    if (occurrences.length > 1) out.push({ members, occurrences, declaredBy: declared.map((d) => ({ in: d.declaredIn, basis: d.basis })) });
  }
  return { groups: out, groupOf: (id) => (parent.has(id) ? find(id) : id) };
}

// Pair resolution (Section 3.8). Every pair of positions (financial-position elements of the tree) that lies in two
// different claim groups is either resolved as distinct, by a distinct-claim declaration found in a definition of the
// tree, or an unresolved pair; an unresolved pair whose underlying references are equal is in addition an overlap
// candidate. Nothing else (labels, shares, counterparties, missing or differing underlying references) resolves a pair.
const pairKey = (a, b) => [a, b].sort().join('|');
function pairResolution(report, groupOf) {
  const underlyingOf = new Map();
  for (const [ukey, idSet] of report.underlying.entries()) for (const id of idSet) underlyingOf.set(id, ukey);
  const distinct = new Map(); // pair key -> declarations covering it
  for (const d of report.claimDeclarations) {
    if (d.type !== 'distinct-claim') continue;
    for (let i = 0; i < d.members.length; i++) {
      for (let j = i + 1; j < d.members.length; j++) {
        const k = pairKey(d.members[i], d.members[j]);
        if (!distinct.has(k)) distinct.set(k, []);
        distinct.get(k).push(d);
      }
    }
  }
  const where = (id) => (report.elementIndex.get(id) || []).map((h) => h.path.join(' > '));
  const ids = [...report.positions.keys()];
  const unresolved = [];
  const resolved = [];
  const contradictions = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]; const b = ids[j];
      const k = pairKey(a, b);
      const sameGroup = groupOf(a) === groupOf(b);
      const decl = distinct.get(k);
      if (sameGroup) {
        if (decl) contradictions.push({ elements: [a, b], declaredBy: decl.map((d) => ({ in: d.declaredIn, basis: d.basis })) });
        continue;
      }
      const ua = underlyingOf.get(a); const ub = underlyingOf.get(b);
      const sharedUnderlying = ua && ub && ua === ub ? ua : null;
      if (decl) resolved.push({ elements: [a, b], sharedUnderlying, declaredBy: decl.map((d) => ({ in: d.declaredIn, unitId: d.unitId, version: d.version, basis: d.basis })), where: [where(a), where(b)] });
      else unresolved.push({ elements: [a, b], sharedUnderlying, underlying: [ua || null, ub || null], where: [where(a), where(b)] });
    }
  }
  return { unresolved, resolved, contradictions };
}

// Confirmation of a declaration (Section 3.8): a description-endorsement of either element, on the declaring version,
// by an account that controls the underlying (the element's controller, the relation's counterparty, or the
// Definition Controller of the underlying Unit). Needs a source that can read acknowledgments; otherwise `claimed`.
async function confirmDeclarations(src, report, pairs) {
  const account = (caip) => { const m = /^eip155:\d+:(0x[0-9a-fA-F]{40})$/.exec(caip || ''); return m ? m[1].toLowerCase() : null; };
  for (const pair of pairs) {
    pair.confirmation = 'claimed';
    if (!src.endorsedBy) continue;
    const candidates = new Set();
    for (const id of pair.elements) {
      for (const h of report.elementIndex.get(id) || []) {
        if (account(h.controller)) candidates.add(account(h.controller));
        if (account(h.counterparty)) candidates.add(account(h.counterparty));
        const u = h.underlying && parseUnitRef(h.underlying.ref);
        if (u && u.registry.toLowerCase() === String(src.registry).toLowerCase()) {
          try { const v = await src.version(u.unitId, u.version); if (v.controller) candidates.add(String(v.controller).toLowerCase()); } catch (e) { /* unknown underlying unit */ }
        }
      }
    }
    for (const d of pair.declaredBy) {
      for (const id of pair.elements) {
        for (const acct of candidates) {
          if (await src.endorsedBy(d.unitId, d.version, id, acct)) { pair.confirmation = 'confirmed'; pair.confirmedBy = acct; }
        }
      }
    }
  }
}

// Section 10.6: a receipt must not carry a point monetary value while a pair of positions it adds is unresolved, unless
// the receipt itself resolves the pair with a treatment and a basis. The positions a receipt adds are the elements its
// method inputs name (method.params.assets / liabilities, inputs.data); a net-equity receipt that names no elements is
// taken to add every position of the boundary. Receipts of flow-based methods (realized net cash flow) add no positions.
const POSITION_ADDING = (doc) => (doc.method && doc.method.name === 'auf:method:net-equity@1') || (doc.interest && doc.interest.id === 'auf:interest:net-equity@1');
function elementsUsed(doc) {
  const out = new Set();
  const params = (doc.method && doc.method.params) || {};
  for (const list of [params.assets, params.liabilities, doc.inputs && doc.inputs.data]) {
    for (const x of Array.isArray(list) ? list : []) if (x && typeof x.element === 'string') out.add(x.element.toLowerCase());
  }
  return out;
}
function checkReceiptsAgainstPairs(root, unresolved) {
  const problems = [];
  if (!unresolved.length) return problems;
  const receipts = [...(root.companions || []).map((c) => ({ ...c, label: c.file })), ...(root.assertions || []).filter((a) => a.status === 'active').map((a) => ({ ...a, label: `assertion ${a.assertionId}` }))];
  for (const c of receipts) {
    if (c.kind !== 'valuation' || !c.doc) continue;
    const r = c.doc.result;
    if (r.kind !== 'monetary') continue;
    const used = elementsUsed(c.doc);
    const wholeBoundary = used.size === 0 && POSITION_ADDING(c.doc);
    const overlaps = (c.doc.inputs && c.doc.inputs.overlaps) || [];
    for (const pair of unresolved) {
      if (!wholeBoundary && !pair.elements.every((e) => used.has(e.toLowerCase()))) continue;
      const stated = overlaps.find((o) => pair.elements.every((e) => o.elements.includes(e)));
      const resolved = stated && stated.treatment !== 'unresolved' && (stated.treatment === 'excluded' || stated.treatment === 'netted' || (Array.isArray(stated.basis) && stated.basis.length > 0));
      if (!resolved) problems.push(`${c.label}: point monetary value although the pair ${pair.elements.join(' / ')} is unresolved${pair.sharedUnderlying ? ` (overlap candidate, underlying ${pair.sharedUnderlying})` : ' (no declaration covers it)'}`);
    }
  }
  return problems;
}

// Resolves one Unit version with a source and returns the summary (used by main and by tools/test-resolve.js).
async function resolveSummary(src, unitId, version) {
  const report = { nodes: [], partial: [], unsupported: [], elementIndex: new Map(), positions: new Map(), underlying: new Map(), claimDeclarations: [] };
  const root = await resolveUnit(src, unitId, version, report);
  const { groups, groupOf } = claimGroups(report);
  const pairs = pairResolution(report, groupOf);
  await confirmDeclarations(src, report, pairs.resolved);
  const overlapProblems = checkReceiptsAgainstPairs(root, pairs.unresolved);
  for (const c of pairs.contradictions) overlapProblems.push(`contradictory declarations: ${c.elements.join(' / ')} are one claim group and are also declared distinct (${c.declaredBy.map((d) => d.in).join(', ')})`);
  let problems = report.unsupported.length + overlapProblems.length;
  for (const n of report.nodes) problems += n.problems.length + (n.companions || []).reduce((a, c) => a + (c.problems ? c.problems.length : 0), 0);
  return { root, partial: report.partial, unsupported: report.unsupported, claimGroups: groups, unresolvedPairs: pairs.unresolved, distinctPairs: pairs.resolved, contradictions: pairs.contradictions, overlapProblems, problems, note: 'Valuations are listed per interest, denomination and assessment boundary and are never aggregated by this resolver.' };
}

// Text presentation of a summary (what `node tools/resolve.js` prints without --json).
function printSummary(s, log = console.log) {
  const print = (n, indent) => {
    log(`${' '.repeat(indent)}unit ${n.unitId}@${n.version} ${n.name ? JSON.stringify(n.name) : ''} ${n.verified ? 'verified' : 'UNVERIFIED'} controller=${n.controller}`);
    for (const p of n.problems) log(`${' '.repeat(indent + 2)}! ${p}`);
    for (const c of n.companions || []) {
      const extra = c.summary ? ` ${c.summary.interest} (${c.summary.perspective}) ${c.summary.resultKind}${c.summary.value !== undefined ? ' ' + c.summary.value + ' ' + (c.summary.denomination || '') : ''}` : '';
      const ev = c.evidence && c.evidence.status !== 'not-cited' ? ` evidence=${c.evidence.status}${c.evidence.observation ? ' (' + c.evidence.observation + ')' : ''}` : '';
      log(`${' '.repeat(indent + 2)}- ${c.kind}: ${c.file}${c.subjectMatches ? '' : ' [subject mismatch]'}${extra}${ev}`);
      for (const p of c.problems || []) log(`${' '.repeat(indent + 4)}! ${p}`);
    }
    for (const a of n.assertions || []) {
      const ev = a.evidence && a.evidence.status !== 'not-cited' ? ` evidence=${a.evidence.status}` : '';
      log(`${' '.repeat(indent + 2)}- ${a.kind} ${a.assertionId} ${a.status}${a.current ? '' : ' (not current)'} by ${a.asserter}${a.byController ? ' [controller]' : ''}${a.valuation ? ` ${a.valuation.resultKind} ${a.valuation.value}e-${a.valuation.decimals}` : ''}${ev}`);
      for (const o of (a.evidence && a.evidence.observations) || []) {
        const why = o.status === 'unknown' ? 'not found in this registry'
          : o.kind !== 'observation' ? `resolves to a ${o.kind}, not to an observation`
          : o.status === 'revoked' ? 'withdrawn by its asserter; the receipt rests on withdrawn evidence and is not presented as current'
          : o.status === 'superseded' ? `superseded by ${o.supersededBy}; compare the receipt with the superseding record`
          : !o.withinWindowAtAsOf ? 'outside its validity window at the receipt\'s as-of time; the receipt rests on evidence that was not current when it was made'
          : o.endedAfterAsOf ? 'validity ended after the receipt\'s as-of time; not a withdrawal, the receipt stands as of its as-of time'
          : 'active';
        log(`${' '.repeat(indent + 6)}cites observation ${o.assertionId}${o.citedBy === 'content-hash' ? ' (by content hash)' : ''} ${o.status}: ${why}`);
      }
    }
    for (const ch of n.children) print(ch, indent + 2);
  };
  print(s.root, 0);
  for (const g of s.claimGroups) {
    const how = g.declaredBy.length ? `declared same-claim in ${g.declaredBy.map((d) => d.in).join(', ')} (basis ${g.declaredBy.map((d) => d.basis.join(', ')).join('; ')})` : 'same element id';
    log(`  claim group {${g.members.map((m) => m.slice(0, 10)).join(', ')}} appears ${g.occurrences.length} times (${how}): ${g.occurrences.map((o) => `${o.path}${o.relation ? ` [${o.relation.type}${o.relation.share ? ' share ' + o.relation.share : ''}]` : ''}`).join('; ')} -> count once at the parent`);
  }
  // distinct pairs are printed per declaration (one set-form declaration usually covers many pairs)
  const byDeclaration = new Map();
  for (const d of s.distinctPairs) {
    for (const x of d.declaredBy) {
      const k = `${x.in}|${x.basis.join(',')}`;
      if (!byDeclaration.has(k)) byDeclaration.set(k, { in: x.in, basis: x.basis, members: new Set(), pairs: 0, shared: 0, confirmation: d.confirmation, confirmedBy: d.confirmedBy });
      const g = byDeclaration.get(k);
      g.members.add(d.elements[0]); g.members.add(d.elements[1]); g.pairs++; if (d.sharedUnderlying) g.shared++;
      if (d.confirmation === 'confirmed') { g.confirmation = 'confirmed'; g.confirmedBy = d.confirmedBy; }
    }
  }
  for (const g of byDeclaration.values()) log(`  distinct (${g.confirmation}${g.confirmedBy ? ' by ' + g.confirmedBy : ''}): {${[...g.members].map((m) => m.slice(0, 10)).join(', ')}} declared distinct claims in ${g.in} (basis ${g.basis.join(', ')}): ${g.pairs} pair(s) resolved${g.shared ? `, ${g.shared} of them with a shared underlying` : ''} -> counted separately`);
  for (const c of s.unresolvedPairs) log(`  UNRESOLVED PAIR: ${c.elements[0]} (${c.where[0].join(', ')}) and ${c.elements[1]} (${c.where[1].join(', ')})${c.sharedUnderlying ? ` share the underlying ${c.sharedUnderlying} (overlap candidate) and` : ` (underlying ${c.underlying[0] || 'not declared'} / ${c.underlying[1] || 'not declared'}; no overlap detected, which establishes nothing)`} carry no same-claim or distinct-claim declaration -> no point value admissible; interval or insufficient-evidence only`);
  for (const p of s.overlapProblems) log(`  ! ${p}`);
  for (const u of s.unsupported) log(`  UNSUPPORTED required extension ${u.extension} at ${u.where}`);
  for (const p of s.partial) log(`  PARTIAL: ${p.unitId}@${p.version}: ${p.reason}`);
}

async function main() {
  const src = has('--rpc') ? chainSource() : offlineSource();
  const unitIds = has('--unit') ? [Number(arg('--unit'))] : src.allUnitIds();
  const version = Number(arg('--version', '1'));
  const out = [];
  let problems = 0;
  for (const unitId of unitIds) {
    const summary = await resolveSummary(src, unitId, version);
    out.push(summary);
    problems += summary.problems;
  }
  if (has('--json')) { console.log(JSON.stringify(out, (k, v) => (k === 'doc' ? undefined : typeof v === 'bigint' ? v.toString() : v), 2)); }
  else for (const s of out) printSummary(s);
  if (problems) { console.error(`${problems} problem(s) reported`); process.exit(1); }
}

module.exports = { offlineSource, resolveUnit, resolveSummary, claimGroups, pairResolution, confirmDeclarations, checkReceiptsAgainstPairs, evidenceOf, assertionEntry, printSummary };

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
