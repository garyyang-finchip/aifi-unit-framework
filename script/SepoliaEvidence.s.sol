// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {AUFUnitRegistry} from "auf/AUFUnitRegistry.sol";
import {AUFAssertionRegistry} from "auf/AUFAssertionRegistry.sol";
import {UnitRef, AckKind, AssertionInput, AssertionKind, ValuationCore, ObservationCore} from "auf/AUFTypes.sol";

/// @notice Sepolia evidence run of the AIFi Unit Framework reference implementation.
///
/// Phases (each a separate `forge script --sig` invocation, state in deployments/sepolia.json):
///   1. deployCore()        deploy AUFUnitRegistry + AUFAssertionRegistry
///      -> regenerate the examples with the real registry and controller:
///         node tools/build-examples.js --registry <unitRegistry> --controller <deployer> --descriptor-base <raw-url-base>
///         node tools/vectors.js
///   2. registerAll()       register the four method descriptors and the first seven example Units in planned order
///                           (Units 8 to 11 of the examples were added after the recorded run and are not part of it)
///   3. assertAll()         controller characterizations (deployer) + third-party observations and valuations
///                          signed by EVALUATOR_PK and relayed by the deployer through assertStatementBySig
///   4. lifecycle()         acknowledgments, a superseding receipt, a revocation and a second version of Unit 1
///
/// Environment: PRIVATE_KEY (deployer / controller), EVALUATOR_PK (third-party evaluator, needs no ETH),
///              SEPOLIA_RPC_URL, optional DESCRIPTOR_BASE (URL prefix of the example files).
contract SepoliaEvidence is Script {
    string internal constant DEPLOYMENTS = "deployments/sepolia.json";
    string internal constant EXAMPLES = "assets/erc-auf/vectors/examples.json";
    string internal constant IDENTIFIERS = "assets/erc-auf/vectors/identifiers.json";

    function _deployments() internal view returns (string memory) {
        return vm.readFile(DEPLOYMENTS);
    }

    function _units() internal view returns (AUFUnitRegistry) {
        return AUFUnitRegistry(vm.parseJsonAddress(_deployments(), ".unitRegistry"));
    }

    function _assertions() internal view returns (AUFAssertionRegistry) {
        return AUFAssertionRegistry(vm.parseJsonAddress(_deployments(), ".assertionRegistry"));
    }

    function _base() internal view returns (string memory) {
        return vm.envOr("DESCRIPTOR_BASE", string("https://raw.githubusercontent.com/garyyang-finchip/aifi-unit-framework/main/assets/erc-auf/"));
    }

    // ------------------------------------------------------------------ phase 1

    function deployCore() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        AUFUnitRegistry units = new AUFUnitRegistry();
        AUFAssertionRegistry assertions = new AUFAssertionRegistry(units);
        vm.stopBroadcast();

        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "deployer", vm.addr(pk));
        vm.serializeAddress(obj, "unitRegistry", address(units));
        string memory out = vm.serializeAddress(obj, "assertionRegistry", address(assertions));
        vm.writeJson(out, DEPLOYMENTS);
        console2.log("AUFUnitRegistry", address(units));
        console2.log("AUFAssertionRegistry", address(assertions));
    }

    // ------------------------------------------------------------------ phase 2

    function registerAll() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        AUFUnitRegistry units = _units();
        AUFAssertionRegistry assertions = _assertions();
        string memory ids = vm.readFile(IDENTIFIERS);
        string memory ex = vm.readFile(EXAMPLES);
        string memory base = _base();

        vm.startBroadcast(pk);
        // method descriptors
        string[4] memory methodNames = ["auf:method:net-equity@1", "auf:method:realized-net-cash-flow@1", "auf:method:finite-horizon-dcf@1", "auf:method:conditional-payoff@1"];
        for (uint256 i = 0; i < 4; i++) {
            string memory key = string.concat(".methodIds[\"", methodNames[i], "\"]");
            bytes32 methodId = vm.parseJsonBytes32(ids, string.concat(key, ".methodId"));
            string memory file = vm.parseJsonString(ids, string.concat(key, ".file"));
            assertions.registerDescriptor(methodId, keccak256("auf:method"), string.concat(base, "vectors/", file));
        }
        // units in planned order
        for (uint256 i = 0; i < 7; i++) {
            _registerUnit(units, ex, i, base, vm.addr(pk));
        }
        vm.stopBroadcast();
        console2.log("registered 4 methods and 7 units");
    }

    function _registerUnit(AUFUnitRegistry units, string memory ex, uint256 i, string memory base, address controller)
        internal
    {
        string memory u = string.concat(".units[", vm.toString(i), "]");
        uint256 planned = vm.parseJsonUint(ex, string.concat(u, ".unitId"));
        bytes32 h = vm.parseJsonBytes32(ex, string.concat(u, ".boundaryHash"));
        string memory uri = string.concat(base, vm.parseJsonString(ex, string.concat(u, ".file")));
        UnitRef[] memory refs;
        if (planned == 4) {
            refs = new UnitRef[](2);
            refs[0] = UnitRef(2, 1);
            refs[1] = UnitRef(3, 1);
        }
        uint256 id = units.registerUnit(controller, h, uri, refs);
        require(id == planned, "unexpected unitId");
    }

    // ------------------------------------------------------------------ phase 3

    function assertAll() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 evaluatorPk = vm.envUint("EVALUATOR_PK");
        AUFAssertionRegistry assertions = _assertions();
        string memory ex = vm.readFile(EXAMPLES);
        string memory base = _base();

        vm.startBroadcast(pk);
        for (uint256 i = 0; i < 7; i++) {
            string memory u = string.concat(".units[", vm.toString(i), "]");
            uint256 unitId = vm.parseJsonUint(ex, string.concat(u, ".unitId"));
            uint256 n = _count(ex, string.concat(u, ".companions"));
            for (uint256 c = 0; c < n; c++) {
                string memory k = string.concat(u, ".companions[", vm.toString(c), "]");
                AssertionInput memory a = _input(ex, k, unitId, base);
                if (a.kind == AssertionKind.Characterization) {
                    assertions.assertStatement(a); // controller assertion
                } else {
                    _relay(assertions, a, evaluatorPk); // third-party assertion, signed by the evaluator
                }
            }
        }
        vm.stopBroadcast();
        console2.log("asserted all companions");
    }

    // ------------------------------------------------------------------ phase 4

    function lifecycle() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 evaluatorPk = vm.envUint("EVALUATOR_PK");
        AUFUnitRegistry units = _units();
        AUFAssertionRegistry assertions = _assertions();
        string memory ex = vm.readFile(EXAMPLES);
        string memory base = _base();
        address evaluator = vm.addr(evaluatorPk);

        vm.startBroadcast(pk);
        // the evaluator revokes one assertion itself below, so it needs a little gas
        if (evaluator.balance < 0.002 ether) payable(evaluator).transfer(0.003 ether);
        // acknowledgments by the controller for the coordinator element of the swarm (unit 4)
        bytes32 coordinator = keccak256(abi.encodePacked("agent", ":", "eip155:11155111:0x00000000000000000000000000000000000000a3"));
        units.acknowledge(4, 1, coordinator, AckKind.Participation);
        units.acknowledge(4, 1, coordinator, AckKind.DescriptionEndorsement);

        // the evaluator re-issues its first valuation receipt of unit 1 (the realized-net-cash-flow receipt,
        // companion index 2) as a superseding assertion, signed off chain and relayed by the deployer
        bytes32 first = _findValuation(assertions, 1, 1, evaluator, 0);
        AssertionInput memory again = _input(ex, ".units[0].companions[2]", 1, base);
        again.supersedes = first;
        _relay(assertions, again, evaluatorPk);
        vm.stopBroadcast();

        // the evaluator revokes its second valuation receipt of unit 1 (the net-equity receipt) itself
        vm.startBroadcast(evaluatorPk);
        bytes32 second = _findValuation(assertions, 1, 1, evaluator, 1);
        assertions.revoke(second);
        vm.stopBroadcast();

        // a second version of unit 1 (one element added): receipts of version 1 do not carry over
        vm.startBroadcast(pk);
        UnitRef[] memory none;
        units.publishVersion(
            1,
            vm.parseJsonBytes32(ex, ".units[0].v2.boundaryHash"),
            string.concat(base, vm.parseJsonString(ex, ".units[0].v2.file")),
            none
        );
        vm.stopBroadcast();
        console2.log("lifecycle done: acks, supersession, revocation, version 2 of unit 1");
    }

    // ------------------------------------------------------------------ helpers

    function _count(string memory json, string memory key) internal view returns (uint256 n) {
        // count array entries by probing indices
        while (vm.keyExistsJson(json, string.concat(key, "[", vm.toString(n), "]"))) n++;
    }

    function _input(string memory ex, string memory k, uint256 unitId, string memory base)
        internal
        pure
        returns (AssertionInput memory a)
    {
        string memory kind = vm.parseJsonString(ex, string.concat(k, ".kind"));
        a.unitId = unitId;
        a.version = 1;
        a.contentHash = vm.parseJsonBytes32(ex, string.concat(k, ".contentHash"));
        a.contentURI = string.concat(base, "examples/", vm.parseJsonString(ex, string.concat(k, ".file")));
        string memory profile = vm.parseJsonString(ex, string.concat(k, ".profile"));
        if (keccak256(bytes(kind)) == keccak256("characterization")) {
            a.kind = AssertionKind.Characterization;
            a.profileId = keccak256(bytes(profile));
        } else if (keccak256(bytes(kind)) == keccak256("observation")) {
            a.kind = AssertionKind.Observation;
            a.profileId = keccak256(bytes(profile));
            ObservationCore memory o = ObservationCore({
                snapshotHash: vm.parseJsonBytes32(ex, string.concat(k, ".core.snapshotHash")),
                windowStart: uint64(vm.parseJsonUint(ex, string.concat(k, ".core.windowStart"))),
                windowEnd: uint64(vm.parseJsonUint(ex, string.concat(k, ".core.windowEnd")))
            });
            a.payload = abi.encode(o);
        } else {
            a.kind = AssertionKind.Valuation;
            ValuationCore memory v = ValuationCore({
                methodId: vm.parseJsonBytes32(ex, string.concat(k, ".core.methodId")),
                interestId: vm.parseJsonBytes32(ex, string.concat(k, ".core.interestId")),
                assessmentBoundaryHash: vm.parseJsonBytes32(ex, string.concat(k, ".core.assessmentBoundaryHash")),
                snapshotHash: vm.parseJsonBytes32(ex, string.concat(k, ".core.snapshotHash")),
                resultKind: uint8(vm.parseJsonUint(ex, string.concat(k, ".core.resultKind"))),
                decimals: uint8(vm.parseJsonUint(ex, string.concat(k, ".core.decimals"))),
                value: vm.parseJsonInt(ex, string.concat(k, ".core.value")),
                denominationId: vm.parseJsonBytes32(ex, string.concat(k, ".core.denominationId")),
                asOf: uint64(vm.parseJsonUint(ex, string.concat(k, ".core.asOf"))),
                horizonEnd: uint64(vm.parseJsonUint(ex, string.concat(k, ".core.horizonEnd")))
            });
            a.profileId = v.methodId;
            a.payload = abi.encode(v);
        }
    }

    function _relay(AUFAssertionRegistry assertions, AssertionInput memory a, uint256 signerPk) internal {
        address signer = vm.addr(signerPk);
        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = assertions.hashAssertion(a, assertions.nonces(signer), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        assertions.assertStatementBySig(a, signer, deadline, abi.encodePacked(r, s, v));
    }

    function _findValuation(AUFAssertionRegistry assertions, uint256 unitId, uint32 version, address asserter, uint256 skip)
        internal
        view
        returns (bytes32)
    {
        uint256 n = assertions.assertionCount(unitId, version);
        uint256 seen;
        for (uint256 i = 0; i < n; i++) {
            bytes32 id = assertions.assertionAt(unitId, version, i);
            if (assertions.assertionOf(id).asserter == asserter && assertions.assertionOf(id).kind == AssertionKind.Valuation) {
                if (seen == skip) return id;
                seen++;
            }
        }
        revert("valuation not found");
    }
}
