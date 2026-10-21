// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {AUFUnitRegistry} from "auf/AUFUnitRegistry.sol";
import {IAUFUnitRegistry} from "auf/interfaces/IAUFUnitRegistry.sol";
import {UnitRef, AckKind} from "auf/AUFTypes.sol";
import "auf/AUFErrors.sol";

contract AUFUnitRegistryTest is Test {
    AUFUnitRegistry internal reg;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    bytes32 internal constant H1 = keccak256("definition-1");
    bytes32 internal constant H2 = keccak256("definition-2");
    bytes32 internal constant H3 = keccak256("definition-3");
    bytes32 internal constant ELEMENT = keccak256("skill:eip155:11155111/erc721:0x00000000000000000000000000000000000000aa/1");

    UnitRef[] internal none;

    function setUp() public {
        reg = new AUFUnitRegistry();
    }

    // ------------------------------------------------------------ registration and versions

    function testRegisterUnitPublishesVersionOne() public {
        vm.expectEmit(true, true, false, true);
        emit IAUFUnitRegistry.UnitRegistered(1, alice, H1, "ipfs://def-1");
        vm.expectEmit(true, true, false, true);
        emit IAUFUnitRegistry.VersionPublished(1, 1, H1, "ipfs://def-1", 0);
        vm.prank(alice);
        uint256 id = reg.registerUnit(alice, H1, "ipfs://def-1", none);

        assertEq(id, 1);
        assertEq(reg.unitCount(), 1);
        assertEq(reg.controllerOf(1), alice);
        assertEq(reg.latestVersion(1), 1);
        assertFalse(reg.isFrozen(1));
        (bytes32 h, string memory uri, uint64 at, uint256 n) = reg.versionOf(1, 1);
        assertEq(h, H1);
        assertEq(uri, "ipfs://def-1");
        assertEq(at, uint64(block.timestamp));
        assertEq(n, 0);
    }

    function testUnitIdsAreSequential() public {
        reg.registerUnit(alice, H1, "a", none);
        reg.registerUnit(bob, H2, "b", none);
        assertEq(reg.unitCount(), 2);
        assertEq(reg.controllerOf(2), bob);
    }

    function testZeroHashReverts() public {
        vm.expectRevert(AUF_ZeroHash.selector);
        reg.registerUnit(alice, bytes32(0), "a", none);
    }

    function testPublishVersionByController() public {
        reg.registerUnit(alice, H1, "v1", none);
        vm.warp(block.timestamp + 100);
        vm.prank(alice);
        uint32 v = reg.publishVersion(1, H2, "v2", none);
        assertEq(v, 2);
        assertEq(reg.latestVersion(1), 2);
        (bytes32 h1,,,) = reg.versionOf(1, 1);
        (bytes32 h2,,,) = reg.versionOf(1, 2);
        assertEq(h1, H1); // earlier version immutable
        assertEq(h2, H2);
    }

    function testPublishVersionByOtherReverts() public {
        reg.registerUnit(alice, H1, "v1", none);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AUF_NotController.selector, 1, bob));
        reg.publishVersion(1, H2, "v2", none);
    }

    function testVersionViewsRevertForUnknown() public {
        reg.registerUnit(alice, H1, "v1", none);
        vm.expectRevert(abi.encodeWithSelector(AUF_UnitNotFound.selector, 2));
        reg.latestVersion(2);
        vm.expectRevert(abi.encodeWithSelector(AUF_VersionNotFound.selector, 1, 2));
        reg.versionOf(1, 2);
        vm.expectRevert(abi.encodeWithSelector(AUF_VersionNotFound.selector, 1, 0));
        reg.versionOf(1, 0);
    }

    // ------------------------------------------------------------ control and freezing

    function testSetControllerAndFreeze() public {
        reg.registerUnit(alice, H1, "v1", none);
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit IAUFUnitRegistry.ControllerChanged(1, alice, bob);
        reg.setController(1, bob);
        assertEq(reg.controllerOf(1), bob);

        vm.prank(bob);
        reg.setController(1, address(0));
        assertTrue(reg.isFrozen(1));

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AUF_Frozen.selector, 1));
        reg.publishVersion(1, H2, "v2", none);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AUF_Frozen.selector, 1));
        reg.setController(1, bob);
    }

    function testRegisterFrozenUnit() public {
        reg.registerUnit(address(0), H1, "v1", none);
        assertTrue(reg.isFrozen(1));
        assertEq(reg.latestVersion(1), 1);
        vm.expectRevert(abi.encodeWithSelector(AUF_Frozen.selector, 1));
        reg.publishVersion(1, H2, "v2", none);
    }

    // ------------------------------------------------------------ containment

    function testContainmentOfExistingVersions() public {
        reg.registerUnit(alice, H1, "child-1", none); // unit 1
        reg.registerUnit(alice, H2, "child-2", none); // unit 2
        UnitRef[] memory refs = new UnitRef[](2);
        refs[0] = UnitRef(1, 1);
        refs[1] = UnitRef(2, 1);
        vm.expectEmit(true, true, false, true);
        emit IAUFUnitRegistry.VersionPublished(3, 1, H3, "parent", 2);
        uint256 parent = reg.registerUnit(alice, H3, "parent", refs);
        assertEq(parent, 3);
        (,,, uint256 n) = reg.versionOf(3, 1);
        assertEq(n, 2);
        UnitRef memory r0 = reg.containedAt(3, 1, 0);
        UnitRef memory r1 = reg.containedAt(3, 1, 1);
        assertEq(r0.unitId, 1);
        assertEq(r0.version, 1);
        assertEq(r1.unitId, 2);
        assertEq(r1.version, 1);
    }

    function testContainmentPinsVersionNotLatest() public {
        reg.registerUnit(alice, H1, "child-1", none);
        UnitRef[] memory refs = new UnitRef[](1);
        refs[0] = UnitRef(1, 1);
        reg.registerUnit(alice, H2, "parent", refs); // unit 2 pins child v1
        vm.prank(alice);
        reg.publishVersion(1, H3, "child-2", none); // child moves to v2
        UnitRef memory r = reg.containedAt(2, 1, 0);
        assertEq(r.version, 1); // parent still pins v1
        (bytes32 parentHash,,,) = reg.versionOf(2, 1);
        assertEq(parentHash, H2); // parent boundary unchanged
    }

    function testContainmentOfMissingUnitReverts() public {
        UnitRef[] memory refs = new UnitRef[](1);
        refs[0] = UnitRef(7, 1);
        vm.expectRevert(abi.encodeWithSelector(AUF_UnitNotFound.selector, 7));
        reg.registerUnit(alice, H1, "parent", refs);
    }

    function testContainmentOfMissingVersionReverts() public {
        reg.registerUnit(alice, H1, "child", none);
        UnitRef[] memory refs = new UnitRef[](1);
        refs[0] = UnitRef(1, 2);
        vm.expectRevert(abi.encodeWithSelector(AUF_VersionNotFound.selector, 1, 2));
        reg.registerUnit(alice, H2, "parent", refs);
    }

    function testSelfContainmentReverts() public {
        reg.registerUnit(alice, H1, "v1", none);
        UnitRef[] memory refs = new UnitRef[](1);
        refs[0] = UnitRef(1, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AUF_SelfContainment.selector, 1));
        reg.publishVersion(1, H2, "v2", refs);

        // a new unit cannot reference its own (not yet existing) id either
        refs[0] = UnitRef(2, 1);
        vm.expectRevert(abi.encodeWithSelector(AUF_SelfContainment.selector, 2));
        reg.registerUnit(alice, H3, "self", refs);
    }

    function testContainmentIsAcyclicByConstruction() public {
        // A(v1) exists; B(v1) contains A(v1); A(v2) may contain B(v1): the version graph has no cycle
        reg.registerUnit(alice, H1, "A1", none); // 1
        UnitRef[] memory refs = new UnitRef[](1);
        refs[0] = UnitRef(1, 1);
        reg.registerUnit(alice, H2, "B1", refs); // 2 contains (1,1)
        refs[0] = UnitRef(2, 1);
        vm.prank(alice);
        reg.publishVersion(1, H3, "A2", refs); // (1,2) contains (2,1), which contains (1,1): acyclic
        UnitRef memory r = reg.containedAt(1, 2, 0);
        assertEq(r.unitId, 2);
        // (1,2) cannot be contained by (2,1) because (2,1) is immutable; only a new version (2,2) could, and it
        // would reference an existing version, never itself.
    }

    // ------------------------------------------------------------ acknowledgments

    function testAcknowledgeAndWithdraw() public {
        reg.registerUnit(alice, H1, "v1", none);
        vm.warp(1_700_000_000);
        vm.prank(carol);
        vm.expectEmit(true, true, true, true);
        emit IAUFUnitRegistry.Acknowledged(1, 1, ELEMENT, AckKind.ResourceUse, carol);
        reg.acknowledge(1, 1, ELEMENT, AckKind.ResourceUse);
        assertEq(reg.acknowledgedAt(1, 1, ELEMENT, AckKind.ResourceUse, carol), 1_700_000_000);
        // kinds are independent
        assertEq(reg.acknowledgedAt(1, 1, ELEMENT, AckKind.Participation, carol), 0);
        assertEq(reg.acknowledgedAt(1, 1, ELEMENT, AckKind.ResourceUse, bob), 0);

        vm.prank(carol);
        vm.expectEmit(true, true, true, true);
        emit IAUFUnitRegistry.AcknowledgmentWithdrawn(1, 1, ELEMENT, AckKind.ResourceUse, carol);
        reg.withdrawAcknowledgment(1, 1, ELEMENT, AckKind.ResourceUse);
        assertEq(reg.acknowledgedAt(1, 1, ELEMENT, AckKind.ResourceUse, carol), 0);
    }

    function testAcknowledgeInvalidKindOrVersionReverts() public {
        reg.registerUnit(alice, H1, "v1", none);
        vm.expectRevert(AUF_InvalidAckKind.selector);
        reg.acknowledge(1, 1, ELEMENT, AckKind.None);
        vm.expectRevert(abi.encodeWithSelector(AUF_VersionNotFound.selector, 1, 2));
        reg.acknowledge(1, 2, ELEMENT, AckKind.Participation);
        vm.expectRevert(AUF_NoAcknowledgment.selector);
        reg.withdrawAcknowledgment(1, 1, ELEMENT, AckKind.Participation);
    }

    function testAcknowledgmentsAreVersionSpecific() public {
        reg.registerUnit(alice, H1, "v1", none);
        vm.prank(alice);
        reg.publishVersion(1, H2, "v2", none);
        vm.prank(carol);
        reg.acknowledge(1, 1, ELEMENT, AckKind.DescriptionEndorsement);
        assertGt(reg.acknowledgedAt(1, 1, ELEMENT, AckKind.DescriptionEndorsement, carol), 0);
        assertEq(reg.acknowledgedAt(1, 2, ELEMENT, AckKind.DescriptionEndorsement, carol), 0);
    }

    // ------------------------------------------------------------ ERC-165

    function testSupportsInterface() public view {
        assertTrue(reg.supportsInterface(0x01ffc9a7));
        assertTrue(reg.supportsInterface(type(IAUFUnitRegistry).interfaceId));
        assertFalse(reg.supportsInterface(0xffffffff));
    }
}
