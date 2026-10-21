// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {AUFValuationLib} from "auf/libraries/AUFValuationLib.sol";

/// @notice Thin wrapper so that library reverts can be asserted with expectRevert.
contract ValuationHarness {
    function dcf(int256[] memory cf, uint256 r, int256 tv) external pure returns (int256) {
        return AUFValuationLib.finiteHorizonDCF(cf, r, tv);
    }

    function cond(int256[] memory x, uint256[] memory p, uint256 r, uint256 n) external pure returns (int256) {
        return AUFValuationLib.conditionalPayoff(x, p, r, n);
    }
}

contract AUFValuationLibTest is Test {
    uint256 internal constant WAD = 1e18;
    ValuationHarness internal h;

    function setUp() public {
        h = new ValuationHarness();
    }

    /// Vector "Net equity": cash 100, payable 30 -> 70
    function testNetEquityVector() public pure {
        int256[] memory assets = new int256[](1);
        assets[0] = 100e18;
        int256[] memory liabilities = new int256[](1);
        liabilities[0] = 30e18;
        assertEq(AUFValuationLib.netEquity(assets, liabilities), 70e18);
    }

    function testNetEquityMayBeNegative() public pure {
        int256[] memory assets = new int256[](0);
        int256[] memory liabilities = new int256[](1);
        liabilities[0] = 25e18;
        assertEq(AUFValuationLib.netEquity(assets, liabilities), -25e18);
    }

    /// Vector "Realized net cash flow": revenue 100, compute 30, fees 5 -> 65
    function testRealizedNetCashFlowVector() public pure {
        uint256[] memory inflows = new uint256[](1);
        inflows[0] = 100e18;
        uint256[] memory outflows = new uint256[](2);
        outflows[0] = 30e18;
        outflows[1] = 5e18;
        assertEq(AUFValuationLib.realizedNetCashFlow(inflows, outflows), 65e18);
    }

    /// Vector "Finite-horizon DCF": 65, 65 at 10%, terminal 0 -> 112.8099173553719...
    function testFiniteHorizonDCFVector() public view {
        int256[] memory cf = new int256[](2);
        cf[0] = 65e18;
        cf[1] = 65e18;
        int256 v = h.dcf(cf, 0.1e18, 0);
        // exact: 65/1.1 + 65/1.21 = 112.80991735537190082644...
        assertApproxEqAbs(v, 112.809917355371900826e18, 1e6);
        // two-decimal presentation of the vector
        assertEq(_round2(v), 11281);
    }

    function testFiniteHorizonDCFTerminalValue() public view {
        int256[] memory cf = new int256[](1);
        cf[0] = 0;
        // 110 received at the end of period 1 at 10% -> 100
        assertApproxEqAbs(h.dcf(cf, 0.1e18, 110e18), 100e18, 1e6);
    }

    function testFiniteHorizonDCFEmptyReverts() public {
        int256[] memory cf = new int256[](0);
        vm.expectRevert(AUFValuationLib.AUF_EmptyInput.selector);
        h.dcf(cf, 0.1e18, 0);
    }

    /// Vector "Conditional payoff": 0.6 x 100 + 0.4 x 0, one period at 10% -> 54.5454...
    function testConditionalPayoffVector() public view {
        int256[] memory x = new int256[](2);
        x[0] = 100e18;
        x[1] = 0;
        uint256[] memory p = new uint256[](2);
        p[0] = 0.6e18;
        p[1] = 0.4e18;
        int256 v = h.cond(x, p, 0.1e18, 1);
        assertApproxEqAbs(v, 54.545454545454545454e18, 1e6);
        assertEq(_round2(v), 5455);
    }

    function testConditionalPayoffValidations() public {
        int256[] memory x = new int256[](2);
        x[0] = 100e18;
        x[1] = 0;
        uint256[] memory p = new uint256[](2);
        p[0] = 0.6e18;
        p[1] = 0.3e18;
        vm.expectRevert(abi.encodeWithSelector(AUFValuationLib.AUF_ProbabilitiesNotNormalized.selector, 0.9e18));
        h.cond(x, p, 0.1e18, 1);

        uint256[] memory p1 = new uint256[](1);
        p1[0] = WAD;
        vm.expectRevert(AUFValuationLib.AUF_LengthMismatch.selector);
        h.cond(x, p1, 0.1e18, 1);

        int256[] memory empty = new int256[](0);
        uint256[] memory emptyP = new uint256[](0);
        vm.expectRevert(AUFValuationLib.AUF_EmptyInput.selector);
        h.cond(empty, emptyP, 0.1e18, 1);
    }

    function testConditionalPayoffZeroPeriodsIsUndiscounted() public view {
        int256[] memory x = new int256[](1);
        x[0] = -40e18; // an obligation
        uint256[] memory p = new uint256[](1);
        p[0] = WAD;
        assertEq(h.cond(x, p, 0.1e18, 0), -40e18);
    }

    function _round2(int256 wad) internal pure returns (int256) {
        // round half up to two decimals, returned as an integer number of cents
        int256 scaled = wad / 1e14; // 4 decimals as integer
        int256 cents = scaled / 100;
        int256 rem = scaled % 100;
        if (rem >= 50) cents += 1;
        if (rem <= -50) cents -= 1;
        return cents;
    }
}
