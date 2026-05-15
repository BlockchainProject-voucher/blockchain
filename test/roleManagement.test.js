const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

module.exports = function roleManagementTests(deployVoucherNFT) {
  describe("Role Management", function () {
    const VALID_HASH = ethers.keccak256(ethers.toUtf8Bytes('{"tokenId":0,"amount":100}'));

    it("grantUpdaterRole enables updateValue for the grantee", async function () {
      const { contract, owner, updater, UPDATER_ROLE } = await loadFixture(deployVoucherNFT);

      await (await contract.mintVoucher(owner.address, "ipfs://test")).wait();
      const tokenId = 0n;

      await contract.grantUpdaterRole(updater.address);
      expect(await contract.hasRole(UPDATER_ROLE, updater.address)).to.be.true;

      await expect(
        contract.connect(updater).updateValue(tokenId, 500n, VALID_HASH)
      ).to.not.be.reverted;
    });

    it("revokeUpdaterRole blocks further updateValue calls", async function () {
      const { contract, owner, updater } = await loadFixture(deployVoucherNFT);

      await (await contract.mintVoucher(owner.address, "ipfs://test")).wait();
      const tokenId = 0n;

      await contract.grantUpdaterRole(updater.address);
      await contract.revokeUpdaterRole(updater.address);

      await expect(
        contract.connect(updater).updateValue(tokenId, 500n, VALID_HASH)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("non-admin cannot call grantUpdaterRole", async function () {
      const { contract, user } = await loadFixture(deployVoucherNFT);

      await expect(
        contract.connect(user).grantUpdaterRole(user.address)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("non-admin cannot call grantMinterRole", async function () {
      const { contract, user } = await loadFixture(deployVoucherNFT);

      await expect(
        contract.connect(user).grantMinterRole(user.address)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("non-admin cannot call revokeUpdaterRole", async function () {
      const { contract, user } = await loadFixture(deployVoucherNFT);

      await expect(
        contract.connect(user).revokeUpdaterRole(user.address)
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });
  });
};
