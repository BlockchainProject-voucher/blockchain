const { ethers, network } = require("hardhat");
const { grantInitialRoles, verifyRoles } = require("./utils/roleSetup");
const { saveDeployment } = require("./utils/saveDeployment");

async function main() {
  const [deployer] = await ethers.getSigners();
  const backendWallet = process.env.BACKEND_WALLET_ADDRESS || deployer.address;
  const contractName = process.env.CONTRACT_NAME || "Voucher";
  const contractSymbol = process.env.CONTRACT_SYMBOL || "VCH";

  console.log("\n─── VoucherNFT Deployment ───────────────────────────────────");
  console.log(`  Network:        ${network.name}`);
  console.log(`  Deployer:       ${deployer.address}`);
  console.log(`  Backend wallet: ${backendWallet}`);
  console.log(`  Name / Symbol:  ${contractName} / ${contractSymbol}`);

  // 1. Deploy
  console.log("\n[1/3] Deploying VoucherNFT...");
  const VoucherNFT = await ethers.getContractFactory("VoucherNFT");
  const contract = await VoucherNFT.deploy(contractName, contractSymbol);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = await deployTx.wait();

  console.log(`  Contract address : ${address}`);
  console.log(`  Block number     : ${receipt.blockNumber}`);
  console.log(`  Transaction hash : ${deployTx.hash}`);

  // 2. Role setup
  console.log("\n[2/3] Setting up roles...");
  if (backendWallet.toLowerCase() !== deployer.address.toLowerCase()) {
    await grantInitialRoles(contract, backendWallet);
  } else {
    console.log("  Backend wallet == deployer. Roles already granted by constructor.");
  }
  await verifyRoles(contract, backendWallet);

  // 3. Persist
  console.log("\n[3/3] Saving deployment info...");
  saveDeployment(network.name, address, deployTx.hash, receipt.blockNumber);

  console.log("\n─── Deployment complete ─────────────────────────────────────");
  console.log("  Share with backend team:");
  console.log(`    Contract address : ${address}`);
  console.log(`    ABI path         : artifacts/contracts/VoucherNFT.sol/VoucherNFT.json`);
  console.log("─────────────────────────────────────────────────────────────\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
