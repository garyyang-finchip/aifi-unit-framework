# Draft Magicians post

Suggested title: `Draft ERC: AIFi Unit Framework (AUF) - boundary, roles and valuation statements for AI economic units`

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
