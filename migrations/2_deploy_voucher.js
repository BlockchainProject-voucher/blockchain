const Voucher = artifacts.require("Voucher");

module.exports = async function (deployer) {
  await deployer.deploy(Voucher);
};
