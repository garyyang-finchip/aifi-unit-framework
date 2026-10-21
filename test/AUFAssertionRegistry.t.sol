// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {AUFUnitRegistry} from "auf/AUFUnitRegistry.sol";
import {AUFAssertionRegistry} from "auf/AUFAssertionRegistry.sol";
import {IAUFAssertionRegistry} from "auf/interfaces/IAUFAssertionRegistry.sol";
import {
    UnitRef,
    AssertionInput,
    Assertion,
    AssertionKind,
    AssertionStatus,
    ValuationCore,
    ObservationCore,
    AUFResultKind
} from "auf/AUFTypes.sol";
import "auf/AUFErrors.sol";
import {ERC1271Wallet} from "./mocks/ERC1271Wallet.sol";

contract AUFAssertionRegistryTest is Test {
    AUFUnitRegistry internal units;
    AUFAssertionRegistry internal reg;

    address internal controller = makeAddr("controller");
    address internal evaluator = makeAddr("evaluator");
    address internal other = makeAddr("other");
    uint256 internal signerPk = 0xA11CE;
    address internal signer;

    bytes32 internal constant CONTENT = keccak256("content");
    bytes32 internal constant CHAR_PROFILE = keccak256("auf:characterization:v1@1");
    bytes32 internal constant OBS_PROFILE = keccak256("auf:observation:v1@1");
    bytes32 internal constant METHOD = keccak256("method-descriptor");
    bytes32 internal constant INTEREST = keccak256("auf:interest:net-equity@1");
    bytes32 internal constant USD = keccak256("USD");

    UnitRef[] internal none;

    function setUp() public {
        units = new AUFUnitRegistry();
        reg = new AUFAssertionRegistry(units);
        signer = vm.addr(signerPk);
        units.registerUnit(controller, keccak256("def-1"), "ipfs://def-1", none); // unit 1 v1
        vm.prank(controller);
        units.publishVersion(1, keccak256("def-2"), "ipfs://def-2", none); // unit 1 v2
        units.registerUnit(address(0), keccak256("def-3"), "ipfs://def-3", none); // unit 2 frozen
    }

    // ------------------------------------------------------------ helpers

    function _char(uint256 unitId, uint32 version) internal pure returns (AssertionInput memory a) {
        a.kind = AssertionKind.Characterization;
        a.unitId = unitId;
        a.version = version;
        a.profileId = CHAR_PROFILE;
        a.contentHash = CONTENT;
        a.contentURI = "ipfs://char";
    }

    function _valuation(uint256 unitId, uint32 version, uint8 resultKind, int256 value)
        internal
        pure
        returns (AssertionInput memory a, ValuationCore memory core)
    {
        core = ValuationCore({
            methodId: METHOD,
            interestId: INTEREST,
            assessmentBoundaryHash: keccak256("def-1"),
            snapshotHash: keccak256("snapshot"),
            resultKind: resultKind,
            decimals: 2,
            value: value,
            denominationId: USD,
            asOf: 1_700_000_000,
            horizonEnd: 0
        });
        a.kind = AssertionKind.Valuation;
        a.unitId = unitId;
        a.version = version;
        a.profileId = METHOD;
        a.contentHash = CONTENT;
        a.contentURI = "ipfs://val";
        a.payload = abi.encode(core);
    }

    function _observation(uint256 unitId, uint32 version, uint64 start, uint64 end)
        internal
        pure
        returns (AssertionInput memory a)
    {
        a.kind = AssertionKind.Observation;
        a.unitId = unitId;
        a.version = version;
        a.profileId = OBS_PROFILE;
        a.contentHash = CONTENT;
        a.contentURI = "ipfs://obs";
        a.payload = abi.encode(ObservationCore({snapshotHash: keccak256("snap"), windowStart: start, windowEnd: end}));
    }

    function _expectedId(address asserter, uint256 nonce) internal view returns (bytes32) {
        return keccak256(abi.encode(address(reg), asserter, nonce));
    }

    // ------------------------------------------------------------ descriptors

    function testRegisterDescriptorWriteOnce() public {
        bytes32 kind = keccak256("auf:method");
        vm.prank(evaluator);
        vm.expectEmit(true, true, true, true);
        emit IAUFAssertionRegistry.DescriptorRegistered(METHOD, kind, evaluator, "ipfs://method");
        reg.registerDescriptor(METHOD, kind, "ipfs://method");
        (address pub, bytes32 k, uint64 at, string memory uri) = reg.descriptorOf(METHOD);
        assertEq(pub, evaluator);
        assertEq(k, kind);
        assertEq(at, uint64(block.timestamp));
        assertEq(uri, "ipfs://method");

        vm.expectRevert(abi.encodeWithSelector(AUF_DescriptorExists.selector, METHOD));
        reg.registerDescriptor(METHOD, kind, "ipfs://other");
        vm.expectRevert(AUF_ZeroHash.selector);
        reg.registerDescriptor(bytes32(0), kind, "x");
        vm.expectRevert(abi.encodeWithSelector(AUF_DescriptorNotFound.selector, keccak256("nope")));
        reg.descriptorOf(keccak256("nope"));
    }

    // ------------------------------------------------------------ characterization

    function testCharacterizationByControllerAndThirdParty() public {
        AssertionInput memory a = _char(1, 2);
        bytes32 id0 = _expectedId(controller, 0);
        vm.prank(controller);
        vm.expectEmit(true, true, true, true);
        emit IAUFAssertionRegistry.Asserted(id0, 1, 2, AssertionKind.Characterization, controller, CHAR_PROFILE, CONTENT, true);
        bytes32 id = reg.assertStatement(a);
        assertEq(id, id0);
        Assertion memory s = reg.assertionOf(id);
        assertTrue(s.byController);
        assertEq(uint8(s.status), uint8(AssertionStatus.Active));
        assertEq(s.asserter, controller);
        assertEq(s.unitId, 1);
        assertEq(s.version, 2);
        assertEq(s.contentURI, "ipfs://char");

        vm.prank(evaluator);
        bytes32 id2 = reg.assertStatement(a);
        assertFalse(reg.assertionOf(id2).byController);
        assertEq(reg.assertionCount(1, 2), 2);
        assertEq(reg.assertionAt(1, 2, 0), id);
        assertEq(reg.assertionAt(1, 2, 1), id2);
        assertEq(reg.assertionCount(1, 1), 0);
        assertEq(reg.nonces(controller), 1);
        assertEq(reg.nonces(evaluator), 1);
    }

    function testByControllerIsFrozenAtRecordingTime() public {
        vm.prank(controller);
        bytes32 id = reg.assertStatement(_char(1, 1));
        vm.prank(controller);
        units.setController(1, other);
        assertTrue(reg.assertionOf(id).byController);
        vm.prank(controller);
        bytes32 id2 = reg.assertStatement(_char(1, 1));
        assertFalse(reg.assertionOf(id2).byController);
    }

    function testInvalidSubjectsRevert() public {
        AssertionInput memory a = _char(1, 3);
        vm.expectRevert(abi.encodeWithSelector(AUF_VersionNotFound.selector, 1, 3));
        reg.assertStatement(a);
        a = _char(1, 0);
        vm.expectRevert(abi.encodeWithSelector(AUF_VersionNotFound.selector, 1, 0));
        reg.assertStatement(a);
        a = _char(9, 1);
        vm.expectRevert(abi.encodeWithSelector(AUF_UnitNotFound.selector, 9));
        reg.assertStatement(a);
    }

    function testInvalidEnvelopeReverts() public {
        AssertionInput memory a = _char(1, 1);
        a.kind = AssertionKind.None;
        vm.expectRevert(AUF_InvalidKind.selector);
        reg.assertStatement(a);

        a = _char(1, 1);
        a.contentHash = bytes32(0);
        vm.expectRevert(AUF_ZeroHash.selector);
        reg.assertStatement(a);

        a = _char(1, 1);
        a.validFrom = 100;
        a.validUntil = 100;
        vm.expectRevert(AUF_InvalidValidity.selector);
        reg.assertStatement(a);

        a = _char(1, 1);
        a.payload = hex"01";
        vm.expectRevert(AUF_InvalidPayload.selector);
        reg.assertStatement(a);
    }

    // ------------------------------------------------------------ valuation

    function testValuationStoresCoreAndEmits() public {
        (AssertionInput memory a, ValuationCore memory core) = _valuation(1, 2, AUFResultKind.MONETARY, 7000);
        bytes32 id0 = _expectedId(evaluator, 0);
        vm.prank(evaluator);
        vm.expectEmit(true, true, true, true);
        emit IAUFAssertionRegistry.ValuationAsserted(id0, 1, METHOD, INTEREST, AUFResultKind.MONETARY, 7000, USD, 1_700_000_000);
        bytes32 id = reg.assertStatement(a);
        ValuationCore memory stored = reg.valuationCoreOf(id);
        assertEq(stored.methodId, core.methodId);
        assertEq(stored.interestId, core.interestId);
        assertEq(stored.assessmentBoundaryHash, core.assessmentBoundaryHash);
        assertEq(stored.snapshotHash, core.snapshotHash);
        assertEq(stored.resultKind, AUFResultKind.MONETARY);
        assertEq(stored.decimals, 2);
        assertEq(stored.value, 7000);
        assertEq(stored.denominationId, USD);
        assertEq(stored.asOf, 1_700_000_000);
    }

    function testNegativeMonetaryValueIsAllowed() public {
        (AssertionInput memory a,) = _valuation(1, 1, AUFResultKind.MONETARY, -2500);
        vm.prank(evaluator);
        bytes32 id = reg.assertStatement(a);
        assertEq(reg.valuationCoreOf(id).value, -2500);
    }

    function testValuationValidations() public {
        (AssertionInput memory a,) = _valuation(1, 1, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(AUF_InvalidResultKind.selector, 0));
        reg.assertStatement(a);

        (a,) = _valuation(1, 1, 12, 0);
        vm.expectRevert(abi.encodeWithSelector(AUF_InvalidResultKind.selector, 12));
        reg.assertStatement(a);

        (a,) = _valuation(1, 1, AUFResultKind.MONETARY, 1);
        a.profileId = keccak256("another-method");
        vm.expectRevert(abi.encodeWithSelector(AUF_MethodMismatch.selector, keccak256("another-method"), METHOD));
        reg.assertStatement(a);

        (a,) = _valuation(1, 1, AUFResultKind.INSUFFICIENT_EVIDENCE, 5);
        vm.expectRevert(abi.encodeWithSelector(AUF_ValueNotAllowed.selector, AUFResultKind.INSUFFICIENT_EVIDENCE));
        reg.assertStatement(a);

        (a,) = _valuation(1, 1, AUFResultKind.INSUFFICIENT_EVIDENCE, 0);
        bytes32 id = reg.assertStatement(a);
        assertEq(reg.valuationCoreOf(id).resultKind, AUFResultKind.INSUFFICIENT_EVIDENCE);

        (a,) = _valuation(1, 1, AUFResultKind.MONETARY, 1);
        a.payload = hex"0102";
        vm.expectRevert(AUF_InvalidPayload.selector);
        reg.assertStatement(a);
    }

    function testValuationCoreOfNonValuationReverts() public {
        vm.prank(controller);
        bytes32 id = reg.assertStatement(_char(1, 1));
        vm.expectRevert(abi.encodeWithSelector(AUF_AssertionNotFound.selector, id));
        reg.valuationCoreOf(id);
        vm.expectRevert(abi.encodeWithSelector(AUF_AssertionNotFound.selector, id));
        reg.observationCoreOf(id);
    }

    // ------------------------------------------------------------ observation

    function testObservationStoresCore() public {
        AssertionInput memory a = _observation(1, 1, 1_000, 2_000);
        bytes32 id0 = _expectedId(evaluator, 0);
        vm.prank(evaluator);
        vm.expectEmit(true, true, false, true);
        emit IAUFAssertionRegistry.ObservationAsserted(id0, 1, keccak256("snap"), 1_000, 2_000);
        bytes32 id = reg.assertStatement(a);
        ObservationCore memory c = reg.observationCoreOf(id);
        assertEq(c.windowStart, 1_000);
        assertEq(c.windowEnd, 2_000);
        assertEq(c.snapshotHash, keccak256("snap"));
    }

    function testObservationInvalidWindowReverts() public {
        AssertionInput memory a = _observation(1, 1, 2_000, 1_000);
        vm.expectRevert(AUF_InvalidWindow.selector);
        reg.assertStatement(a);
        a = _observation(1, 1, 1, 2);
        a.payload = hex"00";
        vm.expectRevert(AUF_InvalidPayload.selector);
        reg.assertStatement(a);
    }

    // ------------------------------------------------------------ revoke and supersede

    function testRevoke() public {
        vm.prank(evaluator);
        bytes32 id = reg.assertStatement(_char(1, 1));
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(AUF_NotAsserter.selector, id, other));
        reg.revoke(id);
        vm.prank(evaluator);
        vm.expectEmit(true, true, false, true);
        emit IAUFAssertionRegistry.Revoked(id, evaluator);
        reg.revoke(id);
        assertEq(uint8(reg.assertionOf(id).status), uint8(AssertionStatus.Revoked));
        vm.prank(evaluator);
        vm.expectRevert(abi.encodeWithSelector(AUF_NotActive.selector, id));
        reg.revoke(id);
        vm.expectRevert(abi.encodeWithSelector(AUF_AssertionNotFound.selector, keccak256("x")));
        reg.revoke(keccak256("x"));
    }

    function testSupersede() public {
        vm.prank(evaluator);
        bytes32 first = reg.assertStatement(_char(1, 1));
        AssertionInput memory a = _char(1, 2); // a later version of the same Unit
        a.supersedes = first;
        bytes32 second0 = _expectedId(evaluator, 1);
        vm.prank(evaluator);
        vm.expectEmit(true, true, false, true);
        emit IAUFAssertionRegistry.Superseded(first, second0);
        bytes32 second = reg.assertStatement(a);
        assertEq(second, second0);
        Assertion memory f = reg.assertionOf(first);
        assertEq(uint8(f.status), uint8(AssertionStatus.Superseded));
        assertEq(f.supersededBy, second);
        assertEq(f.contentHash, CONTENT); // still resolves to its original content
        assertEq(reg.assertionOf(second).supersedes, first);
    }

    function testSupersedeMismatchesRevert() public {
        vm.prank(evaluator);
        bytes32 first = reg.assertStatement(_char(1, 1));

        // other asserter
        AssertionInput memory a = _char(1, 1);
        a.supersedes = first;
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(AUF_SupersedeMismatch.selector, first));
        reg.assertStatement(a);

        // other kind
        (AssertionInput memory v,) = _valuation(1, 1, AUFResultKind.MONETARY, 1);
        v.supersedes = first;
        vm.prank(evaluator);
        vm.expectRevert(abi.encodeWithSelector(AUF_SupersedeMismatch.selector, first));
        reg.assertStatement(v);

        // other unit
        a = _char(2, 1);
        a.supersedes = first;
        vm.prank(evaluator);
        vm.expectRevert(abi.encodeWithSelector(AUF_SupersedeMismatch.selector, first));
        reg.assertStatement(a);

        // unknown
        a = _char(1, 1);
        a.supersedes = keccak256("unknown");
        vm.prank(evaluator);
        vm.expectRevert(abi.encodeWithSelector(AUF_AssertionNotFound.selector, keccak256("unknown")));
        reg.assertStatement(a);

        // not active
        vm.prank(evaluator);
        reg.revoke(first);
        a.supersedes = first;
        vm.prank(evaluator);
        vm.expectRevert(abi.encodeWithSelector(AUF_NotActive.selector, first));
        reg.assertStatement(a);
    }

    // ------------------------------------------------------------ signatures

    function _sign(uint256 pk, AssertionInput memory a, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = reg.hashAssertion(a, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function testAssertBySigEOA() public {
        AssertionInput memory a = _char(1, 2);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerPk, a, 0, deadline);
        vm.prank(other); // relayer
        bytes32 id = reg.assertStatementBySig(a, signer, deadline, sig);
        Assertion memory s = reg.assertionOf(id);
        assertEq(s.asserter, signer);
        assertEq(id, _expectedId(signer, 0));
        assertEq(reg.nonces(signer), 1);
        // replay with the same signature fails (nonce moved)
        vm.expectRevert(AUF_InvalidSignature.selector);
        reg.assertStatementBySig(a, signer, deadline, sig);
    }

    function testAssertBySigRejectsExpiredWrongNonceWrongSigner() public {
        AssertionInput memory a = _char(1, 1);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerPk, a, 0, deadline);

        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(AUF_Expired.selector, deadline));
        reg.assertStatementBySig(a, signer, deadline, sig);
        vm.warp(deadline - 1);

        bytes memory wrongNonce = _sign(signerPk, a, 1, deadline);
        vm.expectRevert(AUF_InvalidSignature.selector);
        reg.assertStatementBySig(a, signer, deadline, wrongNonce);

        bytes memory otherKey = _sign(0xB0B, a, 0, deadline);
        vm.expectRevert(AUF_InvalidSignature.selector);
        reg.assertStatementBySig(a, signer, deadline, otherKey);

        vm.expectRevert(AUF_InvalidSignature.selector);
        reg.assertStatementBySig(a, signer, deadline, hex"00");
    }

    function testAssertBySigERC1271() public {
        ERC1271Wallet wallet = new ERC1271Wallet(signer);
        AssertionInput memory a = _char(1, 1);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerPk, a, 0, deadline);
        bytes32 id = reg.assertStatementBySig(a, address(wallet), deadline, sig);
        assertEq(reg.assertionOf(id).asserter, address(wallet));

        ERC1271Wallet stranger = new ERC1271Wallet(other);
        bytes memory sig2 = _sign(signerPk, a, 0, deadline);
        vm.expectRevert(AUF_InvalidSignature.selector);
        reg.assertStatementBySig(a, address(stranger), deadline, sig2);
    }

    function testDomainSeparatorMatchesEIP712() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AUFAssertionRegistry"),
                keccak256("1"),
                block.chainid,
                address(reg)
            )
        );
        assertEq(reg.DOMAIN_SEPARATOR(), expected);
    }

    // ------------------------------------------------------------ ERC-165

    function testSupportsInterface() public view {
        assertTrue(reg.supportsInterface(0x01ffc9a7));
        assertTrue(reg.supportsInterface(type(IAUFAssertionRegistry).interfaceId));
        assertFalse(reg.supportsInterface(0xffffffff));
        assertEq(reg.unitRegistry(), address(units));
    }
}
