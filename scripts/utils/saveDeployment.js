const fs = require("fs");
const path = require("path");

const DEPLOYMENTS_DIR = path.join(__dirname, "../../deployments");

function getDeploymentPath(network) {
  return path.join(DEPLOYMENTS_DIR, `${network}.json`);
}

/**
 * Persists deployment info for a network to deployments/<network>.json.
 */
function saveDeployment(network, address, txHash, blockNumber) {
  if (!fs.existsSync(DEPLOYMENTS_DIR)) {
    fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  }

  const data = {
    network,
    address,
    txHash,
    blockNumber,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(getDeploymentPath(network), JSON.stringify(data, null, 2));
  console.log(`  Deployment info saved → deployments/${network}.json`);
}

/**
 * Loads deployment info for a network from deployments/<network>.json.
 * Throws if the file does not exist.
 */
function loadDeployment(network) {
  const filePath = getDeploymentPath(network);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `No deployment found for network "${network}". Run deploy:${network} first.`
    );
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

module.exports = { saveDeployment, loadDeployment };
