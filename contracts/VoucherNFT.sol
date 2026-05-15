// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
 * ─── 설계 판단 근거 (Opus) ──────────────────────────────────────────────────────
 *
 * (A) 다중 상속 충돌 해소
 *   tokenURI: ERC721과 ERC721URIStorage 모두 정의한다.
 *     → override(ERC721, ERC721URIStorage)로 명시하고 super.tokenURI()를 호출해
 *       ERC721URIStorage의 커스텀 URI 스토리지 로직을 유지한다.
 *   supportsInterface: ERC721URIStorage와 AccessControl 모두 정의한다.
 *     → override(ERC721URIStorage, AccessControl)로 명시하고 super.supportsInterface()를
 *       호출한다. Solidity C3 선형화(MRO)에 의해 VoucherNFT → ERC721URIStorage →
 *       ERC721 → ValueUpdater → ValueStorage → AccessManager → AccessControl → ERC165
 *       순서로 super 체인이 형성되어 두 브랜치의 구현이 모두 순회된다.
 *
 * (B) _nextTokenId 증가 시점
 *   tokenId를 먼저 캡처(uint256 tokenId = _nextTokenId)한 뒤 증가(_nextTokenId++)시키고,
 *   캡처한 값으로 _mint를 호출한다.
 *   [선택 근거]: post-increment 방식이 "현재 tokenId = 증가 전 값" 관계를 코드에서
 *   명확히 드러낸다. 첫 번째 minted tokenId는 0이다.
 *
 * (C) _mint vs _safeMint
 *   [선택 근거]: _mint를 선택한다. mintVoucher는 MINTER_ROLE을 보유한 백엔드 운영 지갑만
 *   호출한다. 백엔드는 수신자(사용자 EOA)를 사전에 검증하므로 _safeMint의
 *   IERC721Receiver 콜백 검사가 불필요하다. _safeMint는 수신자가 컨트랙트인 경우
 *   추가 외부 호출을 수행해 gas를 낭비하고 재진입 벡터를 확장한다.
 *   백엔드가 제어하는 구조에서는 _mint가 더 안전하고 효율적이다.
 *
 * (D) values[tokenId] 명시적 초기화 생략
 *   [선택 근거]: Solidity mapping의 기본값이 0이므로 명시적 초기화를 생략한다.
 *   `values[tokenId] = 0`은 cold slot에 대한 불필요한 SSTORE로 ~20,000 gas 낭비다.
 *   mint 직후 getValue(tokenId)가 0을 반환함은 Solidity 사양으로 보장된다.
 *
 * (E) _tokenExists 구현
 *   [선택 근거]: OZ v5에서 _exists()가 제거되었다. 대체 패턴은
 *   `_ownerOf(tokenId) != address(0)`이다. ERC-721 표준상 minted된 토큰은
 *   반드시 소유자가 있으며, burn되지 않은 이상 address(0)이 아니다.
 *   _ownerOf는 ERC721 내부 함수로, 외부 호출 없이 storage를 직접 읽는다.
 * ────────────────────────────────────────────────────────────────────────────────
 */

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "./ValueUpdater.sol";

/**
 * @title VoucherNFT
 * @notice ERC-721 NFT representing a government/institution-issued digital voucher.
 *         Minting and balance updates are restricted to permissioned backend wallets.
 *         All balance change history is anchored on-chain via metadataHash for RDB integrity.
 */
contract VoucherNFT is ERC721URIStorage, ValueUpdater {
    uint256 private _nextTokenId;

    /**
     * @param name_   ERC-721 collection name (e.g., "Voucher").
     * @param symbol_ ERC-721 collection symbol (e.g., "VCH").
     * @dev Deployer receives all three roles so they can immediately operate or
     *      delegate to the backend wallet via grantMinterRole / grantUpdaterRole.
     */
    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(UPDATER_ROLE, msg.sender);
    }

    /**
     * @notice Mints a new voucher NFT to `to` with metadata at `uri`.
     * @param to  Recipient wallet address (user EOA; validated by backend before calling).
     * @param uri Token metadata URI (IPFS CID or backend API endpoint).
     * @return tokenId ID of the newly minted NFT (starts at 0).
     *
     * @dev ERC-721 Transfer(address(0), to, tokenId) is emitted automatically by _mint.
     *      tokenId is indexed (topics[3] in the raw log), enabling backend Scanner to
     *      extract it without ABI decoding. See INTERFACE.md §3 for parsing guide.
     *
     *      [설계 근거]: _mint 선택 이유 → 파일 상단 (C) 참조.
     *      [설계 근거]: values[tokenId] 초기화 생략 → 파일 상단 (D) 참조.
     */
    function mintVoucher(
        address to,
        string memory uri
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);

        return tokenId;
    }

    /**
     * @notice Returns whether `tokenId` has been minted.
     * @dev Overrides ValueStorage._tokenExists.
     *      [설계 근거]: OZ v5 _exists() 제거 → _ownerOf 활용. 파일 상단 (E) 참조.
     */
    function _tokenExists(uint256 tokenId) internal view override returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /**
     * @notice Returns the metadata URI for `tokenId`.
     * @dev [설계 근거]: ERC721과 ERC721URIStorage 충돌 해소 → 파일 상단 (A) 참조.
     *      super.tokenURI routes to ERC721URIStorage which returns the stored URI.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /**
     * @notice ERC-165 interface support query.
     * @dev [설계 근거]: ERC721URIStorage와 AccessControl 충돌 해소 → 파일 상단 (A) 참조.
     *      super.supportsInterface traverses the full C3 MRO, covering both branches.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
