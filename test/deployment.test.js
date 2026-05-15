const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

module.exports = function deploymentTests(deployVoucherNFT) {
  describe("Deployment", function () {
    it("deployer holds DEFAULT_ADMIN_ROLE, MINTER_ROLE, and UPDATER_ROLE", async function () {
      const { contract, owner, MINTER_ROLE, UPDATER_ROLE, DEFAULT_ADMIN_ROLE } =
        await loadFixture(deployVoucherNFT);

      expect(await contract.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await contract.hasRole(MINTER_ROLE, owner.address)).to.be.true;
      expect(await contract.hasRole(UPDATER_ROLE, owner.address)).to.be.true;
    });

    it("name and symbol are set correctly", async function () {
      const { contract } = await loadFixture(deployVoucherNFT);
      expect(await contract.name()).to.equal("Voucher");
      expect(await contract.symbol()).to.equal("VCH");
    });

    it("first minted tokenId is 0", async function () {
      const { contract, owner } = await loadFixture(deployVoucherNFT);
      const tx = await contract.mintVoucher(owner.address, "ipfs://test");
      const receipt = await tx.wait();

      const transferSig = ethers.id("Transfer(address,address,uint256)");
      const transferLog = receipt.logs.find((l) => l.topics[0] === transferSig);
      const tokenId = BigInt(transferLog.topics[3]);

      expect(tokenId).to.equal(0n);
    });
  });
};
