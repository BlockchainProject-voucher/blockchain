/*
 * ─── 설계 판단 근거 (Opus) ──────────────────────────────────────────────────────
 *
 * (1) 커스텀 에러 검증 방법 (ethers.js v6)
 *   revertedWithCustomError(contract, "ErrorName").withArgs(...) 를 사용한다.
 *   이 방법은 @nomicfoundation/hardhat-chai-matchers가 제공하며,
 *   ethers v6의 error.data를 ABI 디코딩해 파라미터까지 검증한다.
 *   [선택 근거]: try/catch + error.message 문자열 매칭보다 정확하고 오탐이 없다.
 *   contract.interface.decodeErrorResult 방식도 가능하지만 boilerplate가 과도하다.
 *
 * (2) AccessControlUnauthorizedAccount 에러 매칭
 *   OZ v5의 AccessControl은 revert string 대신 커스텀 에러를 사용한다.
 *   .withArgs(account.address, ROLE_HASH)로 계정과 역할을 함께 검증한다.
 *   [주의]: OZ v4는 "AccessControl: account ... is missing role ..." 문자열을 사용한다.
 *   이 프로젝트는 OZ v5이므로 반드시 커스텀 에러 방식을 사용해야 한다.
 *
 * (3) newValue == oldValue 재기록 케이스
 *   의도된 동작임을 명시적으로 테스트한다.
 *   [선택 근거]: revert 없이 성공하고 ValueUpdated 이벤트도 emit됨을 검증해,
 *   이 동작이 버그가 아닌 설계임을 코드로 문서화한다.
 *   seq 필드를 다르게 해 metadataHash는 다르지만 amount가 같은 시나리오를 재현한다.
 * ────────────────────────────────────────────────────────────────────────────────
 */

const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

function makeHash(data) {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(data)));
}

module.exports = function updateValueTests(deployVoucherNFT) {
  describe("updateValue", function () {
    async function mintOne(contract, to) {
      await (await contract.mintVoucher(to, "ipfs://meta/0")).wait();
      return 0n; // loadFixture resets state — first tokenId is always 0
    }

    it("UPDATER_ROLE can update value successfully", async function () {
      const { contract, owner } = await loadFixture(deployVoucherNFT);
      const tokenId = await mintOne(contract, owner.address);
      const hash = makeHash({ tokenId: 0, amount: 1000 });

      await expect(contract.updateValue(tokenId, 1000n, hash)).to.not.be.reverted;
      expect(await contract.getValue(tokenId)).to.equal(1000n);
    });

    it("non-UPDATER_ROLE is rejected with AccessControlUnauthorizedAccount", async function () {
      const { contract, owner, user, UPDATER_ROLE } = await loadFixture(deployVoucherNFT);
      const tokenId = await mintOne(contract, owner.address);
      const hash = makeHash({ tokenId: 0, amount: 1000 });

      // [설계 근거]: OZ v5 커스텀 에러 방식. account와 role 모두 검증한다.
      await expect(contract.connect(user).updateValue(tokenId, 1000n, hash))
        .to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount")
        .withArgs(user.address, UPDATER_ROLE);
    });

    it("reverts with TokenDoesNotExist for unminted tokenId", async function () {
      const { contract } = await loadFixture(deployVoucherNFT);
      const nonExistentId = 999n;
      const hash = makeHash({ tokenId: 999, amount: 0 });

      await expect(contract.updateValue(nonExistentId, 0n, hash))
        .to.be.revertedWithCustomError(contract, "TokenDoesNotExist")
        .withArgs(nonExistentId);
    });

    it("reverts with InvalidMetadataHash when metadataHash is bytes32(0)", async function () {
      const { contract, owner } = await loadFixture(deployVoucherNFT);
      const tokenId = await mintOne(contract, owner.address);

      // ethers.ZeroHash === "0x0000...0000" (32 bytes) — equivalent to bytes32(0)
      await expect(
        contract.updateValue(tokenId, 1000n, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(contract, "InvalidMetadataHash");
    });

    it("ValueUpdated event has all correct fields", async function () {
      const { contract, owner } = await loadFixture(deployVoucherNFT);
      const tokenId = await mintOne(contract, owner.address);
      const newValue = 500n;
      const hash = makeHash({ tokenId: 0, amount: 500 });

      await expect(contract.updateValue(tokenId, newValue, hash))
        .to.emit(contract, "ValueUpdated")
        .withArgs(tokenId, owner.address, 0n, newValue, hash);
    });

    it("allows newValue == oldValue — intentional re-record for audit trail", async function () {
      const { contract, owner } = await loadFixture(deployVoucherNFT);
      const tokenId = await mintOne(contract, owner.address);

      const hash1 = makeHash({ tokenId: 0, amount: 200, seq: 1 });
      const hash2 = makeHash({ tokenId: 0, amount: 200, seq: 2 }); // same amount, different hash

      await contract.updateValue(tokenId, 200n, hash1);

      // Re-record same value: should succeed (not a bug — see ValueUpdater.sol design note)
      await expect(contract.updateValue(tokenId, 200n, hash2)).to.not.be.reverted;

      // Balance unchanged; second ValueUpdated event was emitted with oldValue==newValue
      expect(await contract.getValue(tokenId)).to.equal(200n);

      const events = await contract.queryFilter(contract.filters.ValueUpdated(), 0, "latest");
      expect(events).to.have.length(2);
      expect(events[1].args.oldValue).to.equal(200n);
      expect(events[1].args.newValue).to.equal(200n);
    });

    it("sequential updates reflect in getValue", async function () {
      const { contract, owner } = await loadFixture(deployVoucherNFT);
      const tokenId = await mintOne(contract, owner.address);

      for (const val of [1000n, 800n, 300n, 0n]) {
        await contract.updateValue(tokenId, val, makeHash({ amount: Number(val) }));
      }
      expect(await contract.getValue(tokenId)).to.equal(0n);
    });
  });
};
