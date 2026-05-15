// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AccessManager
 * @notice Role constants and role management helpers for the Voucher system.
 * @dev Abstract contract. Inherit alongside ERC721 in the final concrete contract.
 *      Role admin is DEFAULT_ADMIN_ROLE for both custom roles.
 */
abstract contract AccessManager is AccessControl {
    /// @notice Role allowed to mint new voucher NFTs.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Role allowed to update voucher balances.
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    /**
     * @notice Grants MINTER_ROLE to `account`.
     * @param account Address to receive the minter role.
     */
    function grantMinterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MINTER_ROLE, account);
    }

    /**
     * @notice Grants UPDATER_ROLE to `account`.
     * @param account Address to receive the updater role.
     */
    function grantUpdaterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(UPDATER_ROLE, account);
    }

    /**
     * @notice Revokes UPDATER_ROLE from `account`.
     * @param account Address to lose the updater role.
     */
    function revokeUpdaterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(UPDATER_ROLE, account);
    }
}
