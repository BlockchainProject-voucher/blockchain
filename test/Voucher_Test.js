const Voucher = artifacts.require("Voucher");

contract("Voucher", function ([deployer, user, otherUser, merchant, unapprovedMerchant]) {
  const PROGRAM_ID = 1;
  const PROGRAM_NAME = "Meal Voucher";
  const PROGRAM_AMOUNT = web3.utils.toBN(10000);
  const PROGRAM_SUPPLY = 10;
  const PROGRAM_CATEGORY = "food";
  const TOKEN_URI = "ipfs://voucher/1";
  const ZERO_HASH = web3.utils.keccak256("zero-hash");

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

  async function futureTimestamp(seconds = 3600) {
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

  async function createProgram(programId = PROGRAM_ID, amount = PROGRAM_AMOUNT, expiryOffset = 3600) {
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

  function metadataHash({ recordId, tokenId, owner, merchantWallet, amount, oldValue, newValue, nonce }) {
    return web3.utils.soliditySha3(
      { type: "bytes32", value: web3.utils.keccak256(recordId) },
      { type: "uint256", value: tokenId },
      { type: "address", value: owner },
      { type: "address", value: merchantWallet },
      { type: "uint256", value: amount },
      { type: "uint256", value: oldValue },
      { type: "uint256", value: newValue },
      { type: "uint256", value: nonce },
      { type: "uint256", value: chainId },
      { type: "address", value: voucher.address }
    );
  }

  async function signUseVoucher({ tokenId, signer, owner = user, merchantWallet, amount, hash, nonce, deadline }) {
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
          { name: "metadataHash", type: "bytes32" },
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
        metadataHash: hash,
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
      assert.equal(abiNames.some((name) => name.toLowerCase().includes("userecord")), false);
    });
  });

  describe("direct useVoucher", function () {
    it("decreases balance, increments nonce, and emits canonical metadataHash", async function () {
      await createProgram();
      await voucher.approveMerchant(merchant, true, { from: deployer });
      const tokenId = await mintVoucher();
      const amount = web3.utils.toBN(3500);
      const oldValue = PROGRAM_AMOUNT;
      const newValue = oldValue.sub(amount);
      const nonce = await voucher.useNonce(tokenId);
      const hash = metadataHash({
        recordId: "direct-use-1",
        tokenId,
        owner: user,
        merchantWallet: merchant,
        amount,
        oldValue,
        newValue,
        nonce,
      });

      const receipt = await voucher.useVoucher(tokenId, merchant, amount, hash, { from: user });
      const eventArgs = voucherUsedLog(receipt);

      assert.equal(eventArgs.tokenId.toString(), tokenId.toString());
      assert.equal(eventArgs.user.toLowerCase(), user.toLowerCase());
      assert.equal(eventArgs.merchant.toLowerCase(), merchant.toLowerCase());
      assert.equal(eventArgs.amount.toString(), amount.toString());
      assert.equal(eventArgs.oldValue.toString(), oldValue.toString());
      assert.equal(eventArgs.newValue.toString(), newValue.toString());
      assert.equal(eventArgs.metadataHash, hash);
      assert.equal((await voucher.voucherValue(tokenId)).toString(), newValue.toString());
      assert.equal((await voucher.useNonce(tokenId)).toString(), "1");
    });

    it("reverts for non-owner, unapproved merchant, zero amount, insufficient balance, and expired voucher", async function () {
      await createProgram();
      await voucher.approveMerchant(merchant, true, { from: deployer });
      const tokenId = await mintVoucher();

      await expectRevert(
        voucher.useVoucher(tokenId, merchant, 1, ZERO_HASH, { from: otherUser }),
        "Voucher: caller is not owner"
      );
      await expectRevert(
        voucher.useVoucher(tokenId, unapprovedMerchant, 1, ZERO_HASH, { from: user }),
        "Voucher: unapproved merchant"
      );
      await expectRevert(voucher.useVoucher(tokenId, merchant, 0, ZERO_HASH, { from: user }), "Voucher: amount is zero");
      await expectRevert(
        voucher.useVoucher(tokenId, merchant, PROGRAM_AMOUNT.add(web3.utils.toBN(1)), ZERO_HASH, { from: user }),
        "Voucher: insufficient balance"
      );

      await increaseTime(4000);
      await expectRevert(voucher.useVoucher(tokenId, merchant, 1, ZERO_HASH, { from: user }), "Voucher: expired voucher");

      const validity = await voucher.isValidVoucher(tokenId);
      assert.equal(validity[0], false);
      assert.equal(validity[1].status.toString(), "3");
    });
  });

  describe("merchant EIP-712 useVoucherByMerchant", function () {
    it("succeeds with valid owner signature and rejects replay", async function () {
      await createProgram();
      await voucher.approveMerchant(merchant, true, { from: deployer });
      const tokenId = await mintVoucher();
      const amount = web3.utils.toBN(4000);
      const oldValue = PROGRAM_AMOUNT;
      const newValue = oldValue.sub(amount);
      const nonce = await voucher.useNonce(tokenId);
      const deadline = await futureTimestamp();
      const hash = metadataHash({
        recordId: "merchant-use-1",
        tokenId,
        owner: user,
        merchantWallet: merchant,
        amount,
        oldValue,
        newValue,
        nonce,
      });
      const signature = await signUseVoucher({ tokenId, signer: user, merchantWallet: merchant, amount, hash, nonce, deadline });

      const receipt = await voucher.useVoucherByMerchant(tokenId, amount, hash, deadline, signature, { from: merchant });
      const eventArgs = voucherUsedLog(receipt);

      assert.equal(eventArgs.metadataHash, hash);
      assert.equal(eventArgs.user.toLowerCase(), user.toLowerCase());
      assert.equal(eventArgs.merchant.toLowerCase(), merchant.toLowerCase());
      assert.equal((await voucher.useNonce(tokenId)).toString(), "1");
      assert.equal((await voucher.voucherValue(tokenId)).toString(), newValue.toString());

      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, hash, deadline, signature, { from: merchant }),
        "Voucher: invalid signature"
      );
    });

    it("reverts for wrong signer, unapproved merchant, expired deadline, and insufficient balance", async function () {
      await createProgram();
      await voucher.approveMerchant(merchant, true, { from: deployer });

      const tokenId = await mintVoucher();
      const amount = web3.utils.toBN(1000);
      const nonce = await voucher.useNonce(tokenId);
      const deadline = await futureTimestamp();
      const hash = metadataHash({
        recordId: "merchant-use-negative",
        tokenId,
        owner: user,
        merchantWallet: merchant,
        amount,
        oldValue: PROGRAM_AMOUNT,
        newValue: PROGRAM_AMOUNT.sub(amount),
        nonce,
      });
      const wrongSignature = await signUseVoucher({
        tokenId,
        signer: otherUser,
        owner: user,
        merchantWallet: merchant,
        amount,
        hash,
        nonce,
        deadline,
      });

      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, hash, deadline, wrongSignature, { from: merchant }),
        "Voucher: invalid signature"
      );

      const unapprovedSignature = await signUseVoucher({
        tokenId,
        signer: user,
        merchantWallet: unapprovedMerchant,
        amount,
        hash,
        nonce,
        deadline,
      });
      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, hash, deadline, unapprovedSignature, { from: unapprovedMerchant }),
        "Voucher: unapproved merchant"
      );

      const expiredDeadline = (await latestTimestamp()) - 1;
      const expiredSignature = await signUseVoucher({
        tokenId,
        signer: user,
        merchantWallet: merchant,
        amount,
        hash,
        nonce,
        deadline: expiredDeadline,
      });
      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, amount, hash, expiredDeadline, expiredSignature, { from: merchant }),
        "Voucher: signature expired"
      );

      const tooMuch = PROGRAM_AMOUNT.add(web3.utils.toBN(1));
      const tooMuchHash = metadataHash({
        recordId: "merchant-use-too-much",
        tokenId,
        owner: user,
        merchantWallet: merchant,
        amount: tooMuch,
        oldValue: PROGRAM_AMOUNT,
        newValue: 0,
        nonce,
      });
      const tooMuchSignature = await signUseVoucher({
        tokenId,
        signer: user,
        merchantWallet: merchant,
        amount: tooMuch,
        hash: tooMuchHash,
        nonce,
        deadline,
      });
      await expectRevert(
        voucher.useVoucherByMerchant(tokenId, tooMuch, tooMuchHash, deadline, tooMuchSignature, { from: merchant }),
        "Voucher: insufficient balance"
      );
    });
  });
});
