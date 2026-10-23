# Test record - v0.1 (2026-10-21), updated for the overlap revision and the dependent-evidence revision (2026-10-23)

Toolchain: Foundry 1.7.1 (forge, anvil, cast), solc 0.8.30, evm cancun, optimizer 200 runs, forge-std 1.9.7 (vendored), Node 22, ethers 6.17, canonicalize (RFC 8785), ajv 8 (JSON Schema 2020-12), eipw-lint-js 0.11.0.

## Contracts

| Contract | Runtime size | Notes |
|---|---|---|
| AUFUnitRegistry | 4,360 B | units, versions, containment, control, acknowledgments |
| AUFAssertionRegistry | 9,683 B | envelope, cores, descriptors, EIP-712 / ERC-1271, supersession, revocation |

## Foundry suite: 58 tests, 0 failures

`test/AUFUnitRegistry.t.sol` (18): registration and sequential ids, zero-hash revert, versions by controller only, immutability of earlier versions, unknown unit and version reverts, controller change and freezing (including registering frozen), containment of existing versions, pinning (parent unchanged when child publishes), missing unit and missing version reverts, self-containment reverts (existing and newly registered Unit), acyclicity by construction, acknowledgments per kind and per version, acknowledgment validations, ERC-165.

`test/AUFAssertionRegistry.t.sol` (20): descriptor write-once and lookups, controller vs third-party assertions and `byController` frozen at recording time, invalid subjects and envelopes, valuation core storage and events, negative monetary values, valuation validations (result kind range, method mismatch, value not allowed for non-value kinds, payload length), core getters for wrong kinds, observation core and window validation, revoke rules, supersession and its mismatches (other asserter, kind, unit, unknown, not active), EIP-712 signatures by EOA (replay rejected), expired deadline, wrong nonce, wrong signer, malformed signature, ERC-1271 wallet accepted and stranger wallet rejected, domain separator, ERC-165, and the registry side of exception vector 8 (`testRevokedObservationLeavesDependentReceiptActive`: an observer records O, an evaluator records receipt V citing O, the observer revokes O; O is revoked, V stays active, the assertion count is unchanged, the observer's `revoke(V)` reverts with `AUF_NotAsserter`, the evaluator supersedes V with an `insufficient-evidence` receipt).

`test/AUFValuationLib.t.sol` (9): the four vectors (70, 65, 112.81, 54.55) with two-decimal rounding, negative net equity, terminal value discounting, empty-input reverts, probability normalization and length checks, undiscounted obligation.

`test/Vectors.t.sol` (11): interface ids against `type(I).interfaceId`, profile/interest/denomination/descriptor-kind identifiers, element id, canonicalization vector (exact canonical string and hash), bit-exact fixed-point agreement with the JavaScript reference for all five valuation vectors, EIP-712 type hash and struct hash against ethers' `TypedDataEncoder`, example signature recovery, registration of the eleven example Units in planned order with containment (Units 4, 10 and 11 contain two Units each), and the boundary-change exception vector (a receipt for version 1 is not listed under version 2).

## Node tools

- `tools/validate.js`: 44 documents (12 unit definitions incl. the v2 of Unit 1, 11 characterizations, 3 observations, 14 valuation receipts, 4 method descriptors) validate against the schemas with 0 failures; structural checks (element id uniqueness, relation endpoints, identity relations with basis, port ids, role scopes, observation reconciliation and transfer sums, subject hashes, assessment boundary deltas, value-less result kinds, no point value with an unresolved overlap) pass.
- `tools/resolve.js` (offline): all eleven Units verified; the swarm's containment tree expands to the two sub-units and the shared skill license (share 1/2 in each sub-unit) is reported as one claim group (same element id) to count once at the parent; Unit 10 reports the declared claim group of the token and contractual positions (same-claim, basis stated); Unit 11 reports the unresolved overlap (same underlying, no declaration) and the resolver rejects a point-valued receipt over it (negative test, exit code 1).
- `tools/resolve.js` (dependent evidence, Section 10.6): in chain mode every receipt is presented with an evidence status (`supported`, `expired`, `unresolved`, `superseded`, `withdrawn`, `not-cited`) computed from the status and validity window of each observation it cites, by assertion id in `snapshot.observations` or by content hash (`snapshot.hash` equal to a sibling observation's `contentHash`); a receipt on withdrawn evidence is not presented as current while its own status is left unchanged. Offline, where there is no registry state, the resolver reports which observation record the snapshot rests on by content hash.
- `tools/test` (`npm run test:tools`, `node --test`): 14 tests, 0 failures. `observation.test.js` (11): exact decimal reconciliation (`tools/lib/decimal.js`, contributed in pull request #1 of the repository) with the validator and resolver CLIs run against temporary fixtures: an unexplained one-unit difference at 18 decimals, a one-unit difference above `Number.MAX_SAFE_INTEGER` and a difference at 21 decimals are rejected; mixed-precision balances and transfer totals that per-term rounding breaks are accepted; signed adjustments reconcile exactly; missing members stay unknown; representations outside `decimalString` are reported, not accepted. `resolve-evidence.test.js` (3): exception vector 8 against an in-memory registry (O -> V -> revoke(O): V active, evidence `withdrawn`, not current; V2 citing an observation whose window ended after the as-of time: evidence `supported`, current), citation by content hash alone, and the `expired`, `superseded` and `unresolved` statuses with their ranking.
- `tools/resolve.js` (on-chain, against the Anvil rehearsal): definitions fetched over HTTP and verified; assertions listed with status (active, superseded, revoked), `byController` flag and valuation cores; version 2 of Unit 1 verified separately with no receipts of version 1.
- `tools/lint-erc.js`: eipw 0.11.0 reports 0 errors on the ERC text (file name and asset links rewritten as in the filing package; the spelling lint is listed for review only and flags only domain terms: AIFi, AUF, canonicalization, memristive, counterparty, asserter, ...).
- `scripts/make-filing-package.py --number 9999`: 54 files, local lints clean (rebuilt as `--number 8454` with the new discussions-to on 2026-10-22 after the number was assigned; 65 files since the overlap revision; eipw 0 errors on every rebuild).

## Anvil rehearsal of the Sepolia evidence script

Chain id 11155111 on Anvil, descriptors served from a local HTTP server so that hashes verify:

| Phase | Transactions |
|---|---|
| deployCore | 2 |
| registerAll | 11 (4 descriptors, 7 units) |
| assertAll | 21 (7 controller characterizations, 3 observations and 11 receipts relayed by signature) |
| lifecycle | 5 (2 acknowledgments, superseding receipt, revocation by the evaluator, version 2 of Unit 1; on Anvil the pre-funded evaluator needed no gas transfer, on Sepolia one more transaction funds it) |

Total 39 transactions; all phases "ONCHAIN EXECUTION COMPLETE & SUCCESSFUL"; resolver output as described above.

## Sepolia evidence run (2026-10-21)

Executed on Sepolia with the plan signed from the rehearsal (`tools/sepolia/sign-plan.js`) and relayed one transaction at a time with live gas estimates: 40 transactions (2 deploy, 11 register, 21 assert, 6 lifecycle including the gas transfer to the evaluator), blocks 11964286 to 11964613, every receipt status 1, 78,295,499 gas in total. Both registries are source-verified on Sourcify (runtime and creation match). The registry state read back at block 11964628 matches `deployments/sepolia/vectors/examples.json` on every field checked (7 Units, 8 versions, containment of Unit 4, 22 assertions with their cores, 4 descriptors, 2 acknowledgments, supersession and revocation on Unit 1, asserter nonces 7 and 15). Details in `docs/sepolia-evidence.md`; record in `deployments/sepolia.json` and `deployments/sepolia/state.json`.

Observed gas on Sepolia against the Anvil rehearsal: deployments 6.95 M and 15.19 M (Anvil 1.0 M and 2.0 M); `registerDescriptor` 0.90 to 1.02 M (0.21 to 0.26 M); `registerUnit` 0.92 to 1.48 M (0.22 to 0.33 M); characterization 1.48 to 1.58 M (0.34 to 0.54 M); observation by signature 1.62 to 1.72 M (0.34 M); valuation receipt by signature 2.18 to 2.63 M (0.38 to 0.59 M); acknowledgment 134 k (52 k); revoke 32 k (31 k); plain value transfer to a new account 205 k (21 k). The first deployment attempt with twice the Anvil figure ran out of gas; all later limits came from live estimates.
