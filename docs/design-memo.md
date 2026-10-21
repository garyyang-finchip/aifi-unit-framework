# AIFi Unit Framework (AUF) - design memo v0.1

Working notes behind the draft ERC. The ERC text is normative; this memo records why the design is what it is, which advisor positions were adopted, and what remains open for the review rounds.

## 1. Scope and the one-sentence definition

An AIFi Unit is an economic object with an explicit boundary (composition, rights and obligations, economic interfaces, time) that is treated as one whole for description, observation, characterization and valuation. It can be a single element or a composition of elements and other Units, including compositions in which new elements emerge. Its existence does not depend on autonomy, current income or positive value: a skill that has not earned anything, a task that carries a fulfillment cost and a guarantee whose value is negative are all Units.

The framework fixes three things (boundary, characterization, valuation statement) and deliberately leaves the valuation functions, behavior models and credit models open.

## 2. Modeling order, not derivation chain

The first draft presented "boundary -> ports -> cash flows -> constitutive relations -> valuation" as a derivation chain. That overstated what follows from what. The same realized cash flows can come from different strategies, rights and risk arrangements; a boundary plus history does not identify a class, let alone a value; and Units with no history must be admissible. The adopted main line is:

boundary and rights -> exchange ports, state and obligations -> verifiable observations -> behavior models and classification under stated applicability -> valuation for a named interest.

Each layer depends on the earlier ones for its meaning; none is uniquely determined by them.

## 3. Boundary decisions

- **Relations carry rights.** The same model enters a Unit very differently as owned weights, a monthly license, reserved capacity or an external dependency with a payment obligation. Relation types are grouped as structural (`contains`), entitlement (`owns`, `licenses`, `reserves`, `revenue-share`, `holds`), obligation (`owes`, `commits`, `pledges`), dependency (`depends-on`) and interaction (`exchanges`, `controls`); attributes are scope, term, quantity, share, exclusivity, obligations, counterparty and basis. Meanings are stated from `from` to `to`.
- **Element kinds v1:** agent, skill, task, service, model, compute, data, financial-position, unit. A protocol such as a tool protocol is a property of a `service` element, not a kind. Capital is a specific position (funds, receivable, liability, revenue right, collateral), never a generic label. Data rights are access, use, sublicensing or ownership, stated in the relation.
- **Ports are interfaces, not counterparties.** A Unit facing many counterparties declares a bounded set of port templates.
- **Containment is acyclic by construction.** A version can only contain versions that already exist and never a version of its own Unit; pinned versions give parents a stable boundary hash. Cross-holdings are entitlement relations (allowed to form cycles), not mutual containment.
- **Authorities are separated.** Definition control (who publishes versions) is not resource control, representation or a claim on cash flows, and the ERC says so in one sentence. Settlement accounts are optional declarations. Frozen definitions have no controller.
- **Acknowledgments are typed.** Participation, resource-use authorization, fund-operation authorization and endorsement of a description are different commitments; they are never collapsed into one boolean. External dependencies are never asked to sign, so independent analysis stays possible.

## 4. Characterization decisions

- **Roles are stackable statements**, "a part of the Unit, under a state and conditions, performs a function", not permanent labels. Eight roles: source, sink, conductor, damping, container, pledge, valve, control. Valve and control were extracted from "other" because conditional release, eligibility gating, budget cut-offs and congestion pricing shape agent economics even when the gating element holds no funds.
- **Source mechanisms are named** (production, external injection, financing, borrowing, issuance, subsidy) so that different kinds of inflow are not accumulated as one kind of value creation. The framework does not assert that issuance lowers value or that burning transfers wealth; provenance supports sustainability analysis, it is not a built-in detector of anything.
- **Credit is an application profile**, not a role and not a memristor. Credit terms depend on performance quality, concentration and external events, not only on cumulative volume. "Memristive" is a model label available only when the stated relation actually holds; history dependence is a behavior attribute.
- **Chip is a structure profile** defined by explicit external interfaces and internal composition. Reducibility to a simpler model is an analysis result, not an admission condition, because it depends on the model, the variables kept and the tolerated error.
- **Behavior attributes are declared separately** (linearity, determinism, time variance, memory; `unknown` allowed) because they are not alternatives on one axis.
- **No completeness claim for any set of axes.** Completeness is operational: any legitimate element can be referenced, any composition can state its relations and rights, and any situation that cannot yet be classified or valued can be expressed as such (knowledge states).

## 5. Measurement and valuation decisions

- **Measurement is separated from valuation.** Observations record per-asset stocks `Q_a`, port transfers `F_{p,a}`, minting, burning and explicit adjustments, reconciled per asset: `closing - opening = inflow - outflow + minted - burned + adjustments`. Quantities of different assets are never added; conversion belongs to a valuation. Internal transfers are not inflow or outflow. Depreciation, drift and credit deterioration are non-cash state entries. Missing is listed as missing and is never zero.
- **No universal conservation law.** Tellegen-type identities hold for any element types once flows satisfy conservation and potentials derive from node potentials; whether economic value differences behave that way is a premise a model must state. The identity is a consistency check inside the financial-circuit profile, never a normative statement about economic value.
- **Dimensional discipline in the circuit profile.** `phi` is the time integral of the chosen potential and has its unit; it is not locked value times time unless the model defines it so. Capital occupation is a separate quantity.
- **Receipts fix the interest and perspective** (whole, net equity, revenue right, usage right, fulfillment claim, obligation, position; holder, user, executor, funder, counterparty, analyst), the snapshot, the method and its parameters, the denomination, the as-of time, the horizon and the coverage. A matching boundary hash is necessary, not sufficient, for comparability. An evaluator who widens the boundary publishes its own assessment boundary hash with a delta, and never publishes a version of the subject Unit it does not control.
- **Result kinds are typed.** Monetary (zero and negative allowed), interval, distribution, scenario, vector, conditional, score, grade, not-valuable, insufficient-evidence, not-applicable. A score is never a price.
- **Methods are content-addressed descriptors** that fix input and output schemas and the algorithm version; a URL hash is not a method. Composability is declared per method as additive, sub-additive, super-additive, conditional, context-dependent, unsupported or unknown, with conditions. Registration is discovery, not approval.
- **First profiles:** net equity, realized net cash flow (an observation profile, not a value), finite-horizon DCF with fixed rate and explicit terminal value, conditional payoff with declared probability basis and cost inclusion. Thevenin equivalents live in the financial-circuit behavior profile, not among valuation methods.

## 6. Kernel

Two registries, both ERC-165:

- `AUFUnitRegistry`: `registerUnit`, `publishVersion`, `setController` (zero address freezes), `acknowledge`, `withdrawAcknowledgment`, views. Containment entries are verified to exist and not to reference the Unit being published.
- `AUFAssertionRegistry`: `registerDescriptor` (write-once per hash), `assertStatement`, `assertStatementBySig` (EIP-712, ERC-1271), `revoke`, views and per-version enumeration. One envelope for characterization, observation, valuation and extension; valuation and observation carry typed on-chain cores for indexers; `byController` is frozen at recording time; supersession requires same asserter, kind and Unit and an active target.

Everything else is off chain and content-addressed: definitions, characterizations, observations, method descriptors, profile descriptors, receipts, with JSON Schemas in the assets.

## 7. Dependencies and filing posture

The ERC requires only ERC-165, EIP-712 and ERC-1271. The author's other proposals (skills, task tenders, KYA, AID, ACDF, ARD Onchain, swarms) and ERC-8004 are descriptive bindings; merged proposals are linked, unmerged ones are described by concept. The target is a clean lint and a fast number assignment; bindings deepen in later revisions once the family is merged.

## 8. Open questions for the review rounds

1. Whether `contains` should additionally accept Units of other registries once a cross-registry reference format is settled (today: `depends-on`, unverified containment).
2. Whether a minimal on-chain check of "plausible controller" for CAIP-19 elements (token owner or approved) should become a registry view, or stay a resolver duty.
3. Whether valuation receipts should carry an optional `evidenceRoot` for batch evidence (Merkle root of inputs) in the on-chain core.
4. Whether to add `interval` low/high to the on-chain core (today only the point estimate is on chain).
5. Fee, bond and eligibility profiles for evaluators (kept out of the kernel on purpose).
6. A signed off-chain acknowledgment variant (today acknowledgments are transactions).
