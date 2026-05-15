// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ValueStorage
 * @notice Manages per-token balance state and emits balance-change events.
 * @dev Abstract contract. `_tokenExists` must be implemented by the concrete ERC-721 contract
 *      using `_ownerOf(tokenId) != address(0)`.
 *      `_setValue` performs no validation — callers are responsible for all checks.
 */
abstract contract ValueStorage {
    /// @notice Maps tokenId to its current balance (won units, integer).
    mapping(uint256 => uint256) public values;

    /**
     * @notice Emitted on every successful updateValue call.
     * @param tokenId      NFT whose balance changed. Indexed for Scanner filtering.
     * @param updater      Address that triggered the update (UPDATER_ROLE wallet).
     * @param oldValue     Balance before the update.
     * @param newValue     Balance after the update.
     * @param metadataHash keccak256 of the canonical RDB JSON snapshot for integrity verification.
     */
    event ValueUpdated(
        uint256 indexed tokenId,
        address indexed updater,
        uint256 oldValue,
        uint256 newValue,
        bytes32 metadataHash
    );

    /// @notice Reverts when updateValue is called for a tokenId that was never minted.
    error TokenDoesNotExist(uint256 tokenId);

    /**
     * @notice Writes `newValue` to `values[tokenId]`.
     * @dev Internal; no existence or authorization checks. Call only after all checks pass.
     */
    function _setValue(uint256 tokenId, uint256 newValue) internal {
        values[tokenId] = newValue;
    }

    /**
     * @notice Returns the current balance of a voucher token.
     * @param tokenId The NFT to query.
     */
    function getValue(uint256 tokenId) external view returns (uint256) {
        return values[tokenId];
    }

    /**
     * @notice Returns whether `tokenId` has been minted.
     * @dev Abstract — implemented by VoucherNFT via `_ownerOf(tokenId) != address(0)`.
     */
    function _tokenExists(uint256 tokenId) internal view virtual returns (bool);
}
