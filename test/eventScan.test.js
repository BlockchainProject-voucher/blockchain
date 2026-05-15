/*
 * ─── 설계 판단 근거 (Opus) ──────────────────────────────────────────────────────
 *
 * (1) queryFilter에서 indexed tokenId로 필터링
 *   contract.filters.EventName(arg0, arg1, ...) 패턴을 사용한다.
 *   indexed가 아닌 파라미터 자리는 null로 채운다.
 *     ValueUpdated(tokenId, updater, ...) → filters.ValueUpdated(targetTokenId)
 *     Transfer(from, to, tokenId)         → filters.Transfer(null, null, targetTokenId)
 *   [주의]: ethers v6에서 필터 인자는 반드시 BigInt로 전달한다.
 *   number 타입은 내부 변환 과정에서 오작동할 수 있다.
 *
 * (2) 백엔드 Scanner 시뮬레이션
 *   event.args.fieldName으로 파라미터에 접근한다.
 *   ethers v6는 uint256을 BigInt로 반환하므로 === 또는 .equal() 비교가 필요하다.
 *   [선택 근거]: 실제 백엔드 polling 코드와 동일한 접근 패턴을 테스트해야
 *   통합 시점에 파싱 오류가 발생하지 않는다.
 *   event.blockNumber(number)와 event.transactionHash(string) 타입도 검증한다.
 *
 * (3) 이벤트 순서/내용 검증 방법
 *   [선택 근거]: BigInt를 포함한 args 객체에 대한 deep.equal은 타입 불일치 위험이 있다.
 *   필드별 개별 expect를 사용해 실패 지점을 명확히 드러내고,
 *   순서는 인덱스로 검증한다.
 * ────────────────────────────────────────────────────────────────────────────────
 */

const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

function makeHash(data) {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(data)));
}

module.exports = function eventScanTests(deployVoucherNFT) {
  describe("Event Scanning (Backend Scanner Simulation)", function () {
    it("queryFilter(Transfer) collects all mint events in correct order", async function () {
      const { contract, user } = await loadFixture(deployVoucherNFT);

      for (let i = 0; i < 3; i++) {
        await (await contract.mintVoucher(user.address, `ipfs://meta/${i}`)).wait();
      }

      const events = await contract.queryFilter(contract.filters.Transfer(), 0, "latest");
      expect(events).to.have.length(3);

      for (let i = 0; i < 3; i++) {
        expect(events[i].args.from).to.equal(ethers.ZeroAddress);
        expect(events[i].args.to).to.equal(user.address);
        expect(events[i].args.tokenId).to.equal(BigInt(i));
      }
    });

    it("queryFilter(ValueUpdated) collects all update events with correct metadataHash", async function () {
      const { contract, owner } = await loadFixture(deployVoucherNFT);

      await (await contract.mintVoucher(owner.address, "ipfs://meta/0")).wait();
      const tokenId = 0n;

      const hashes = [
        makeHash({ tokenId: 0, amount: 1000, seq: 1 }),
        makeHash({ tokenId: 0, amount: 800, seq: 2 }),
        makeHash({ tokenId: 0, amount: 500, seq: 3 }),
      ];
      const amounts = [1000n, 800n, 500n];

      for (let i = 0; i < hashes.length; i++) {
        await (await contract.updateValue(tokenId, amounts[i], hashes[i])).wait();
      }

      const events = await contract.queryFilter(contract.filters.ValueUpdated(), 0, "latest");
      expect(events).to.have.length(3);

      for (let i = 0; i < 3; i++) {
        expect(events[i].args.tokenId).to.equal(tokenId);
        expect(events[i].args.metadataHash).to.equal(hashes[i]);
        expect(events[i].args.newValue).to.equal(amounts[i]);
      }
    });

    it("filters ValueUpdated by indexed tokenId — returns only matching events", async function () {
      const { contract, user } = await loadFixture(deployVoucherNFT);

      // Mint 3 tokens (ids: 0, 1, 2)
      for (let i = 0; i < 3; i++) {
        await (await contract.mintVoucher(user.address, `ipfs://meta/${i}`)).wait();
      }

      // Update only token 1
      const targetId = 1n;
      const hash = makeHash({ tokenId: 1, amount: 999 });
      await (await contract.updateValue(targetId, 999n, hash)).wait();

      // [설계 근거]: BigInt 인자를 사용해 indexed tokenId로 필터링한다.
      const filtered = await contract.queryFilter(
        contract.filters.ValueUpdated(targetId),
        0,
        "latest"
      );

      expect(filtered).to.have.length(1);
      expect(filtered[0].args.tokenId).to.equal(targetId);
      expect(filtered[0].args.metadataHash).to.equal(hash);
    });

    it("event.args fields are accessible in the pattern backend Scanner uses", async function () {
      const { contract, owner } = await loadFixture(deployVoucherNFT);

      await (await contract.mintVoucher(owner.address, "ipfs://meta/0")).wait();
      const tokenId = 0n;
      const newValue = 750n;
      const hash = makeHash({ tokenId: 0, amount: 750 });

      await (await contract.updateValue(tokenId, newValue, hash)).wait();

      const events = await contract.queryFilter(contract.filters.ValueUpdated(), 0, "latest");
      const event = events[0];

      // Backend Scanner field access pattern — all types verified
      expect(event.args.tokenId).to.equal(tokenId);           // BigInt
      expect(event.args.updater).to.equal(owner.address);     // string (checksummed address)
      expect(event.args.oldValue).to.equal(0n);               // BigInt
      expect(event.args.newValue).to.equal(newValue);         // BigInt
      expect(event.args.metadataHash).to.equal(hash);         // bytes32 hex string
      expect(typeof event.blockNumber).to.equal("number");    // block number as JS number
      expect(typeof event.transactionHash).to.equal("string"); // tx hash as hex string
    });

    it("filters Transfer by indexed tokenId to verify a specific mint", async function () {
      const { contract, user } = await loadFixture(deployVoucherNFT);

      for (let i = 0; i < 3; i++) {
        await (await contract.mintVoucher(user.address, `ipfs://meta/${i}`)).wait();
      }

      const targetId = 1n;
      const filtered = await contract.queryFilter(
        contract.filters.Transfer(null, null, targetId),
        0,
        "latest"
      );

      expect(filtered).to.have.length(1);
      expect(filtered[0].args.tokenId).to.equal(targetId);
      expect(filtered[0].args.to).to.equal(user.address);
      expect(filtered[0].args.from).to.equal(ethers.ZeroAddress);
    });
  });
};
