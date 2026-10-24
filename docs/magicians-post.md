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

---

## Reply 3: dependent evidence (answer to the revoked-observation question; to be posted after the repository and PR #2095 are updated)

Thanks, this was a gap: the text defined "current" per assertion and let receipts cite observation assertion ids, but said nothing about what a resolver does with a receipt whose cited observation is later revoked. The revision is now in the repository and in PR #2095 (Sections 6.4, 10.3, 10.6, exception vector 8, registry behavior 8, Rationale and Security Considerations). In short:

1. Statuses do not cascade (Section 6.4). Revoking O does not change V, because only V's asserter can revoke or supersede V; otherwise any observer could silence any evaluator. The dependency is carried by the citation and the consequence is placed on presentation.
2. Resolvers must show an evidence status with every receipt (Section 10.6), from the status and validity window of each cited observation: `withdrawn` (a cited observation is revoked), `superseded`, `unresolved` (a citation does not resolve to an observation), `expired` (a cited observation was outside its window at the receipt's as-of time), `supported`, or `not-cited`; first applicable row wins. For each cited observation the resolver lists its id, status, `supersededBy` and whether it was inside its window at the as-of time.
3. A receipt on `withdrawn` evidence must not be presented as current, while its own status stays active; the evaluator should supersede it (corrected receipt or `insufficient-evidence`). That is the answer to "should the resolver flag V": yes, and it must also stop presenting V as current, but it must still return V on request.
4. The time distinction you asked for is explicit: an observation whose validity window ended after the receipt's as-of time is not withdrawn evidence; the receipt is a statement as of that time, its evidence status stays `supported`, and resolvers must not mark it non-current on that ground. Revocation says the observation was wrong; the end of a window says only that the window has passed. (If the window had already ended at the as-of time, the status is `expired`: visible, but the receipt is still returned as current.)
5. Citations: `snapshot.observations` lists the observation assertion ids (Section 10.3, SHOULD when the observations are registered); a registered observation of the same subject version whose `contentHash` equals `snapshot.hash` counts as cited too, so the receipts already on Sepolia resolve without being re-issued.
6. Test case: exception vector 8, `O -> V -> revoke(O)`, with the expected resolver output, plus the contrast case. The registry side is `testRevokedObservationLeavesDependentReceiptActive` (V stays active, the assertion count is unchanged, the observer's `revoke(V)` reverts, the evaluator supersedes V); the resolver side is `tools/test/resolve-evidence.test.js`, which prints, for V: `active (not current) ... evidence=withdrawn` / `cites observation O revoked: withdrawn by its asserter; the receipt rests on withdrawn evidence and is not presented as current`, and for V2: `active ... evidence=supported` / `cites observation O2 active: validity ended after the receipt's as-of time; not a withdrawal, the receipt stands as of its as-of time`.

No contract change, no schema change and no new dependency.

---

## Reply 4: additivity must be established (answer to the silent-references question; to be posted after the repository and PR #2095 are updated)

Agreed, and your sentence is the rule the text was missing: absence of a detected overlap does not establish that the claims are distinct. As revised on 23 October, Section 3.8 only raised a candidate when two `underlying.ref` were equal, and Section 10.6 required a "resolved claim set" without defining one, so two positions that omit `underlying`, or that name one entitlement under two URIs, raised nothing and could have been summed. The revision is now in the repository and in PR #2095 (Sections 3.3, 3.4, 3.8, 10.1, 10.6, exception vector 9, Rationale and Security Considerations).

1. The resolved claim set is defined positively (Section 3.8). Within a boundary, every pair of positions (`financial-position` elements, of the Unit itself or reached through contained Units) is either in one claim group (same element id or declared `same-claim`), or resolved as distinct by a `distinct-claim` declaration with a basis, or it is an unresolved pair. A missing `underlying`, two different `underlying` references, two URIs that may name one entitlement, or simply "no overlap detected" all land in the last class. The overlap candidate (same `underlying`) is now just a marked subclass of it. Section 10.6 applies unchanged to unresolved pairs: no point `monetary` value, only an `interval` (counted once / counted separately, no point value) or `insufficient-evidence`, and a resolver reports a point value over an unresolved pair as non-conforming. Nothing infers distinctness from reference syntax: two different canonical identifiers can wrap one revenue stream, which is the case of your first question.
2. Keeping it linear: `distinct-claim` (and `same-claim`) take a set form, `"elements": [...]`, so one declaration per definition covers all of its positions. The worked examples now carry it, including the ones that were silent additions before this revision (the skill business with five positions and the swarm with four across its sub-units).
3. The evidence you asked about: a `distinct-claim` declaration with a checkable basis (separate source agreements, different obligors, or disjoint cash-flow schedules). It is reported as claimed until the account that controls the underlying (its issuer or obligor, the relation's counterparty, or the Definition Controller of the underlying Unit) endorses either position through the existing `description-endorsement` acknowledgment, and as confirmed after; the reference resolver reads the endorsements and prints which. Alternatively the evaluator resolves the pair on its own evidence: `inputs.overlaps` gained the treatment `distinct`, basis required; a point value without one of the two is non-conforming. The framework still does not decide whether two references are the same claim; it decides that addition needs someone to have said, with a basis, that they are not.
4. The test: exception vector 9 with two new worked Units. Unit 12 lists the token position without `underlying` and the assignment under a URL, with an `underlying` that names the fee stream under yet another URI, and declares nothing: no overlap candidate, one unresolved pair, receipts `interval` 45.12 to 90.24 and `insufficient-evidence`. Unit 13 holds two tranches of 40% each on the same underlying and declares them distinct with both agreements as basis: `monetary` 90.24 with treatment `distinct`, reported as distinct (claimed). `tools/test/resolve-claims.test.js` runs both through the resolver, checks that a point-valued receipt over Unit 12's pair is rejected and accepted once the receipt states `distinct` with a basis, and checks the claimed-to-confirmed path on an endorsement by the controller of the underlying.

One consequence we accepted: the definitions of Units 1 and 4 registered on Sepolia on 21 October predate the declaration, so the resolver now reports their net-equity receipts as point values over unresolved pairs; that is the rule working on definitions written before it existed, and it is recorded as such in the evidence document. No contract change, no method descriptor change, no new dependency.

---

## Reply 5: confirmation binds to the relation (answer to the endorsement question; to be posted after the repository and PR #2095 are updated)

The revision is in the repository and in PR #2095 (Sections 3.4, 3.8, 4 and 5, exception vector 9, registry behavior 9, Rationale and Security Considerations).

1. The subject of a confirming endorsement is the declaration itself. An identity relation now has an identifier, `relationId = keccak256(JCS(relation))`, the canonical hash of the relation object exactly as it appears in the definition, basis included (Section 3.4). A `same-claim` or `distinct-claim` declaration is confirmed only by a `description-endorsement` whose subject is that `relationId`, recorded on the Unit version that carries the declaration, by an account that controls the underlying of a covered position (issuer or obligor, the relation's counterparty, or the Definition Controller of the underlying Unit). Confirmation is assessed per pair: one such account for both positions, or one for each (Section 3.8).
2. Your scenario is now explicitly excluded: an endorsement of an element confirms the description of that element and nothing about its relation to any other element, and an endorsement recorded on another version, or before the declaration existed, confirms nothing about the declaration. The issuer who endorsed A in some earlier version never saw "A distinct from B", and the text no longer lets that endorsement stand for it (Sections 3.8 and 5.1).
3. No contract change: the registry's `acknowledge(unitId, version, elementId, kind)` always treated the subject as an opaque identifier, so it records an endorsement of a `relationId` exactly like one of an `elementId`, per version and per account (registry behavior 9, with a test). The Sepolia deployment can therefore carry a confirmed declaration with a single `acknowledge`.
4. Tests: a relation identifier vector in the Test Cases (JCS string and hash); `examples.json` lists every declaration of the worked examples with its `relationId`; `tools/test/resolve-claims.test.js` covers an endorsement of the relation by the controller of the underlying (confirmed), an endorsement of position A alone, both before the declaration (on Unit 8) and on the declaring version itself (claimed), an endorsement of the relation on another version or by an account that controls no covered position (claimed), and the different-obligor case, where a pair is confirmed only when an account for each side has endorsed the declaration.
