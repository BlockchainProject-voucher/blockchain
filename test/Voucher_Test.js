const fs = require("fs");
const os = require("os");
const path = require("path");

const Voucher = artifacts.require("Voucher");
const {
  canonicalItemSummary,
  FileUsageDetailStore,
  recordCommitmentHash,
  recordCommitmentHashFromRaw,
  usageHash,
  UsageHashVerifier,
} = require("./helpers/usageHashVerifier");

contract("Voucher", function ([deployer, user, otherUser, merchant, unapprovedMerchant]) {
  const PROGRAM_ID = 1;
  const PROGRAM_NAME = "Meal Voucher";
  const PROGRAM_AMOUNT = web3.utils.toBN(10000);
  const PROGRAM_SUPPLY = 10;
  const PROGRAM_CATEGORY = "food";
  const TOKEN_URI = "ipfs://voucher/1";
  const ZERO_BYTES32 = `0x${"0".repeat(64)}`;
  const DEFAULT_EXPIRY_OFFSET_SECONDS = 3600;

  let voucher;
  let chainId;

  before(async function () {
    chainId = await web3.eth.getChainId();
  });

  beforeEach(async function () {
    voucher = await Voucher.new({ from: deployer });
  });

  async function sendRpc(method, params) {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send({ jsonrpc: "2.0", method, params, id: Date.now() }, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (result.error) {
          reject(new Error(result.error.message));
          return;
        }
        resolve(result.result);
      });
    });
  }

  async function latestTimestamp() {
    const block = await web3.eth.getBlock("latest");
    return Number(block.timestamp);
  }

  async function futureTimestamp(seconds = DEFAULT_EXPIRY_OFFSET_SECONDS) {
    return (await latestTimestamp()) + seconds;
  }

  async function increaseTime(seconds) {
    await sendRpc("evm_increaseTime", [seconds]);
    await sendRpc("evm_mine", []);
  }

  async function expectRevert(promise, expectedReason) {
    try {
      await promise;
    } catch (error) {
      assert(error.message.includes(expectedReason), `expected "${expectedReason}" revert, got: ${error.message}`);
      return;
    }
    assert.fail(`expected revert: ${expectedReason}`);
  }

  async function createProgram(
    programId = PROGRAM_ID,
    amount = PROGRAM_AMOUNT,
    expiryOffset = DEFAULT_EXPIRY_OFFSET_SECONDS
  ) {
    const expiryDate = await futureTimestamp(expiryOffset);
    await voucher.createVoucherProgram(
      programId,
      PROGRAM_NAME,
      amount,
      expiryDate,
      PROGRAM_SUPPLY,
      PROGRAM_CATEGORY,
      { from: deployer }
    );
    return expiryDate;
  }

  async function mintVoucher(recipient = user, programId = PROGRAM_ID, uri = TOKEN_URI) {
    const receipt = await voucher.mintVoucher(programId, recipient, uri, { from: deployer });
    return receipt.logs.find((log) => log.event === "VoucherMinted").args.tokenId;
  }

  function voucherUsedLog(receipt) {
    return receipt.logs.find((log) => log.event === "VoucherUsed").args;
  }

  function usageHashFromEvent(eventArgs) {
    return usageHash(
      web3,
      {
        recordCommitmentHash: eventArgs.recordCommitmentHash,
        tokenId: eventArgs.tokenId,
        user: eventArgs.user,
        merchant: eventArgs.merchant,
        amount: eventArgs.amount,
        oldValue: eventArgs.oldValue,
        newValue: eventArgs.newValue,
        nonce: eventArgs.nonce,
      },
      chainId,
      voucher.address
    );
  }

  function usageDetail(overrides = {}) {
    return {
      recordId: "Voucher-Use:V1:Record-0001",
      merchantBusinessId: "Seoul-Food-001",
      terminalId: "",
      receiptNo: "",
      items: [{ sku: "MEAL-SET-A", name: "Meal Set A", qty: 1, amount: 3500 }],
      issuedAtBucket: 1778630400,
      ...overrides,
    };
  }

  function localStore(records) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bc-voucher-usage-store-"));
    const store = new FileUsageDetailStore(path.join(directory, "usage-details.json"));
    store.write(records);
    return store;
  }

  async function signUseVoucher({
    tokenId,
    signer,
    owner = user,
    merchantWallet,
    amount,
    recordCommitment,
    nonce,
    deadline,
  }) {
    const typedData = {
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        UseVoucher: [
          { name: "tokenId", type: "uint256" },
          { name: "user", type: "address" },
          { name: "merchant", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "recordCommitmentHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "UseVoucher",
      domain: { name: "Voucher", version: "1", chainId, verifyingContract: voucher.address },
      message: {
        tokenId: tokenId.toString(),
        user: owner,
        merchant: merchantWallet,
        amount: amount.toString(),
        recordCommitmentHash: recordCommitment,
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
    };

    const methods = [
      { name: "eth_signTypedData_v4", params: [signer, JSON.stringify(typedData)] },
      { name: "eth_signTypedData_v3", params: [signer, JSON.stringify(typedData)] },
      { name: "eth_signTypedData", params: [signer, typedData] },
    ];
    const errors = [];
    for (const method of methods) {
      try {
        return await sendRpc(method.name, method.params);
      } catch (error) {
        errors.push(`${method.name}: ${error.message}`);
      }
    }
    throw new Error(`EIP-712 signing failed: ${errors.join("; ")}`);
  }

  describe("canonical hash schema", function () {
    it("recalculates frozen recordCommitmentHash and usageHash vectors with ABI encoding", async function () {
      const fixedDetail = {
        detailSchemaVersion: 1,
        recordIdHash: "0xe1dedf2927e257fb1528e1bfc3072d3634e246a5cf689f57ddae74a18ace9d85",
        merchantBusinessIdHash: "0x7610063a057ec52024d577f38ed67a365934c1cd7486992d1a2bd84610406caa",
        terminalIdHash: "0x6d5b507dd4a592f37f7797b4054ea17252fdf7241eb9cfeff9ca9d99e16c2b79",
        receiptNoHash: "0x3852f607f37f33c972c759295e3a42b2db4949885fd8ee37cbb41d74a04dea1e",
        itemSummaryHash: "0x6ba09d5e6abfb862fc6869fc014c7a78025a3ca6608287f58e4f25c9c14ce505",
        issuedAtBucket: "1778630400",
      };
      const recordCommitment = recordCommitmentHash(web3, fixedDetail);
      assert.equal(recordCommitment, "0x30e5f83d19af406aaf67f55063c50784d33e8cd9b0a3649738dc8be1e3828037");

      const fixedUsageHash = usageHash(
        web3,
        {
          recordCommitmentHash: recordCommitment,
          tokenId: 1,
          user: "0x1111111111111111111111111111111111111111",
          merchant: "0x2222222222222222222222222222222222222222",
          amount: 3500,
          oldValue: 10000,
          newValue: 6500,
          nonce: 0,
        },
        5777,
        "0x3333333333333333333333333333333333333333"
      );
      assert.equal(fixedUsageHash, "0xe09d8107838119a10ab59e20c0db2c45ae023a2161b4f00c83f3a3a0dce1da86");

      const rawVectorCommitment = recordCommitmentHashFromRaw(
        web3,
        usageDetail({
          recordId: "  Voucher-Use:V1:Record-0001  ",
          merchantBusinessId: " Seoul-Food-001 ",
          terminalId: "",
          receiptNo: "",
          items: [{ sku: " MEAL-SET-A ", name: " Meal   Set A ", qty: 1, amount: 3500 }],
        })
      );
      assert.equal(
        canonicalItemSummary([{ sku: " MEAL-SET-A ", name: " Meal   Set A ", qty: 1, amount: 3500 }]),
        "meal-set-a:meal set a:qty=1:amount=3500"
      );
      assert.equal(rawVectorCommitment, "0x3117bf2a01d89cb5de1faddc90f3d30bb8fb70301d91da1f0f674588e66514a8");
    });
  });

  describe("owner permissions", function () {
    it("owner-only functions succeed for owner and revert for non-owner", async function () {
      const expiryDate = await futureTimestamp();
      const createReceipt = await voucher.createVoucherProgram(
        PROGRAM_ID,
        PROGRAM_NAME,
        PROGRAM_AMOUNT,
        expiryDate,
        PROGRAM_SUPPLY,
        PROGRAM_CATEGORY,
        { from: deployer }
      );
      assert.equal(createReceipt.logs[0].event, "VoucherProgramCreated");

      await expectRevert(
        voucher.createVoucherProgram(2, PROGRAM_NAME, PROGRAM_AMOUNT, expiryDate, PROGRAM_SUPPLY, PROGRAM_CATEGORY, {
          from: user,
        }),
        "Ownable: caller is not the owner"
      );

      const approveReceipt = await voucher.approveMerchant(merchant, true, { from: deployer });
      assert.equal(approveReceipt.logs[0].event, "MerchantApproved");
      assert.equal(await voucher.approvedMerchant(merchant), true);

      await expectRevert(
        voucher.approveMerchant(unapprovedMerchant, true, { from: user }),
        "Ownable: caller is not the owner"
      );

      const tokenId = await mintVoucher(user);
      assert.equal((await voucher.ownerOf(tokenId)).toLowerCase(), user.toLowerCase());

      await expectRevert(
        voucher.mintVoucher(PROGRAM_ID, otherUser, TOKEN_URI, { from: user }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("mint and read model", function () {
    it("stores owner, balance, voucher info, getTokenURI, tokenURI, and ABI entries", async function () {
      const expiryDate = await createProgram();
      const tokenId = await mintVoucher();

      assert.equal((await voucher.ownerOf(tokenId)).toLowerCase(), user.toLowerCase());
      assert.equal((await voucher.voucherValue(tokenId)).toString(), PROGRAM_AMOUNT.toString());
      assert.equal(await voucher.getTokenURI(tokenId), TOKEN_URI);
      assert.equal(await voucher.tokenURI(tokenId), TOKEN_URI);

      const info = await voucher.getVoucherInfo(tokenId);
      assert.equal(info.tokenId.toString(), tokenId.toString());
      assert.equal(info.programId.toString(), PROGRAM_ID.toString());
      assert.equal(info.programName, PROGRAM_NAME);
      assert.equal(info.amount.toString(), PROGRAM_AMOUNT.toString());
      assert.equal(info.expiryDate.toString(), expiryDate.toString());
      assert.equal(info.status.toString(), "1");
      assert.equal(info.owner.toLowerCase(), user.toLowerCase());

      const program = await voucher.getVoucherProgram(PROGRAM_ID);
      assert.equal(program.mintedSupply.toString(), "1");

      const validity = await voucher.isValidVoucher(tokenId);
      assert.equal(validity[0], true);

      const abiNames = Voucher.abi.map((item) => item.name).filter(Boolean);
      assert.includeMembers(abiNames, ["mintVoucher", "useVoucher", "useVoucherByMerchant", "VoucherUsed"]);
      assert.equal(abiNames.some((name) => ["setvouchervalue", "updatevalue"].includes(name.toLowerCase())), false);

      const useVoucherAbi = Voucher.abi.find((item) => item.name === "useVoucher");
      const merchantUseAbi = Voucher.abi.find((item) => item.name === "useVoucherByMerchant");
      const voucherUsedAbi = Voucher.abi.find((item) => item.name === "VoucherUsed");
      assert.equal(useVoucherAbi.inputs.some((input) => input.name === "usageHash"), false);
      assert.equal(merchantUseAbi.inputs.some((input) => input.name === "usageHash"), false);
      assert.deepEqual(
        voucherUsedAbi.inputs.map((input) => input.name),
        ["tokenId", "user", "merchant", "amount", "oldValue", "newValue", "nonce", "recordCommitmentHash", "usageHash"]
      );
    });
  });

  describe("direct useVoucher", function () {
    it("decreases balance, increments nonce, and emits contract-computed usageHash", async function () {
      await createProgram();
      await voucher.approveMerchant(merchant, true, { from: deployer });
      const tokenId = await mintVoucher();
      const amount = web3.utils.toBN(3500);
      const oldValue = PROGRAM_AMOUNT;
      const newValue = oldValue.sub(amount);
      const nonce = await voucher.useNonce(tokenId);
      const recordCommitment = recordCommitmentHashFromRaw(web3, usageDetail());

      const receipt = await voucher.useVoucher(tokenId, merchant, amount, recordCommitment, { from: user });
      const eventArgs = voucherUsedLog(receipt);
      const expectedUsageHash = usageHashFromEvent(eventArgs);

      assert.equal(eventArgs.tokenId.toString(), tokenId.toString());
      assert.equal(eventArgs.user.toLowerCase(), user.toLowerCase());
      assert.equal(eventArgs.merchant.toLowerCase(), merchant.toLowerCase());
      assert.equal(eventArgs.amount.toString(), amount.toString());
      assert.equal(eventArgs.oldValue.toString(), oldValue.toString());
      assert.equal(eventArgs.newValue.toString(), newValue.toString());
      assert.equal(eventArgs.nonce.toString(), nonce.toString());
      assert.equal(eventArgs.recordCommitmentHash, recordCommitment);
      assert.equal(eventArgs.usageHash, expectedUsageHash);
      assert.equal((await voucher.voucherValue(tokenId)).toString(), newValue.toString());
      assert.equal((await voucher.useNonce(tokenId)).toString(), "1");
    });

    it("reverts for non-owner, unapproved merchant, zero amount, zero record, insufficient balance, and expired voucher", async function () {
      await createProgram();
      await voucher.approveMerchant(merchant, true, { from: deployer });
      const tokenId = await mintVoucher();
      const recordCommitment = recordCommitmentHashFromRaw(web3, usageDetail({ recordId: "negative-direct" }));

      await expectRevert(
        voucher.useVoucher(tokenId, merchant, 1, recordCommitment, { from: otherUser }),
        "Voucher: caller is not owner"
      );
      assert.equal((await voucher.voucherValue(tokenId)).toString(), PROGRAM_AMOUNT.toString());

      await expectRevert(
        voucher.useVoucher(tokenId, unapprovedMerchant, 1, recordCommitment, { from: user }),
        "Voucher: unapproved merchant"
      );
      await expectRevert(
        voucher.useVoucher(tokenId, merchant, 0, recordCommitment, { from: user }),
        "Voucher: amount is zero"
      );
      await expectRevert(
        voucher.useVoucher(tokenId, merchant, 1, ZERO_BYTES32, { from: user }),
        "Voucher: empty record commitment"
      );
      await expectRevert(
        voucher.useVoucher(tokenId, merchant, PROGRAM_AMOUNT.add(web3.utils.toBN(1)), recordCommitment, { from: user }),
        "Voucher: insufficient balance"
      );

      await increaseTime(DEFAULT_EXPIRY_OFFSET_SECONDS + 400);
      await expectRevert(
        voucher.useVoucher(tokenId, merchant, 1, recordCommitment, { from: user }),
        "Voucher: expired voucher"
      );

      const validity = await voucher.isValidVoucher(tokenId);
      assert.equal(validity[0], false);
      assert.equal(validity[1].status.toString(), "3");
    });
  });

  describe("merchant EIP-712 useVoucherByMerchant", function () {
    it("succeeds with valid owner signature, emits usageHash, and rejects replay", async function () {
      await createProgram();
      await voucher.approveMerchant(merchant, true, { from: deployer });
      const tokenId = await mintVoucher();
      const amount = web3.utils.toBN(4000);
      const oldValue = PROGRAM_AMOUNT;
      const newValue = oldValue.sub(amount);
      const nonce = await voucher.useNonce(tokenId);
      const deadline = await futureTimestamp();
      const recordCommitment = recordCommitmentHashFromRaw(web3, usageDetail({ recordId: "merchant-use-1" }));
      const signature = await signUseVoucher({
        tokenId,
        signer: user,
        merchantWallet: merchant,
        amount,
        recordCommitment,
        nonce,
        deadline,
      });

      const receipt = await voucher.useVoucherByMerchant(tokenId, amount, recordCommitment, deadline, signature, {
        from: merchant,
      });
      const eventArgs = voucherUsedLog(receipt);

      assert.equal(eventArgs.recordCommitmentHash, recordCommitment);
      assert.equal(eventArgs.usageHash, usageHashFromEvent(eventArgs));
      assert.equal(eventArgs.user.toLowerCase(), user.toLowerCase());
      assert.equal(eventArgs.merchant.toLowerCase(), merchant.toLowerCase());
      assert.equal((await voucher.useNonce(tokenId)).toString(), "1");
      assert.equal((await voucher.voucherValue(tokenId)).toString(), newValue.toString());

      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, recordCommitment, deadline, signature, { from: merchant }),
        "Voucher: invalid signature"
      );
    });

    it("reverts for wrong signer, unapproved merchant, expired deadline, zero record, and insufficient balance", async function () {
      await createProgram();
      await voucher.approveMerchant(merchant, true, { from: deployer });

      const tokenId = await mintVoucher();
      const amount = web3.utils.toBN(1000);
      const nonce = await voucher.useNonce(tokenId);
      const deadline = await futureTimestamp();
      const recordCommitment = recordCommitmentHashFromRaw(web3, usageDetail({ recordId: "merchant-use-negative" }));
      const wrongSignature = await signUseVoucher({
        tokenId,
        signer: otherUser,
        owner: user,
        merchantWallet: merchant,
        amount,
        recordCommitment,
        nonce,
        deadline,
      });

      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, recordCommitment, deadline, wrongSignature, { from: merchant }),
        "Voucher: invalid signature"
      );

      const unapprovedSignature = await signUseVoucher({
        tokenId,
        signer: user,
        merchantWallet: unapprovedMerchant,
        amount,
        recordCommitment,
        nonce,
        deadline,
      });
      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, recordCommitment, deadline, unapprovedSignature, {
          from: unapprovedMerchant,
        }),
        "Voucher: unapproved merchant"
      );

      const expiredDeadline = (await latestTimestamp()) - 1;
      const expiredSignature = await signUseVoucher({
        tokenId,
        signer: user,
        merchantWallet: merchant,
        amount,
        recordCommitment,
        nonce,
        deadline: expiredDeadline,
      });
      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, recordCommitment, expiredDeadline, expiredSignature, {
          from: merchant,
        }),
        "Voucher: signature expired"
      );

      const zeroRecordSignature = await signUseVoucher({
        tokenId,
        signer: user,
        merchantWallet: merchant,
        amount,
        recordCommitment: ZERO_BYTES32,
        nonce,
        deadline,
      });
      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, ZERO_BYTES32, deadline, zeroRecordSignature, { from: merchant }),
        "Voucher: empty record commitment"
      );

      const tooMuch = PROGRAM_AMOUNT.add(web3.utils.toBN(1));
      const tooMuchSignature = await signUseVoucher({
        tokenId,
        signer: user,
        merchantWallet: merchant,
        amount: tooMuch,
        recordCommitment,
        nonce,
        deadline,
      });
      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, tooMuch, recordCommitment, deadline, tooMuchSignature, { from: merchant }),
        "Voucher: insufficient balance"
      );
    });

    it("rejects tampered amount, merchant, record commitment, deadline, and nonce", async function () {
      await createProgram();
      await voucher.approveMerchant(merchant, true, { from: deployer });
      await voucher.approveMerchant(unapprovedMerchant, true, { from: deployer });

      const tokenId = await mintVoucher();
      const amount = web3.utils.toBN(1000);
      const nonce = await voucher.useNonce(tokenId);
      const deadline = await futureTimestamp();
      const recordCommitment = recordCommitmentHashFromRaw(web3, usageDetail({ recordId: "merchant-use-tamper" }));
      const tamperedRecordCommitment = recordCommitmentHashFromRaw(
        web3,
        usageDetail({ recordId: "merchant-use-tampered-record" })
      );
      const signature = await signUseVoucher({
        tokenId,
        signer: user,
        merchantWallet: merchant,
        amount,
        recordCommitment,
        nonce,
        deadline,
      });
      const wrongNonceSignature = await signUseVoucher({
        tokenId,
        signer: user,
        merchantWallet: merchant,
        amount,
        recordCommitment,
        nonce: web3.utils.toBN(1),
        deadline,
      });

      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount.add(web3.utils.toBN(1)), recordCommitment, deadline, signature, {
          from: merchant,
        }),
        "Voucher: invalid signature"
      );
      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, recordCommitment, deadline, signature, {
          from: unapprovedMerchant,
        }),
        "Voucher: invalid signature"
      );
      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, tamperedRecordCommitment, deadline, signature, { from: merchant }),
        "Voucher: invalid signature"
      );
      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, recordCommitment, deadline + 1, signature, { from: merchant }),
        "Voucher: invalid signature"
      );
      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, recordCommitment, deadline, wrongNonceSignature, {
          from: merchant,
        }),
        "Voucher: invalid signature"
      );
    });
  });

  describe("local usage verifier integration", function () {
    it("verifies matching Ganache VoucherUsed event against a file-backed usage detail store", async function () {
      await createProgram();
      await voucher.approveMerchant(merchant, true, { from: deployer });
      const tokenId = await mintVoucher();
      const detail = usageDetail({ recordId: "verifier-ok" });
      const recordCommitment = recordCommitmentHashFromRaw(web3, detail);

      await voucher.useVoucher(tokenId, merchant, 3500, recordCommitment, { from: user });

      const verifier = new UsageHashVerifier({
        web3,
        chainId,
        contractAddress: voucher.address,
        store: localStore([{ recordCommitmentHash: recordCommitment, detail }]),
      });
      const events = await voucher.getPastEvents("VoucherUsed", { fromBlock: 0, toBlock: "latest" });
      const verification = verifier.verify(events);

      assert.deepEqual(
        verification.results.map((result) => result.status),
        ["VERIFIED"]
      );
      assert.deepEqual(verification.findings, []);
    });

    it("returns MISMATCH, MISSING_DB, MISSING_ONCHAIN, and duplicate commitment findings", async function () {
      await createProgram(2);
      await voucher.approveMerchant(merchant, true, { from: deployer });
      const firstTokenId = await mintVoucher(user, 2, "ipfs://voucher/verifier/1");
      const secondTokenId = await mintVoucher(user, 2, "ipfs://voucher/verifier/2");
      const detail = usageDetail({ recordId: "verifier-duplicate" });
      const duplicateCommitment = recordCommitmentHashFromRaw(web3, detail);
      const missingDbCommitment = recordCommitmentHashFromRaw(web3, usageDetail({ recordId: "verifier-missing-db" }));
      const orphanDetail = usageDetail({ recordId: "verifier-missing-onchain" });
      const orphanCommitment = recordCommitmentHashFromRaw(web3, orphanDetail);

      await voucher.useVoucher(firstTokenId, merchant, 1000, duplicateCommitment, { from: user });
      await voucher.useVoucher(secondTokenId, merchant, 1000, duplicateCommitment, { from: user });
      await voucher.useVoucher(firstTokenId, merchant, 500, missingDbCommitment, { from: user });

      const verifier = new UsageHashVerifier({
        web3,
        chainId,
        contractAddress: voucher.address,
        store: localStore([
          {
            recordCommitmentHash: duplicateCommitment,
            detail: usageDetail({ recordId: "verifier-duplicate-mutated" }),
          },
          { recordCommitmentHash: orphanCommitment, detail: orphanDetail },
        ]),
      });
      const events = await voucher.getPastEvents("VoucherUsed", { fromBlock: 0, toBlock: "latest" });
      const verification = verifier.verify(events);
      const statuses = verification.results.map((result) => result.status);

      assert.equal(statuses.filter((status) => status === "MISMATCH").length, 2);
      assert.equal(statuses.includes("MISSING_DB"), true);
      assert.equal(statuses.includes("MISSING_ONCHAIN"), true);
      assert.deepEqual(
        verification.findings.map((finding) => finding.finding),
        ["DUPLICATE_COMMITMENT"]
      );
    });
  });
});
