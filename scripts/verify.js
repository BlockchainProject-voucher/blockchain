const { run, network } = require("hardhat");
const { loadDeployment } = require("./utils/saveDeployment");

async function main() {
  const deployment = loadDeployment(network.name);
  const contractName = process.env.CONTRACT_NAME || "Voucher";
  const contractSymbol = process.env.CONTRACT_SYMBOL || "VCH";

  console.log(`\nVerifying VoucherNFT on ${network.name}...`);
  console.log(`  Contract address : ${deployment.address}`);
  console.log(`  Deployed at      : ${deployment.deployedAt}`);

  await run("verify:verify", {
    address: deployment.address,
    constructorArguments: [contractName, contractSymbol],
  });

  console.log("Verification complete. Check Etherscan for the verified source.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
