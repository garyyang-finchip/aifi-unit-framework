# AIFi Unit Framework (AUF)

Reference repository of **ERC-8454: AIFi Unit Framework** (Draft): a registry and descriptor model through which any economic object in an AI-driven economy (a running agent, a static skill, a task with escrowed funds, a model license, a compute quota, a data right, a capital position, or any composition of these, including agent swarms) is named, bounded, described, observed, classified and valued as one whole.

Status: Draft, number ERC-8454 assigned on ethereum/ERCs pull request #2095 (editor review pending). Discussion thread: https://ethereum-magicians.org/t/erc-8454-aifi-unit-framework/30040. Reference implementation, schemas, vectors and worked examples are complete; the Sepolia evidence run is executed and recorded (see below).

## What it is

The framework fixes three things and leaves the fourth open:

1. **Boundary.** A Unit is a versioned Unit Definition: elements (agent, skill, task, service, model, compute, data, financial-position, nested unit), typed relations with the rights and obligations under which each element is included (owns, licenses, reserves, revenue-share, holds, owes, commits, pledges, depends-on, exchanges, controls, contains), economic interfaces (ports), authorities and validity. Positions declare what they are a claim against (`underlying`), and `same-claim` / `distinct-claim` declarations with a basis (pairwise or as a set) tell resolvers when two references are one entitlement and when two positions are distinct claims; every pair of positions that is neither is an unresolved pair, reported and admitting no point value, because the absence of a detected overlap does not establish distinctness. Each version is committed on chain by `boundaryHash = keccak256(JCS(definition))`.
2. **Characterization.** Stackable economic roles (source, sink, conductor, damping, container, pledge, valve, control) attributed to the Unit, a port or an element under stated conditions; behavior attributes (linearity, determinism, time variance, memory) declared separately; behavior models (the financial-circuit analysis profile among them); structure profiles (simple, composite, chip); application profiles (credit); explicit knowledge states (classified, unclassified, insufficient-evidence, not-applicable).
3. **Measurement and valuation statements.** Observation records (per-asset stocks, port transfers, minting, burning, adjustments, non-cash changes, coverage; missing is never zero; reconciliation exact on the decimal strings) and valuation receipts (subject version, assessment boundary, interest and perspective, snapshot with the observations it cites, content-addressed method, inputs incl. the treatment of every claim group and overlap candidate, typed result incl. negative, interval, scenario, score, grade and "cannot value"). Resolvers present every receipt with the status of its cited evidence; a receipt whose observation was revoked is shown as resting on withdrawn evidence and is not presented as current.
4. **Open:** the valuation functions, behavior models and credit models themselves. Methods are content-addressed descriptors; any evaluator can plug in any method while every reader still understands what a figure refers to.

Two small registries carry it on chain: `AUFUnitRegistry` (units, versions, containment of pinned versions, definition control, typed acknowledgments) and `AUFAssertionRegistry` (one assertion envelope for characterizations, observations, valuations and extensions, with validity, revocation, supersession, EIP-712/ERC-1271 signed assertions, and content-addressed descriptors).

## Repository

```
ERCS/erc-auf.md                      ERC-8454 text (source; the filing package names it erc-8454.md)
assets/erc-auf/
  contracts/                         AUFUnitRegistry, AUFAssertionRegistry, AUFTypes, AUFErrors,
                                     interfaces/, libraries/AUFValuationLib
  schemas/                           JSON Schemas (unit definition, characterization, observation,
                                     method descriptor, profile descriptor, valuation receipt, common)
  vectors/                           interface ids, identifiers, canonicalization, valuation vectors,
                                     EIP-712 vector, example hashes, methods/ (4 method descriptors)
  examples/                          13 worked Units with characterizations, observations and receipts
test/                                Foundry suite (58 tests) incl. ethers <-> solc vector cross-checks
tools/                               build-examples.js, vectors.js, validate.js, resolve.js, lint-erc.js,
                                     lib/ (canonicalization, exact decimals), test/ (node --test suites)
script/SepoliaEvidence.s.sol         four-phase evidence run (deploy, register, assert, lifecycle)
tools/sepolia/sign-plan.js           turns the rehearsal's broadcast records into signed transactions for a relay
deployments/                         sepolia.json (run record), sepolia/ (published descriptors, decoded state)
scripts/make-filing-package.py       builds ercs-pr-package/ for the ethereum/ERCs pull request
docs/                                design memo, financial-circuit profile, Magicians post, test record,
                                     Sepolia runbook and evidence record
```

## Build and test

```
npm install
forge build
forge test
npm run check          # rebuild examples, regenerate vectors, validate schemas, run the resolver and tool tests
npm run test:tools     # exact-decimal observation regressions, including the validator and resolver CLIs
npm run lint:erc       # eipw lint of the ERC text (spelling findings are listed, not gating)
python3 scripts/make-filing-package.py --number 8454
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

Exception vectors (missing evidence, boundary change, internal transfer, shared right, expired or revoked evidence, unsupported extension, overlap under different references, withdrawn evidence, additivity must be established) are described in the ERC Test Cases and exercised by the examples, the tests and the resolver; `tools/test/resolve-evidence.test.js` prints the expected resolver output for `O -> V -> revoke(O)`, and `tools/test/resolve-claims.test.js` covers claim groups, unresolved pairs, declared distinctness, its confirmation and the rejection of a point value over an unresolved pair.

## Worked examples

| Unit | File | Shows |
|---|---|---|
| 1 | `skill-multi-license.json` | asset vs usage rights vs revenue rights; three receipts for three interests |
| 2, 3 | `agent-subunit-a.json`, `agent-subunit-b.json` | sub-units sharing one skill license (share 1/2 each) |
| 4 | `swarm-unit.json` | a swarm as an economic Unit: containment of 2 and 3, external model license with payable, task obligation, chip profile; the shared skill is counted once; one set-form `distinct-claim` covers its four positions |
| 5 | `task-conditional-settlement.json` | escrow as container, pledge, valve, conductor; bounty balance, fulfillment claim and buyer obligation valued separately |
| 6 | `contingent-obligation-unit.json` | no cash flow, contingent obligation; negative scenario value and an insufficient-evidence receipt |
| 7 | `agent-chip.json` | a running agent packaged as a chip with a financial-circuit model statement and the credit profile |
| 8, 9 | `revenue-right-token.json`, `revenue-right-contract.json` | one 40% revenue entitlement held as a token position and as a contractual right: different element ids, same `underlying` |
| 10 | `revenue-holdings-declared.json` | a fund holding both, declaring `same-claim` with a basis; net equity 45.12 (counted once) |
| 11 | `revenue-holdings-undeclared.json` | an analyst's composite of both with no declaration: unresolved pair that is also an overlap candidate; interval 45.12 to 90.24 or insufficient evidence, never a point value |
| 12 | `revenue-holdings-silent.json` | the same two holdings with no `underlying` on one side and an aliased URI on the other: no overlap detected, pair unresolved all the same; interval or insufficient evidence |
| 13 | `revenue-holdings-distinct.json` | two tranches of 40% on the same underlying, declared distinct with both agreements as basis: net equity 90.24 (counted separately), reported as distinct (claimed) |

`node tools/resolve.js` resolves them offline (claim groups, declared-distinct pairs with their confirmation, unresolved pairs, receipt checks); `node tools/resolve.js --rpc ... --registry ... --assertions ... --unit N` resolves a deployment, listing every assertion with its status and every receipt with the evidence status of the observations it cites; `--examples <dir>` resolves another set of descriptors offline, for example the frozen ones of the Sepolia run.

## Position in the standards family

AUF is the economic base layer of the author's agent-economy proposals. It references, and is designed to bind to, ERC-8338 (token-bound executable skills), ERC-8414 (token-bound task tenders), ERC-8419 (Know-Your-Agent assertions), ERC-8434 (agent identity), ERC-8436 (collective decisions), ERC-8444 (ARD Onchain discovery) and ERC-8447 (swarms), as well as ERC-8004 agent identities. None of them is a normative dependency: the ERC text requires only ERC-165, EIP-712 and ERC-1271, and treats the family as descriptive bindings and profiles. A swarm describes a collaboration organization; a Unit describes an economic boundary, its roles and its measurement.

The role vocabulary and the financial-circuit analysis profile come from the author's 2022 article on financial circuits and Web3 tokenomics; see `docs/financial-circuit-profile.md`.

## Sepolia deployment

Executed on 21 October 2026 (blocks 11964286 to 11964613, 40 transactions, all successful). The evidence run (`script/SepoliaEvidence.s.sol`) deploys both registries, registers the four method descriptors and the first seven example Units as they were then (Units 8 to 13 were added by later revisions, and Units 1 and 4 have since gained their `distinct-claim` declarations; the run is kept as recorded and `docs/sepolia-evidence.md` states how the current rules read it), records controller characterizations and signed third-party observations and receipts, and then demonstrates acknowledgments, supersession, revocation and a second version.

| Contract | Sepolia address | Source |
|---|---|---|
| `AUFUnitRegistry` | `0xE4EcAf6f87A700962f33AAa1A8f4B8e02FA180f8` | [Sourcify](https://repo.sourcify.dev/11155111/0xE4EcAf6f87A700962f33AAa1A8f4B8e02FA180f8), [Etherscan](https://sepolia.etherscan.io/address/0xE4EcAf6f87A700962f33AAa1A8f4B8e02FA180f8) |
| `AUFAssertionRegistry` | `0xC4f30AfAFFC9E5a7bDEd58c411B87ABe3FBbEd00` | [Sourcify](https://repo.sourcify.dev/11155111/0xC4f30AfAFFC9E5a7bDEd58c411B87ABe3FBbEd00), [Etherscan](https://sepolia.etherscan.io/address/0xC4f30AfAFFC9E5a7bDEd58c411B87ABe3FBbEd00) |

The full record (every transaction, the decoded registry state, the descriptors the on-chain URIs point to) is in `docs/sepolia-evidence.md`, `deployments/sepolia.json` and `deployments/sepolia/`. Unit 4 (the swarm) can be resolved from the chain with `node tools/resolve.js --rpc <sepolia rpc> --registry 0xE4EcAf6f87A700962f33AAa1A8f4B8e02FA180f8 --assertions 0xC4f30AfAFFC9E5a7bDEd58c411B87ABe3FBbEd00 --unit 4`.

## Next steps

1. Collect review feedback on the Magicians thread and the pull request and iterate.
2. Keep the pull request branch in step with this repository: after any change to `ERCS/erc-auf.md` or `assets/erc-auf/`, rebuild the filing package with `scripts/make-filing-package.py` (number 8454) and upload it to the branch.

## License

CC0-1.0. See `LICENSE.md`.
