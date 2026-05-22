const path = require("path");
const ganache = require("ganache");
const HDWalletProvider = require("@truffle/hdwallet-provider");
const dotenv = require("dotenv");

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, ".env"),
  quiet: true,
});

const PRIVATE_KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/;

let testProvider;

function positiveIntegerEnv(name, defaultValue) {
  const rawValue = process.env[name] || String(defaultValue);
  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} 환경변수는 양의 정수여야 합니다.`);
  }
  return parsedValue;
}

const SEPOLIA_NETWORK_ID = positiveIntegerEnv("SEPOLIA_NETWORK_ID", 11155111);
const SEPOLIA_CONFIRMATIONS = positiveIntegerEnv("SEPOLIA_CONFIRMATIONS", 2);
const SEPOLIA_TIMEOUT_BLOCKS = positiveIntegerEnv("SEPOLIA_TIMEOUT_BLOCKS", 200);
const SEPOLIA_POLLING_INTERVAL_MS = positiveIntegerEnv(
  "SEPOLIA_POLLING_INTERVAL_MS",
  8000
);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} 환경변수를 설정해야 Sepolia 배포를 실행할 수 있습니다.`);
  }
  return value;
}

function sepoliaDeployerPrivateKey() {
  const privateKey = requiredEnv("SEPOLIA_DEPLOYER_PRIVATE_KEY");
  if (!PRIVATE_KEY_PATTERN.test(privateKey)) {
    throw new Error(
      "SEPOLIA_DEPLOYER_PRIVATE_KEY는 0x prefix 선택 가능 64자리 hex 형식이어야 합니다."
    );
  }
  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
}

function buildSepoliaProvider() {
  return new HDWalletProvider({
    privateKeys: [sepoliaDeployerPrivateKey()],
    providerOrUrl: requiredEnv("SEPOLIA_RPC_URL"),
    pollingInterval: SEPOLIA_POLLING_INTERVAL_MS,
  });
}

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
    sepolia: {
      provider: buildSepoliaProvider,
      network_id: SEPOLIA_NETWORK_ID,
      confirmations: SEPOLIA_CONFIRMATIONS,
      timeoutBlocks: SEPOLIA_TIMEOUT_BLOCKS,
      deploymentPollingInterval: SEPOLIA_POLLING_INTERVAL_MS,
      skipDryRun: true,
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
