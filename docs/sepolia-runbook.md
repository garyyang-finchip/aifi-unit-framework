# Sepolia evidence runbook

The evidence run exercises the whole framework on Sepolia with the seven worked examples. It was rehearsed end to end on a local Anvil chain (39 transactions) and then executed on Sepolia (40 transactions; see `docs/sepolia-evidence.md`). Two keys take part:

- **Deployer / controller** (`PRIVATE_KEY`): deploys the registries, registers methods and Units, records controller characterizations, relays the evaluator's signed assertions, pays all gas.
- **Evaluator** (`EVALUATOR_PK`): a third party; signs observations and valuation receipts off chain (EIP-712), and revokes one receipt itself (the deployer sends it a little ETH first).

Prerequisites: Foundry, Node 22, `npm install`, a Sepolia RPC URL, the deployer funded with at least 0.05 Sepolia ETH.

```
export SEPOLIA_RPC_URL=...
export PRIVATE_KEY=0x...            # deployer
export EVALUATOR_PK=0x...           # evaluator (no ETH needed)
export DESCRIPTOR_BASE=https://raw.githubusercontent.com/garyyang-finchip/aifi-unit-framework/main/assets/erc-auf/
```

## Phase 1: deploy

```
forge script script/SepoliaEvidence.s.sol --sig "deployCore()" --rpc-url $SEPOLIA_RPC_URL --broadcast
```

Writes `deployments/sepolia.json` with both registry addresses. Gas limits must come from live estimates on Sepolia (its current schedule costs several times Anvil's).

## Phase 2: regenerate the examples with the real registry and controller

The example documents carry the registry address and the controller inside their subject and authorities. Regenerate them so that the hashes recorded on chain match the published files:

```
node tools/build-examples.js --registry <unitRegistry> --controller <deployer>
node tools/vectors.js
node tools/validate.js
```

Commit and push the regenerated `assets/erc-auf/examples` and `vectors` to the repository before phase 3, so that `DESCRIPTOR_BASE` resolves to the exact bytes whose hashes go on chain.

## Phase 3: register methods and Units

```
forge script script/SepoliaEvidence.s.sol --sig "registerAll()" --rpc-url $SEPOLIA_RPC_URL --broadcast
```

Registers the four method descriptors (write-once) and the first seven Units in planned order (ids 1..7; Unit 4 contains 2@1 and 3@1). Units 8 to 11 of the current examples (the overlap vector) were added after the recorded run; the script registers the first seven so that it stays a faithful record of that run.

## Phase 4: assertions

```
forge script script/SepoliaEvidence.s.sol --sig "assertAll()" --rpc-url $SEPOLIA_RPC_URL --broadcast
```

Controller characterizations for the seven Units (direct transactions by the deployer, `byController = true`); observations and valuation receipts signed by the evaluator and relayed through `assertStatementBySig` (`byController = false`).

## Phase 5: lifecycle

```
forge script script/SepoliaEvidence.s.sol --sig "lifecycle()" --rpc-url $SEPOLIA_RPC_URL --broadcast
```

Acknowledgments (participation and description endorsement for the swarm coordinator element), a superseding receipt, a revocation by the evaluator, and version 2 of Unit 1 (`skill-multi-license.v2.json`, one licensee added) showing that receipts of version 1 do not carry over.

## Verification and record

```
node tools/resolve.js --rpc $SEPOLIA_RPC_URL --registry <unitRegistry> --assertions <assertionRegistry> --unit 4
node tools/resolve.js --rpc $SEPOLIA_RPC_URL --registry <unitRegistry> --assertions <assertionRegistry> --unit 1 --version 2
```

Record in `docs/sepolia-evidence.md`: addresses, deployer and evaluator, transaction hashes per phase (from `broadcast/`), the resolver output for Units 1 (both versions) and 4, and source verification (Sourcify or Etherscan) of both registries. Keep `deployments/sepolia.json` and copy the broadcast run files into `deployments/sepolia/`.

## Alternative: sign from the rehearsal and relay

When the machine holding the keys has no Sepolia RPC access, the run can be executed exactly as the recorded one was (`docs/sepolia-evidence.md`):

1. Rehearse all four phases on Anvil started with `--chain-id 11155111`, the real deployer key at its Sepolia nonce (`anvil_setNonce`) and the real evaluator key, so that CREATE addresses, assertion ids and EIP-712 signatures match Sepolia. Serve the regenerated examples over HTTP for the rehearsal; on Sepolia the same files are served from the repository.
2. `PRIVATE_KEY=... EVALUATOR_PK=... node tools/sepolia/sign-plan.js --out plan.json --gas-mult 8 --gas-overrides overrides.json` turns the broadcast records into signed EIP-1559 transactions in order. Gas limits should come from live `eth_estimateGas` on Sepolia (`--gas-overrides` takes `{"<index>": <limit>}`); a multiple of the Anvil figure is not a safe substitute.
3. Any JSON-RPC relay sends `transactions[i].raw` in order with `eth_sendRawTransaction`, waits for each receipt and stops at the first failure. Re-signing one transaction with a higher limit keeps its nonce, so the rest of the plan stays valid.

No private key leaves the signing machine; the relay only ever sees signed bytes.
