# Magicians post

Posted on 2026-10-21 as topic 30040 (retitled `ERC-8454: AIFi Unit Framework` on 2026-10-21 after the number was assigned; current URL https://ethereum-magicians.org/t/erc-8454-aifi-unit-framework/30040)

Title: `Draft ERC: AIFi Unit Framework (AUF) - boundary, roles and valuation statements for AI economic units`

Category: ERCs

---

This is a draft ERC for the **AIFi Unit Framework (AUF)**: a registry and descriptor model through which any economic object in an AI-driven economy is named, bounded, described, observed, classified and valued as one whole.

Repository (ERC text, reference implementation, schemas, vectors, worked examples): https://github.com/garyyang-finchip/aifi-unit-framework

PR to be added after filing.

## Why

Agents, skills, tasks, models, compute, data and capital are increasingly issued, traded and composed on chain, and several proposals describe individual kinds of these objects, their discovery and their collective decisions. What is missing is the layer underneath: a shared answer to "what is treated as one economic whole here, what does it do economically, and what does this value figure mean?" Without it, two parties mean different things by "the same" agent business, a staking pool or a task gets one permanent label that hides its real roles, and two evaluators publish 100 and 200 without anyone knowing whether those are net equity, a daily yield, a probability or a credit grade, in which currency, as of when, for whose interest.

## What the framework fixes

1. **Boundary.** A Unit is a versioned Unit Definition: elements (agent, skill, task, service, model, compute, data, financial-position, nested unit), typed relations stating the rights and obligations under which each element is included (owns, licenses, reserves, revenue-share, holds, owes, commits, pledges, depends-on, exchanges, controls, contains), ports (economic interfaces), authorities and validity. `boundaryHash = keccak256(JCS(definition))`. Containment pins versions and is acyclic by construction. Typed acknowledgments (participation, resource use, fund operation, endorsement) separate what is claimed from what is confirmed.
2. **Characterization.** Stackable roles (source, sink, conductor, damping, container, pledge, valve, control) attributed to the Unit, a port or an element under conditions; behavior attributes declared separately; behavior models (including an optional financial-circuit analysis profile with stated premises); structure profiles (simple, composite, chip); the credit application profile; explicit knowledge states.
3. **Measurement and valuation statements.** Observation records reconciled per asset (missing is never zero; internal transfers are not flows), and valuation receipts that fix subject version, assessment boundary, interest and perspective, snapshot, content-addressed method, inputs and a typed result (monetary incl. negative, interval, scenario, score, grade, not-valuable, insufficient-evidence, ...).

What it leaves open: the valuation functions, behavior models and credit models themselves. Methods are content-addressed descriptors with declared composability; any evaluator can plug in any method while readers still understand what a figure refers to.

## Kernel

Two registries: `AUFUnitRegistry` (units, versions, containment, definition control, acknowledgments) and `AUFAssertionRegistry` (one assertion envelope for characterizations, observations, valuations and extensions; validity, revocation, supersession; EIP-712/ERC-1271 signed assertions; content-addressed descriptors). Requires only ERC-165, EIP-712 and ERC-1271. Other agent-economy proposals (skills, task tenders, agent identity, KYA, collective decisions, ARD discovery, swarms, ERC-8004) are descriptive bindings, not dependencies. A swarm describes a collaboration organization; a Unit describes an economic boundary, its roles and its measurement.

## What is in the repository

- Full ERC text passing eipw.
- Reference contracts with 57 Foundry tests, ethers <-> solc vector cross-checks (interface ids, canonicalization, element ids, EIP-712 struct hash, bit-exact fixed-point valuation vectors).
- JSON Schemas for all document kinds, four method descriptors (net equity, realized net cash flow, finite-horizon DCF, conditional payoff).
- Seven worked Units: a skill with several non-exclusive licenses, two agent sub-units sharing one license, a swarm as an economic Unit containing them, a task with escrow and conditional settlement valued for three different interests, a contingent obligation with no cash flow (negative and insufficient-evidence receipts), and a running agent packaged as a chip with a financial-circuit model statement.
- A reference resolver (offline and on-chain) that verifies hashes, expands containment by pinned versions, flags shared elements, checks reconciliation and reports unsupported required extensions.
- A four-phase Sepolia evidence script, rehearsed end to end on a local chain; the Sepolia run and its record follow.

## Questions for reviewers

1. Is the split between definition control, resource control, representation and cash-flow rights sufficiently explicit, or should the registry carry more than a controller address?
2. Are the eight roles and the four behavior attributes the right v1 vocabulary, and is the credit-as-profile decision right?
3. Is the valuation receipt's on-chain core (method, interest, assessment boundary, snapshot, result kind, value, denomination, as-of, horizon) the right minimum for indexers, or should interval bounds or an evidence root be on chain too?
4. Acyclic containment by version pinning versus explicit cycle detection: are there compositions this rules out that should be allowed?

Feedback welcome. The text is deliberately self-contained; bindings to the related proposals will deepen in later revisions.

---

## Reply 1: Sepolia evidence (to be posted after `deployments/` is on main)

The Sepolia evidence run is done: 40 transactions, blocks 11964286 to 11964613, every receipt successful, both registries source-verified.

- `AUFUnitRegistry`: `0xE4EcAf6f87A700962f33AAa1A8f4B8e02FA180f8` (Sourcify: https://repo.sourcify.dev/11155111/0xE4EcAf6f87A700962f33AAa1A8f4B8e02FA180f8)
- `AUFAssertionRegistry`: `0xC4f30AfAFFC9E5a7bDEd58c411B87ABe3FBbEd00` (Sourcify: https://repo.sourcify.dev/11155111/0xC4f30AfAFFC9E5a7bDEd58c411B87ABe3FBbEd00)

What is on chain: the four method descriptors, the seven worked Units (the swarm Unit 4 contains Units 2 and 3 at pinned version 1), seven controller characterizations, three observations and eleven valuation receipts signed by a separate evaluator key and relayed through `assertStatementBySig`, two typed acknowledgments, one superseding receipt, one revocation sent by the evaluator itself, and version 2 of Unit 1 (its version-1 receipts do not carry over). The state read back from the registries matches the published descriptors field by field.

Record: https://github.com/garyyang-finchip/aifi-unit-framework/blob/main/docs/sepolia-evidence.md (transactions, decoded state, how to re-run the resolver against the chain). ERC pull request: https://github.com/ethereum/ERCs/pull/2095.

---

## Reply 2: overlap revision landed (to be posted after the repository and PR #2095 are updated)

The overlap revision is up in the repository and in PR #2095 (Sections 3.3, 3.4, the new 3.8, 9, 10.1, 10.6, 14.4.1, exception vector 7, Rationale and Security Considerations). What changed, in the order of the five points above:

1. `underlying` on elements (Section 3.3): what a position is a claim against, with port and share. Same underlying and no declaration about each other makes two elements overlap candidates.
2. `same-claim` and `distinct-claim` relations with a required `basis` (Section 3.4); a parent lists its children's positions and states the relation between them, since element identifiers are global. The obligor confirms through the existing `description-endorsement` acknowledgment (Section 3.8).
3. Resolver rule (Section 3.8): claim groups by identical element id or declared `same-claim`; unresolved overlap candidates reported with the declarations and their basis; no merging on labels, shares or counterparties.
4. Aggregation rule (Section 10.6): over unresolved candidates a composable method returns `interval` (counted once / counted separately, no point value) or `insufficient-evidence`, never a point `monetary` value; every receipt over a composite lists its claim groups and candidates under `inputs.overlaps` with the treatment applied. Composability stays necessary and is explicitly not sufficient.
5. Worked example Units 8 to 11 (`assets/erc-8454/examples/revenue-right-*.json`, `revenue-holdings-*.json`) and exception vector 7: one 40% entitlement held as a token position and as a contractual right (different ids, same underlying). The composite that declares `same-claim` is valued at 45.12 (counted once); the composite that declares nothing gets an interval receipt (45.12 to 90.24) and an insufficient-evidence receipt. `node tools/resolve.js --unit 11` prints the unresolved overlap, and the resolver rejects a point-valued receipt over it.

No contract change and no new dependency; the method descriptors are unchanged because the rule sits above the methods.
