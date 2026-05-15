const fs = require("fs");

const ABSENT_SENTINEL = "__BCVOUCHER_ABSENT_V1__";
const DETAIL_SCHEMA_VERSION = 1;
const DETAIL_HASH_TYPES = ["uint16", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "uint64"];
const USAGE_HASH_TYPES = [
  "bytes32",
  "uint256",
  "address",
  "address",
  "uint256",
  "uint256",
  "uint256",
  "uint256",
  "uint256",
  "address",
];

function normalizeString(value, { lowercase = false, collapseWhitespace = false, absent = false } = {}) {
  let normalized = String(value || "").normalize("NFC").trim();
  if (!normalized && absent) {
    return ABSENT_SENTINEL;
  }
  if (collapseWhitespace) {
    normalized = normalized.replace(/\s+/g, " ");
  }
  return lowercase ? normalized.toLowerCase() : normalized;
}

function hashString(web3, value) {
  return web3.utils.keccak256(value);
}

function canonicalItemSummary(items) {
  return items
    .map((item) => {
      const sku = normalizeString(item.sku, { lowercase: true });
      const name = normalizeString(item.name, { lowercase: true, collapseWhitespace: true });
      return {
        sortKey: `${sku}|${name}`,
        value: `${sku}:${name}:qty=${String(item.qty)}:amount=${String(item.amount)}`,
      };
    })
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map((item) => item.value)
    .join("|");
}

function canonicalUsageDetail(web3, rawDetail) {
  return {
    detailSchemaVersion: DETAIL_SCHEMA_VERSION,
    recordIdHash: hashString(web3, normalizeString(rawDetail.recordId)),
    merchantBusinessIdHash: hashString(web3, normalizeString(rawDetail.merchantBusinessId, { lowercase: true })),
    terminalIdHash: hashString(web3, normalizeString(rawDetail.terminalId, { lowercase: true, absent: true })),
    receiptNoHash: hashString(web3, normalizeString(rawDetail.receiptNo, { absent: true })),
    itemSummaryHash: hashString(web3, canonicalItemSummary(rawDetail.items)),
    issuedAtBucket: String(rawDetail.issuedAtBucket),
  };
}

function recordCommitmentHash(web3, detail) {
  const encoded = web3.eth.abi.encodeParameters(DETAIL_HASH_TYPES, [
    detail.detailSchemaVersion,
    detail.recordIdHash,
    detail.merchantBusinessIdHash,
    detail.terminalIdHash,
    detail.receiptNoHash,
    detail.itemSummaryHash,
    detail.issuedAtBucket,
  ]);
  return web3.utils.keccak256(encoded);
}

function recordCommitmentHashFromRaw(web3, rawDetail) {
  return recordCommitmentHash(web3, canonicalUsageDetail(web3, rawDetail));
}

function usageHash(web3, usage, chainId, contractAddress) {
  const encoded = web3.eth.abi.encodeParameters(USAGE_HASH_TYPES, [
    usage.recordCommitmentHash,
    usage.tokenId.toString(),
    usage.user,
    usage.merchant,
    usage.amount.toString(),
    usage.oldValue.toString(),
    usage.newValue.toString(),
    usage.nonce.toString(),
    String(chainId),
    contractAddress,
  ]);
  return web3.utils.keccak256(encoded);
}

class FileUsageDetailStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  write(records) {
    fs.writeFileSync(this.filePath, JSON.stringify({ records }, null, 2));
  }

  read() {
    return JSON.parse(fs.readFileSync(this.filePath, "utf8")).records;
  }
}

class UsageHashVerifier {
  constructor({ web3, chainId, contractAddress, store }) {
    this.web3 = web3;
    this.chainId = chainId;
    this.contractAddress = contractAddress;
    this.store = store;
  }

  verify(events) {
    const records = this.store.read();
    const recordsByCommitment = new Map(records.map((record) => [record.recordCommitmentHash.toLowerCase(), record]));
    const eventsByCommitment = new Map();
    const results = [];
    const findings = [];

    for (const event of events) {
      const commitment = event.returnValues.recordCommitmentHash.toLowerCase();
      const sameCommitmentEvents = eventsByCommitment.get(commitment) || [];
      sameCommitmentEvents.push(event);
      eventsByCommitment.set(commitment, sameCommitmentEvents);
    }

    for (const [commitment, sameCommitmentEvents] of eventsByCommitment.entries()) {
      if (sameCommitmentEvents.length > 1) {
        findings.push({
          finding: "DUPLICATE_COMMITMENT",
          recordCommitmentHash: commitment,
          eventCount: sameCommitmentEvents.length,
        });
      }
    }

    for (const event of events) {
      const values = event.returnValues;
      const commitment = values.recordCommitmentHash.toLowerCase();
      const record = recordsByCommitment.get(commitment);
      if (!record) {
        results.push({
          status: "MISSING_DB",
          txHash: event.transactionHash,
          tokenId: values.tokenId.toString(),
          recordCommitmentHash: values.recordCommitmentHash,
        });
        continue;
      }

      const expectedRecordCommitmentHash = recordCommitmentHashFromRaw(this.web3, record.detail);
      const expectedUsageHash = usageHash(
        this.web3,
        {
          recordCommitmentHash: values.recordCommitmentHash,
          tokenId: values.tokenId,
          user: values.user,
          merchant: values.merchant,
          amount: values.amount,
          oldValue: values.oldValue,
          newValue: values.newValue,
          nonce: values.nonce,
        },
        this.chainId,
        this.contractAddress
      );
      const status =
        expectedRecordCommitmentHash.toLowerCase() === values.recordCommitmentHash.toLowerCase() &&
        expectedUsageHash.toLowerCase() === values.usageHash.toLowerCase()
          ? "VERIFIED"
          : "MISMATCH";

      results.push({
        status,
        txHash: event.transactionHash,
        tokenId: values.tokenId.toString(),
        recordCommitmentHash: values.recordCommitmentHash,
        expectedRecordCommitmentHash,
        actualUsageHash: values.usageHash,
        expectedUsageHash,
      });
    }

    for (const record of records) {
      if (!eventsByCommitment.has(record.recordCommitmentHash.toLowerCase())) {
        results.push({
          status: "MISSING_ONCHAIN",
          recordCommitmentHash: record.recordCommitmentHash,
        });
      }
    }

    return { results, findings };
  }
}

module.exports = {
  ABSENT_SENTINEL,
  canonicalItemSummary,
  canonicalUsageDetail,
  FileUsageDetailStore,
  recordCommitmentHash,
  recordCommitmentHashFromRaw,
  usageHash,
  UsageHashVerifier,
};
