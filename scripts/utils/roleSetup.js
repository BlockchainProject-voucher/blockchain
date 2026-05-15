/**
 * Grants MINTER_ROLE and UPDATER_ROLE to the backend wallet.
 * Called after deployment when backendWallet != deployer.
 */
async function grantInitialRoles(contract, backendWallet) {
  console.log(`  Granting MINTER_ROLE  → ${backendWallet}`);
  await (await contract.grantMinterRole(backendWallet)).wait();
  console.log("  ✓ MINTER_ROLE granted");

  console.log(`  Granting UPDATER_ROLE → ${backendWallet}`);
  await (await contract.grantUpdaterRole(backendWallet)).wait();
  console.log("  ✓ UPDATER_ROLE granted");
}

/**
 * Reads and logs all three role assignments for `address`.
 * Returns { hasAdmin, hasMinter, hasUpdater }.
 */
async function verifyRoles(contract, address) {
  const MINTER_ROLE = await contract.MINTER_ROLE();
  const UPDATER_ROLE = await contract.UPDATER_ROLE();
  const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();

  const hasAdmin = await contract.hasRole(DEFAULT_ADMIN_ROLE, address);
  const hasMinter = await contract.hasRole(MINTER_ROLE, address);
  const hasUpdater = await contract.hasRole(UPDATER_ROLE, address);

  console.log(`  Role verification for ${address}:`);
  console.log(`    DEFAULT_ADMIN_ROLE : ${hasAdmin}`);
  console.log(`    MINTER_ROLE        : ${hasMinter}`);
  console.log(`    UPDATER_ROLE       : ${hasUpdater}`);

  return { hasAdmin, hasMinter, hasUpdater };
}

module.exports = { grantInitialRoles, verifyRoles };
