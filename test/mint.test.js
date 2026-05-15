/*
 * ─── 설계 판단 근거 (Opus) ──────────────────────────────────────────────────────
 *
 * (1) Transfer 이벤트에서 tokenId를 파싱하는 두 가지 방법
 *
 *   방법 A — topics[3] 직접 접근 (백엔드 Scanner의 실제 구현 방식):
 *     receipt.logs에서 이벤트 시그니처로 Transfer 로그를 찾고,
 *     topics[3]을 BigInt로 변환한다. ABI 없이도 동작하므로 가장 견고하다.
 *     [선택 근거]: 백엔드가 ABI 없이 tokenId를 추출해야 하는 요구사항을 충족한다.
 *     ERC-721 Transfer 이벤트 구조:
 *       topics[0] = keccak256("Transfer(address,address,uint256)")
 *       topics[1] = from (indexed, address(0) for mint)
 *       topics[2] = to   (indexed)
 *       topics[3] = tokenId (indexed) ← 백엔드가 읽는 위치
 *
 *   방법 B — interface.parseLog (ABI 기반 파싱):
 *     contract.interface.parseLog({ topics, data })로 디코딩하면 args.tokenId로
 *     접근 가능하다. ABI가 있는 환경에서 더 가독성이 좋다.
 *     [선택 근거]: 두 방법이 동일한 값을 반환함을 교차 검증해 파싱 오류를 조기 탐지한다.
 *
 * (2) topics[3] → BigInt 변환 검증
 *   BigInt(hexString)이 "0x..." 형식을 올바르게 처리함을 명시적으로 검증한다.
 *   Number()로 변환하면 uint256 범위에서 정밀도를 잃으므로 반드시 BigInt를 사용한다.
 *
 * (3) 연속 mint tokenId 증가 검증
 *   [선택 근거]: 배열 deep.equal로 한번에 검증한다. 개별 expect보다 실패 시
 *   전체 순서가 메시지에 드러나 디버깅이 쉽다.
 * ────────────────────────────────────────────────────────────────────────────────
 */

const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const TRANSFER_SIG = ethers.id("Transfer(address,address,uint256)");

/**
 * topics[3] 직접 접근(방법 A)과 interface.parseLog(방법 B)를 모두 실행하고,
 * 두 방법이 같은 tokenId를 반환함을 교차 검증한 뒤 BigInt tokenId를 반환한다.
 */
function extractAndCrossValidateTokenId(receipt, contract) {
  // Method A: topics[3] direct access — backend Scanner approach (no ABI required)
  const transferLog = receipt.logs.find((l) => l.topics[0] === TRANSFER_SIG);
  if (!transferLog) throw new Error("Transfer event not found in receipt");
  const tokenIdFromTopics = BigInt(transferLog.topics[3]);

  // Method B: ABI-based parsing via interface.parseLog
  const parsed = contract.interface.parseLog({
    topics: transferLog.topics,
    data: transferLog.data,
  });
  const tokenIdFromParsed = parsed.args.tokenId; // ethers v6 returns BigInt

  // Cross-validate: both methods must agree
  expect(tokenIdFromTopics).to.equal(
    tokenIdFromParsed,
    "topics[3] and parseLog returned different tokenIds"
  );

  return tokenIdFromTopics;
}

module.exports = function mintTests(deployVoucherNFT) {
  describe("mintVoucher", function () {
    it("rejects caller without MINTER_ROLE", async function () {
      const { contract, user, MINTER_ROLE } = await loadFixture(deployVoucherNFT);

      await expect(contract.connect(user).mintVoucher(user.address, "ipfs://meta/0"))
        .to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount")
        .withArgs(user.address, MINTER_ROLE);
    });

    it("mint sets correct owner, tokenURI, and initial value=0", async function () {
      const { contract, user } = await loadFixture(deployVoucherNFT);

      const tx = await contract.mintVoucher(user.address, "ipfs://meta/0");
      const receipt = await tx.wait();
      const tokenId = extractAndCrossValidateTokenId(receipt, contract);

      expect(await contract.ownerOf(tokenId)).to.equal(user.address);
      expect(await contract.tokenURI(tokenId)).to.equal("ipfs://meta/0");
      // [설계 근거]: values[tokenId]는 mapping 기본값(0)으로 초기화된다.
      expect(await contract.getValue(tokenId)).to.equal(0n);
    });

    it("Transfer event emits from=address(0) to=recipient", async function () {
      const { contract, user } = await loadFixture(deployVoucherNFT);

      const tx = await contract.mintVoucher(user.address, "ipfs://meta/0");
      const receipt = await tx.wait();

      const transferLog = receipt.logs.find((l) => l.topics[0] === TRANSFER_SIG);
      expect(transferLog, "Transfer log not found").to.not.be.undefined;

      const parsed = contract.interface.parseLog({
        topics: transferLog.topics,
        data: transferLog.data,
      });
      expect(parsed.args.from).to.equal(ethers.ZeroAddress);
      expect(parsed.args.to).to.equal(user.address);
    });

    it("topics[3] correctly encodes tokenId=0 for backend Scanner", async function () {
      const { contract, user } = await loadFixture(deployVoucherNFT);

      const tx = await contract.mintVoucher(user.address, "ipfs://meta/0");
      const receipt = await tx.wait();

      const transferLog = receipt.logs.find((l) => l.topics[0] === TRANSFER_SIG);
      const tokenIdFromTopics = BigInt(transferLog.topics[3]);

      // First mint must produce tokenId=0
      expect(tokenIdFromTopics).to.equal(0n);
      // topics[3] is a 32-byte zero-padded hex of uint256(0)
      // Pattern: 0x followed by 63 zeros and a final 0
      expect(transferLog.topics[3]).to.match(/^0x0{63}0$/);
    });

    it("sequential mints produce strictly increasing tokenIds [0, 1, 2]", async function () {
      const { contract, user } = await loadFixture(deployVoucherNFT);

      const tokenIds = [];
      for (let i = 0; i < 3; i++) {
        const tx = await contract.mintVoucher(user.address, `ipfs://meta/${i}`);
        const receipt = await tx.wait();
        tokenIds.push(extractAndCrossValidateTokenId(receipt, contract));
      }

      // [설계 근거]: 배열 deep.equal로 한 번에 검증 — 실패 시 전체 순서가 메시지에 표시된다.
      expect(tokenIds).to.deep.equal([0n, 1n, 2n]);
    });
  });
};
