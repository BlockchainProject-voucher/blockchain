const SangToken = artifacts.require("SangToken");
const Ticket = artifacts.require("Ticket");

module.exports = async function (deployer) {
  await deployer.deploy(SangToken, "SANGMINTOKEN", "SANGMIN");
  await deployer.deploy(Ticket);
};