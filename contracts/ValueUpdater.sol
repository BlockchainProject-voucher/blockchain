// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
 * ─── 설계 판단 근거 (Opus) ──────────────────────────────────────────────────────
 *
 * 이 컨트랙트는 CEI(Checks-Effects-Interactions) 패턴을 엄격히 따른다.
 * 백엔드 운영 지갑만 호출하므로 재진입 위험은 낮지만, 패턴 준수가 감사(audit) 통과와
 * 미래 변경에 대한 안전성을 보장한다. 외부 호출(Interactions)이 없으므로
 * 순서는 Checks → Effects → (emit) 로 단순화된다.
 * ────────────────────────────────────────────────────────────────────────────────
 */

import "./ValueStorage.sol";
import "./AccessManager.sol";

/**
 * @title ValueUpdater
 * @notice Authenticated updateValue function for voucher balance changes.
 * @dev Inherits ValueStorage (balance state) and AccessManager (role constants + helpers).
 *      Concrete contract must implement `_tokenExists` from ValueStorage.
 */
abstract contract ValueUpdater is ValueStorage, AccessManager {
    /// @notice Reverts when updateValue is called with metadataHash == bytes32(0).
    error InvalidMetadataHash();

    /**
     * @notice Updates the balance of a voucher NFT and records the off-chain data hash.
     * @param tokenId      NFT whose balance to update.
     * @param newValue     New balance in won units.
     * @param metadataHash keccak256 hash of the canonical RDB JSON snapshot.
     *
     * @dev ── 검증 순서 (모두 state 변경 전 — 엄격한 CEI) ──────────────────────
     *
     *  1. UPDATER_ROLE — onlyRole modifier (O(1) mapping read)
     *     [설계 근거]: Role 검증을 modifier로 가장 먼저 수행한다. 권한 없는 호출자는
     *     여기서 즉시 실패해 이후 storage read(_tokenExists) 비용을 절감한다.
     *     가독성과 gas 효율을 모두 확보할 수 있는 지점이다.
     *
     *  2. _tokenExists — _ownerOf storage read
     *     [설계 근거]: UPDATER_ROLE 이후에 둔다. 역순으로 배치하면 권한 없는 호출자도
     *     storage를 읽게 되어 gas 낭비 + 잠재적 DoS 벡터가 생긴다. CEI 관점에서
     *     두 검증 모두 "Check" 단계이므로 순서는 gas 효율 기준으로 결정했다.
     *
     *  3. metadataHash — 인라인 검증
     *     [설계 근거]: bytes32(0) 검증을 modifier로 분리하면 파라미터를 받는 modifier가
     *     필요하다. 이는 Solidity modifier 관용구와 맞지 않고, 이 함수에서만 사용되므로
     *     재사용 가능성이 없다. 인라인 if-revert가 더 명확하고 간결하다.
     *
     *  4. _setValue — 유일한 state 변경 (Effects)
     *
     *  5. emit ValueUpdated — 외부 호출 없음; emit은 Interactions에 해당하지 않는다.
     *
     * @dev ── newValue == oldValue 허용 정책 ────────────────────────────────────
     *     [설계 근거]: 동일값 재기록을 의도적으로 허용한다. 이 컨트랙트의 역할은
     *     RDB 잔액의 무결성 앵커이며, "변경 없음"도 감사 증적이 필요한 이벤트일 수 있다.
     *     단, warm slot 재기록은 약 100 gas를 낭비한다. 중복 호출 필터링은
     *     백엔드 레이어에서 처리하는 것이 최적 지점이다.
     */
    function updateValue(
        uint256 tokenId,
        uint256 newValue,
        bytes32 metadataHash
    ) external onlyRole(UPDATER_ROLE) {
        // Check 1 (UPDATER_ROLE already enforced by modifier above)
        // Check 2: token must exist
        if (!_tokenExists(tokenId)) revert TokenDoesNotExist(tokenId);

        // Check 3: metadataHash must not be zero
        // [설계 근거]: bytes32(0)은 해시 미계산 또는 오프체인 연동 누락을 나타내는
        // sentinel 값으로 간주한다. 빈 해시로 updateValue가 호출되는 것을 막는
        // 최소 안전장치이며, 인라인 배치가 modifier 분리보다 적합하다 (위 주석 참조).
        if (metadataHash == bytes32(0)) revert InvalidMetadataHash();

        // Effects: capture old value, apply new value
        uint256 oldValue = values[tokenId];
        _setValue(tokenId, newValue);

        // Emit (no external calls — not a true "Interactions" step)
        emit ValueUpdated(tokenId, msg.sender, oldValue, newValue, metadataHash);
    }
}
