// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

/// @notice Minimal ERC-1271 wallet for tests: valid when the signature recovers to `owner`.
contract ERC1271Wallet {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        if (signature.length != 65) return bytes4(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        address recovered = ecrecover(hash, v, r, s);
        return (recovered != address(0) && recovered == owner) ? bytes4(0x1626ba7e) : bytes4(0);
    }
}
