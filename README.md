# AIFi Unit Framework (AUF)

Reference repository of the draft ERC **AIFi Unit Framework**: a registry and descriptor model through which any economic object in an AI-driven economy (a running agent, a static skill, a task with escrowed funds, a model license, a compute quota, a data right, a capital position, or any composition of these, including agent swarms) is named, bounded, described, observed, classified and valued as one whole.

Status: Draft text ready for filing (placeholder number 9999). Discussion thread: https://ethereum-magicians.org/t/draft-erc-aifi-unit-framework-auf-boundary-roles-and-valuation-statements-for-ai-economic-units/30040. Reference implementation, schemas, vectors and worked examples are complete; the Sepolia evidence run is prepared (see below).

## What it is

The framework fixes three things and leaves the fourth open:

1. **Boundary.** A Unit is a versioned Unit Definition: elements (agent, skill, task, service, model, compute, data, financial-position, nested unit), typed relations with the rights and obligations under which each element is included (owns, licenses, reserves, revenue-share, holds, owes, commits, pledges, depends-on, exchanges, controls, contains), economic interfaces (ports), authorities and validity. Each version is committed on chain by `boundaryHash = keccak256(JCS(definition))`.
2. **Characterization.** Stackable economic roles (source, sink, conductor, damping, container, pledge, valve, control) attributed to the Unit, a port or an element under stated conditions; behavior attributes (linearity, determinism, time variance, memory) declared separately; behavior models (the financial-circuit analysis profile among them); structure profiles (simple, composite, chip); application profiles (credit); explicit knowledge states (classified, unclassified, insufficient-evidence, not-applicable).
3. **Measurement and valuation statements.** Observation records (per-asset stocks, port transfers, minting, burning, adjustments, non-cash changes, coverage; missing is never zero) and valuation receipts (subject version, assessment boundary, interest and perspective, snapshot, content-addressed method, inputs, typed result incl. negative, interval, scenario, score, grade and "cannot value").
4. **Open:** the valuation functions, behavior models and credit models themselves. Methods are content-addressed descriptors; any evaluator can plug in any method while every reader still understands what a figure refers to.

Two small registries carry it on chain: `AUFUnitRegistry` (units, versions, containment of pinned versions, definition control, typed acknowledgments) and `AUFAssertionRegistry` (one assertion envelope for characterizations, observations, valuations and extensions, with validity, revocation, supersession, EIP-712/ERC-1271 signed assertions, and content-addressed descriptors).

## Repository

```
ERCS/erc-auf.md                      ERC text (source; filing package renames it to erc-<number>.md)
assets/erc-auf/
  contracts/                         AUFUnitRegistry, AUFAssertionRegistry, AUFTypes, AUFErrors,
                                     interfaces/, libraries/AUFValuationLib
  schemas/                           JSON Schemas (unit definition, characterization, observation,
                                     method descriptor, profile descriptor, valuation receipt, common)
  vectors/                           interface ids, identifiers, canonicalization, valuation vectors,
                                     EIP-712 vector, example hashes, methods/ (4 method descriptors)
  examples/                          7 worked Units with characterizations, observations and receipts
test/                                Foundry suite (57 tests) incl. ethers <-> solc vector cross-checks
tools/                               build-examples.js, vectors.js, validate.js, resolve.js, lint-erc.js
script/SepoliaEvidence.s.sol         four-phase evidence run (deploy, register, assert, lifecycle)
scripts/make-filing-package.py       builds ercs-pr-package/ for the ethereum/ERCs pull request
docs/                                design memo, financial-circuit profile, Magicians post, test record, runbook
```

## Build and test

```
npm install
forge build
forge test
npm run check          # rebuild examples, regenerate vectors, validate schemas, run the offline resolver
npm run lint:erc       # eipw lint of the ERC text (spelling findings are listed, not gating)
python3 scripts/make-filing-package.py --number 9999
```

`forge` needs solc 0.8.30 (downloaded automatically) and the vendored `lib/forge-std` (1.9.7).

## Identifiers

| Item | Value |
|---|---|
| `IAUFUnitRegistry` interface id | `0x7128ef29` |
| `IAUFAssertionRegistry` interface id | `0x46ae6e24` |
| Canonicalization vector `boundaryHash` | `0xf77f708fc500b49c5471a1e6b9f268ccb7d26fb805a7cdf5b4a33a81b93d5be5` |
| Element id vector | `0x3f13ce02d4a85ecacba5b5a5e6658105bf3f9208088d43b2d394a1c1ca00d656` |
| EIP-712 domain | name `AUFAssertionRegistry`, version `1` |

Method ids of the four reference valuation profiles are in `assets/erc-auf/vectors/identifiers.json`.

## Valuation vectors

| Vector | Assumptions | Result |
|---|---|---|
| Net equity | cash 100, payable 30 | 70.00 |
| Realized net cash flow | revenue 100, compute 30, fees 5 | 65.00 |
| Finite-horizon DCF | 65, 65 at 10%, terminal 0 | 112.81 |
| Conditional payoff | 0.6 x 100 + 0.4 x 0 at 10%, one period | 54.55 |
| Conditional payoff (obligation) | 0.4 x (-100) + 0.6 x 0 at 10%, one period | -36.36 |

Exception vectors (missing evidence, boundary change, internal transfer, shared right, expired or revoked evidence, unsupported extension) are described in the ERC Test Cases and exercised by the examples, the tests and the resolver.

## Worked examples

| Unit | File | Shows |
|---|---|---|
| 1 | `skill-multi-license.json` | asset vs usage rights vs revenue rights; three receipts for three interests |
| 2, 3 | `agent-subunit-a.json`, `agent-subunit-b.json` | sub-units sharing one skill license (share 1/2 each) |
| 4 | `swarm-unit.json` | a swarm as an economic Unit: containment of 2 and 3, external model license with payable, task obligation, chip profile; the shared skill is counted once |
| 5 | `task-conditional-settlement.json` | escrow as container, pledge, valve, conductor; bounty balance, fulfillment claim and buyer obligation valued separately |
| 6 | `contingent-obligation-unit.json` | no cash flow, contingent obligation; negative scenario value and an insufficient-evidence receipt |
| 7 | `agent-chip.json` | a running agent packaged as a chip with a financial-circuit model statement and the credit profile |

`node tools/resolve.js` resolves them offline; `node tools/resolve.js --rpc ... --registry ... --assertions ... --unit N` resolves a deployment.

## Position in the standards family

AUF is the economic base layer of the author's agent-economy proposals. It references, and is designed to bind to, ERC-8338 (token-bound executable skills), ERC-8414 (token-bound task tenders), ERC-8419 (Know-Your-Agent assertions), ERC-8434 (agent identity), ERC-8436 (collective decisions), ERC-8444 (ARD Onchain discovery) and ERC-8447 (swarms), as well as ERC-8004 agent identities. None of them is a normative dependency: the ERC text requires only ERC-165, EIP-712 and ERC-1271, and treats the family as descriptive bindings and profiles. A swarm describes a collaboration organization; a Unit describes an economic boundary, its roles and its measurement.

The role vocabulary and the financial-circuit analysis profile come from the author's 2022 article on financial circuits and Web3 tokenomics; see `docs/financial-circuit-profile.md`.

## Sepolia deployment

Prepared, not yet executed. The evidence run (`script/SepoliaEvidence.s.sol`, rehearsed end to end on a local chain: 39 transactions) deploys both registries, registers the four method descriptors and the seven example Units, records controller characterizations and signed third-party observations and receipts, and then demonstrates acknowledgments, supersession, revocation and a second version. Addresses, transactions and the resolver output will be recorded in `deployments/` and `docs/sepolia-evidence.md`.

## Next steps

1. Build the filing package and open the ethereum/ERCs pull request from a branch cut from upstream master (the Magicians thread is posted and `discussions-to` is set).
2. Run the Sepolia evidence phases and record the evidence.
3. Collect review feedback on the thread and iterate.

## License

CC0-1.0. See `LICENSE.md`.
