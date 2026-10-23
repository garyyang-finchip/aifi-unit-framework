# Sepolia evidence record

The four-phase evidence run of the AIFi Unit Framework was executed on Sepolia (chain id 11155111) on 21 October 2026 (UTC), blocks 11964286 to 11964613, with the seven worked examples. Every transaction of the plan succeeded. The machine-readable record is `deployments/sepolia.json` (all transactions) and `deployments/sepolia/state.json` (the registry state decoded after the run); the published descriptors are under `deployments/sepolia/`.

## Contracts

| Contract | Address | Deployment | Source verification |
|---|---|---|---|
| `AUFUnitRegistry` | `0xE4EcAf6f87A700962f33AAa1A8f4B8e02FA180f8` | tx `0x760e1f501471ebbbacab02666d7863af92c61c7141424ca4dcac6435892f4db6`, block 11964286 | Sourcify match (runtime and creation): https://repo.sourcify.dev/11155111/0xE4EcAf6f87A700962f33AAa1A8f4B8e02FA180f8 |
| `AUFAssertionRegistry` | `0xC4f30AfAFFC9E5a7bDEd58c411B87ABe3FBbEd00` | tx `0xed6737cabaab087b71ba4d8a9ca7294e2c4fcf62316f225bdfef6625aad2b97f`, block 11964298 | Sourcify match (runtime and creation): https://repo.sourcify.dev/11155111/0xC4f30AfAFFC9E5a7bDEd58c411B87ABe3FBbEd00 |

Compiler: solc 0.8.30+commit.73712a01, optimizer 200 runs, EVM version cancun, `bytecodeHash = none`, sources exactly as in `assets/erc-auf/contracts/`. The assertion registry is bound to the unit registry (`unitRegistry()` returns it); its EIP-712 domain separator is `0x6eeb0ada6dc2071384062d13dca835304b57fbee9b0768554a8c195544e1441e` (name `AUFAssertionRegistry`, version `1`). Sourcify forwarded both verifications to Blockscout and Routescan; Etherscan's daily submission limit was reached on Sourcify's side at the time, so the Etherscan "verified" badge may be added later from the same sources.

Explorer links: https://sepolia.etherscan.io/address/0xE4EcAf6f87A700962f33AAa1A8f4B8e02FA180f8 and https://sepolia.etherscan.io/address/0xC4f30AfAFFC9E5a7bDEd58c411B87ABe3FBbEd00.

## Accounts

| Role | Address |
|---|---|
| Deployer and Definition Controller of all seven Units; pays gas; relays the evaluator's signed statements | `0xb5CC58b287D6553a11F6E5F87f858a4ccF785b26` |
| Evaluator (third party): signs observations and valuation receipts under EIP-712, revokes one receipt itself | `0xB4Af5c659BC10Cd0766CF0508b1f1Db34236c5E5` |

Both keys were generated for this run and hold Sepolia test ETH only.

## Phases

| Phase | Transactions | Blocks | What |
|---|---|---|---|
| deploy | 2 | 11964286, 11964298 | both registries |
| register | 11 | 11964321 to 11964339 | 4 method descriptors (net equity, realized net cash flow, finite-horizon DCF, conditional payoff), 7 Units (the swarm Unit 4 contains Units 2 and 3 at version 1) |
| assert | 21 | 11964535 to 11964581 | 7 controller characterizations (`assertStatement`), 3 observations and 11 valuation receipts signed by the evaluator and relayed by the deployer (`assertStatementBySig`) |
| lifecycle | 6 | 11964608 to 11964613 | 0.003 ETH to the evaluator; two acknowledgments (participation, description endorsement) of the coordinator element of Unit 4; a superseding receipt for the first realized-net-cash-flow receipt of Unit 1; revocation of the net-equity receipt of Unit 1 by the evaluator from its own key; version 2 of Unit 1 |

40 transactions, 78,295,499 gas in total, at an effective price of about 0.1 gwei.

## Registry state after the run

Read back with `eth_call` at block 11964628 and compared field by field with `deployments/sepolia/vectors/examples.json` (boundary hashes, descriptor URIs, containment, content hashes, profile ids, valuation and observation cores, `byController` flags): every check passed. `deployments/sepolia/state.json` holds the decoded state.

| Unit | Name | Version | Boundary hash | Assertions |
|---|---|---|---|---|
| 1 | Summarizer Skill Business | 1 | `0x23fb803a842d4839137c8ac30df5b6a7fd65b738707b578d60336a56572a97f9` | 6: characterization; observation; realized-net-cash-flow receipt (superseded); net-equity receipt (revoked); revenue-right DCF receipt; superseding realized-net-cash-flow receipt |
| 1 | Summarizer Skill Business | 2 | `0x00df32a0a95943716d299bd6d28e6939bedae2b80f2a3728745e2b33f997e133` | 0 |
| 2 | Agent A sub-unit | 1 | `0x0bb7be9ed144dd4a8aec9b71a3b2c3a3520bafdbd63cb214bcef91ca20f00b82` | 1 |
| 3 | Agent B sub-unit | 1 | `0x78f868f803945994d1d90387a33054b051a0b3b3e9e2c11da7e0f4512c601530` | 1 |
| 4 | Research Swarm Alpha (economic boundary), contains 2@1 and 3@1 | 1 | `0xa99a57686d65b075b76e1b0d9a33866a6f4545801b7425491444e9af3d2e2b53` | 3 |
| 5 | Task 17: translated corpus (conditional settlement) | 1 | `0x180a161873b49a0e49aeb207edfb2f659f9c33c22a6bea0201fb34897afcd312` | 4 (three receipts for three interests: position, fulfillment claim, obligation) |
| 6 | Performance guarantee for task 17 | 1 | `0x5c00d353a218fd49ae6c1e045df24f2048fbbd3416b81f1208af6d84de403c76` | 4 (negative conditional receipt and an insufficient-evidence receipt) |
| 7 | Agent OPC (one-person company) | 1 | `0x7d5667c7741640590c0b3ef8115e575923c9fbe67f5da841d1fec6eacaa8cd24` | 3 |

Lifecycle outcomes on Unit 1 version 1: assertion `0x45f8bf67616819cf9ce58ab31bfe4435228641e5b86fe53934604ac3bd8c5357` is `superseded` by `0x2450206ba91f75a41424ec79978db6ff01f628fa383bdb37c826703a04d1a1aa` (same asserter, same kind, same Unit); assertion `0x522fb2173ef9d1409ec5a0e43df6e00d5c1f661358048a23a11909ea774dc1f5` is `revoked`; the deployer's acknowledgments of element `0x4681400ed361b8de87b7db945dd639ba7f09e62caae7a6e1e23e18ccda7faeb5` of Unit 4 are recorded for kinds 1 and 4; asserter nonces are 7 (deployer) and 15 (evaluator).

## Transactions

| # | Phase | Call | Block | Gas used | Hash |
|---|---|---|---|---|---|
| 0 | deploy | CREATE AUFUnitRegistry | 11964286 | 6,950,325 | `0x760e1f501471ebbbacab02666d7863af92c61c7141424ca4dcac6435892f4db6` |
| 1 | deploy | CREATE AUFAssertionRegistry | 11964298 | 15,185,524 | `0xed6737cabaab087b71ba4d8a9ca7294e2c4fcf62316f225bdfef6625aad2b97f` |
| 2 | register | registerDescriptor net-equity | 11964321 | 904,666 | `0x5a36cfde3ff1f774b60a0d7217b0aa5d7b156920cab4846d5e0b0a211e031c0f` |
| 3 | register | registerDescriptor realized-net-cash-flow | 11964325 | 1,015,311 | `0x4a72aa37f70b95b0c9f7d285b94be81251257f1f5faf6801360218b48245d854` |
| 4 | register | registerDescriptor finite-horizon-dcf | 11964326 | 1,015,263 | `0x5bc7fb8f8c4cfd1a2a4fac7735ae2fa08016ba2ab004057b93fccb7133cb1082` |
| 5 | register | registerDescriptor conditional-payoff | 11964327 | 1,015,263 | `0x71d16b2d37334ff8ae5094120d70464ccff5961965c1997a88131b8d76b536cf` |
| 6 | register | registerUnit 1 | 11964333 | 1,130,229 | `0xd2f5d7bc6e177664a60ae78aae2dc60c72d6660512afe241ab52abb8084ff155` |
| 7 | register | registerUnit 2 | 11964334 | 921,507 | `0xa9bf83c0e6f7e95f31448c7770c4f6e78283249ee35b0242848247be302fcd12` |
| 8 | register | registerUnit 3 | 11964335 | 921,507 | `0xa9fafdf83253746836a29f39260efa377c56e1851f47c5f0042adcd3adac60a5` |
| 9 | register | registerUnit 4 (contains 2@1, 3@1) | 11964336 | 1,478,637 | `0x25cfb68477c9c58b5e696e379fa24eb94d2b169f592689f5ca4b3b5df791bce0` |
| 10 | register | registerUnit 5 | 11964337 | 1,032,405 | `0xfa5109ecfe54549ae2278683e44b23d90a784cc631ff509d0dec616137d1e8f5` |
| 11 | register | registerUnit 6 | 11964338 | 1,032,381 | `0x93a8df2d49c63360ba72517146792c5309e65483a1ea09c7d6b69ffa5e4dc11b` |
| 12 | register | registerUnit 7 | 11964339 | 921,447 | `0xd1b45431c0abc3e03dc3e3981a4ba21ec2bf4c840974f7eff8d0a1b45dde5644` |
| 13 | assert | characterization, Unit 1 | 11964535 | 1,581,764 | `0xf7587d860c7d85013f5f8df1ab0f1ea10e82f327051fcd9498b64e732d9758d6` |
| 14 | assert | observation (by signature), Unit 1 | 11964536 | 1,719,662 | `0xf570ca1b85651db10c7cd8654fb480728e9d254b61de1ce946bb4a689326d2d2` |
| 15 | assert | realized-net-cash-flow receipt (by signature), Unit 1 | 11964537 | 2,396,633 | `0xd7dc274e1a0dbe4a0e32d8d0dbfc175ff32e9b7d2ea7ca1d6b238d89752993fb` |
| 16 | assert | net-equity receipt (by signature), Unit 1 | 11964538 | 2,286,187 | `0xb8ce6f721fddf0b1a1accc0c5e369293e84c8e01ea95399f65637d28d8396f2f` |
| 17 | assert | revenue-right DCF receipt (by signature), Unit 1 | 11964539 | 2,286,311 | `0x18a6566e2fb37664f62bf1eee7d7cc025fd67b2b27b8a93e10abf475db82e45f` |
| 18 | assert | characterization, Unit 2 | 11964540 | 1,483,796 | `0x64d0d0c91be688dc9a3c4c704e1245b6e5e42e4c60320ad4e08d22858f76102a` |
| 19 | assert | characterization, Unit 3 | 11964541 | 1,483,796 | `0x26174f43d2f61291a56e14ba58f38ae5063b1a151e0ea700b23fd5d602ba960c` |
| 20 | assert | characterization, Unit 4 | 11964542 | 1,483,736 | `0xf8bfdca5abfa4a75b399b9daff17df35352367e8d3332c04b6af9b4d0883cb41` |
| 21 | assert | net-equity receipt (by signature), Unit 4 | 11964543 | 2,286,091 | `0x8c5d46178a693c2d3abd5c865d8792bfc7f8ef7cd35f8bb6068ada4171feeaa7` |
| 22 | assert | fulfillment-claim receipt (by signature), Unit 4 | 11964544 | 2,286,257 | `0x7ca6762687f767000027caaf9c1c2b90ad115bcb9e8e4660aa2c9dfa0c91f313` |
| 23 | assert | characterization, Unit 5 | 11964558 | 1,483,940 | `0xced5b31837b273f6edb60714d44562e7776281e0d5c6d613cb8f5145ea7fe314` |
| 24 | assert | position receipt (by signature), Unit 5 | 11964559 | 2,286,283 | `0x66f935915c493d04f81edd8f2583c0f79860d4aac32ecb1dfe5126561c18be74` |
| 25 | assert | fulfillment-claim receipt (by signature), Unit 5 | 11964560 | 2,396,635 | `0x381ec80db6397981f27e1e3b606a1c08c6c2e834997def1bf2f5f150d8c075b5` |
| 26 | assert | obligation receipt (by signature), Unit 5 | 11964561 | 2,286,701 | `0x7b1bb68de7a4dd326903b033ef59bca7ee3d77ec1b4d6b9a471282f4887a75cd` |
| 27 | assert | characterization, Unit 6 | 11964562 | 1,483,928 | `0x3f5348b27721016f3d3c5aa34ec56761314cf6663a1b06c72781d78c66e17f4d` |
| 28 | assert | observation (by signature), Unit 6 | 11964563 | 1,621,850 | `0xef7df54468763c709f5d121bbd8e2fef51c8f0a590d6476485cd63375a359af1` |
| 29 | assert | obligation receipt (by signature), Unit 6 | 11964564 | 2,286,645 | `0x7274cdc25611677a35654fe8b35683a32ea8ad13067db96fb595eb1f35c5d6bf` |
| 30 | assert | insufficient-evidence receipt (by signature), Unit 6 | 11964565 | 2,180,467 | `0x400f7ff449d37e4126774b29e1ef0793d49d2bc4f5872afac28fb911ca07ab45` |
| 31 | assert | characterization, Unit 7 | 11964579 | 1,483,736 | `0x9e7e0263a818bda5e0947292449fb2751b1f1da21e1a02bf90989a042bd4be4c` |
| 32 | assert | observation (by signature), Unit 7 | 11964580 | 1,621,678 | `0x9b435bd1635ed6ac9206feee2fd4d2f89dbf6b6c205a05fd237a2bdb2b478e43` |
| 33 | assert | whole-Unit DCF receipt (by signature), Unit 7 | 11964581 | 2,286,107 | `0x9a71cafa18d59a43300a6807a32ad9cce9ebd4e1701456a00824945e6e1c3b9a` |
| 34 | lifecycle | 0.003 ETH to the evaluator | 11964608 | 204,600 | `0x6f4e956acbcf45d8e611907dfa75cd7e401d5c7a79febaf2b8d415318850bef1` |
| 35 | lifecycle | acknowledge participation, Unit 4 | 11964609 | 134,106 | `0x9419c3edd015b0ed6523c0d0fc74dffb37612e335257596a8bc1a92056994095` |
| 36 | lifecycle | acknowledge description endorsement, Unit 4 | 11964610 | 134,106 | `0x13eb54e1848679ec80af7169f37d9e7888f3d3240ebc185958d83544820d3a9e` |
| 37 | lifecycle | superseding receipt (by signature), Unit 1 | 11964611 | 2,633,765 | `0xd10d7f3d8159d781290d3cce300379ec1b92a92425f225b4b2228031db37da69` |
| 38 | lifecycle | revoke, sent by the evaluator | 11964612 | 32,163 | `0xeaf3b424638e9b3dc3c2f2da81b9913564e0d85ba197dab5f1b95d5b195967ef` |
| 39 | lifecycle | publishVersion 2, Unit 1 | 11964613 | 920,091 | `0x56b5d09201a42093db77c8d95349d1acc3c47355e615ca0be91ef68ecb8c1024` |

One earlier transaction is not part of the plan: the first deployment attempt of `AUFUnitRegistry` (`0x000cd2a85e36cec897862ea76a6091dea21c3585b1b3625cbccf17462a462e45`, block 11964252, nonce 0) ran out of gas at 1,992,206, a limit of twice the Anvil rehearsal. It left no contract. The attempt is recorded in `deployments/sepolia.json` under `failedAttempt`.

## How the run was executed

The transactions were not sent by `forge script --broadcast` against Sepolia. The script was rehearsed on an Anvil chain with chain id 11155111, the real deployer key at nonce 1 and the real evaluator key, so that every CREATE address, assertion id and EIP-712 signature already matched Sepolia; `tools/sepolia/sign-plan.js` then turned the Foundry broadcast records into 40 signed EIP-1559 transactions (max fee 2 gwei, priority fee 0.1 gwei) and a plain JSON-RPC relay sent them in order, each one only after a live `eth_estimateGas` of the same call fit its signed gas limit and the previous receipt had status 1. Transaction 34 was re-signed once with a higher limit (320,000, same nonce) after the live estimate for a plain ETH transfer to a fresh account (207,391) exceeded the first limit. No private key left the signing machine.

Gas on Sepolia was four to seven times the Anvil figure for the same calls (for example, `registerUnit` 0.92 to 1.48 million against 0.22 to 0.33 million, a valuation receipt by signature 2.29 to 2.40 million against 0.40 to 0.52 million, a plain value transfer to a new account 204,600 against 21,000), which is why the runbook asks for live estimates rather than rehearsal multiples.

## Reproducing the checks

With any Sepolia RPC endpoint:

```
node tools/resolve.js --rpc $SEPOLIA_RPC_URL --registry 0xE4EcAf6f87A700962f33AAa1A8f4B8e02FA180f8 --assertions 0xC4f30AfAFFC9E5a7bDEd58c411B87ABe3FBbEd00 --unit 4
node tools/resolve.js --rpc $SEPOLIA_RPC_URL --registry 0xE4EcAf6f87A700962f33AAa1A8f4B8e02FA180f8 --assertions 0xC4f30AfAFFC9E5a7bDEd58c411B87ABe3FBbEd00 --unit 1 --version 2
```

The resolver fetches each descriptor from its on-chain URI (`https://raw.githubusercontent.com/garyyang-finchip/aifi-unit-framework/main/deployments/sepolia/...`), recomputes the canonical hash and compares it with the registered boundary hash or content hash, expands the containment of Unit 4 by pinned versions and lists every assertion with its status and core. The files under `deployments/sepolia/examples` and `deployments/sepolia/vectors` are the exact documents those URIs serve; `assets/erc-auf/examples` keeps the placeholder-registry versions used by the test suite and the ERC text.

The same descriptors can be resolved offline with `node tools/resolve.js --examples deployments/sepolia/examples --unit 1` (and `--unit 4`).

### What later revisions of the text say about this run

The run predates two revisions of the ERC text and is kept as recorded; the resolver applies the current rules to it:

- Dependent evidence (Section 10.6, revision of 2026-10-23): the receipts of Units 1, 6 and 7 rest on observations recorded on chain and cite them by content hash (`snapshot.hash` equals the observation's `contentHash`), so the resolver presents them with evidence status `supported`; no observation of the run has been revoked. Nothing in the run was re-issued.
- Additivity must be established (Sections 3.8 and 10.6, revision of 2026-10-24): the registered definitions of Units 1 and 4 carry no `distinct-claim` declaration, so the resolver reports their positions as unresolved pairs (ten in Unit 1, six in Unit 4) and reports a net-equity receipt that nets a treasury balance against a payable as a point value over an unresolved pair: offline, over the frozen descriptors, both net-equity receipts; on chain, only the active one of Unit 4, because Unit 1's was revoked in the lifecycle phase of the run and is presented as revoked. This is the rule working as intended on definitions written before it existed. The current worked examples carry one set-form `distinct-claim` declaration per definition; re-registering the two Units under new versions with that declaration, and re-issuing the two receipts, is a six-transaction follow-up that has not been run.
