const { deployVoucherNFT } = require("./fixture");

const deploymentTests = require("./deployment.test");
const roleManagementTests = require("./roleManagement.test");
const mintTests = require("./mint.test");
const updateValueTests = require("./updateValue.test");
const eventScanTests = require("./eventScan.test");

describe("VoucherNFT", function () {
  deploymentTests(deployVoucherNFT);
  roleManagementTests(deployVoucherNFT);
  mintTests(deployVoucherNFT);
  updateValueTests(deployVoucherNFT);
  eventScanTests(deployVoucherNFT);
});
