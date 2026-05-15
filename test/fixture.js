const { ethers } = require("hardhat");

/**
 * Deploys VoucherNFT and returns all signers + role hashes.
 * Used by every sub-test file via loadFixture for state isolation.
 */
async function deployVoucherNFT() {
  const [owner, minter, updater, user] = await ethers.getSigners();

  const VoucherNFT = await ethers.getContractFactory("VoucherNFT");
  const contract = await VoucherNFT.deploy("Voucher", "VCH");
  await contract.waitForDeployment();

  const MINTER_ROLE = await contract.MINTER_ROLE();
  const UPDATER_ROLE = await contract.UPDATER_ROLE();
  const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();

  return { contract, owner, minter, updater, user, MINTER_ROLE, UPDATER_ROLE, DEFAULT_ADMIN_ROLE };
}

module.exports = { deployVoucherNFT };
