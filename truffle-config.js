const ganache = require("ganache");

let testProvider;

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*",
    },
    test: {
      provider: () => {
        if (!testProvider) {
          testProvider = ganache.provider({
            chain: { chainId: 5777, networkId: 5777 },
            logging: { quiet: true },
          });
        }
        return testProvider;
      },
      network_id: 5777,
    },
  },
  mocha: {
    // timeout: 100000
  },
  compilers: {
    solc: {
      version: "0.8.19",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        viaIR: true,
      },
    },
  },
};
