const Ticket = artifacts.require("Ticket");

contract("Ticket", function ([deployer]) {
  let ticket;

  beforeEach(async function () {
    ticket = await Ticket.new({ from: deployer });
  });

  it("creates a perform and stores current Ticket contract fields", async function () {
    await ticket.createPerform(
      1,
      "title1",
      "description1",
      100,
      "bundang",
      1000,
      15,
      "poster1",
      2026,
      5,
      7,
      12,
      30,
      { from: deployer }
    );

    const perform = await ticket.getPerformInfo(1);
    assert.equal(perform.id.toString(), "1");
    assert.equal(perform.organizer.toLowerCase(), deployer.toLowerCase());
    assert.equal(perform.title, "title1");
    assert.equal(perform.description, "description1");
    assert.equal(perform.maxSeat.toString(), "100");
    assert.equal(perform.location, "bundang");
    assert.equal(perform.price.toString(), web3.utils.toBN(1000).mul(web3.utils.toBN(10).pow(web3.utils.toBN(13))).toString());
    assert.equal(perform.poster, "poster1");
  });

  it("creates a ticket for an existing free-price perform and stores ticket info", async function () {
    await ticket.createPerform(
      2,
      "free show",
      "description2",
      50,
      "seoul",
      0,
      15,
      "poster2",
      2026,
      5,
      8,
      13,
      0,
      { from: deployer }
    );

    const receipt = await ticket.createTicket(2, "me", 10, { from: deployer, value: 0 });
    const tokenId = receipt.logs.find((log) => log.event === "Transfer").args.tokenId;
    const info = await ticket.getTicketInfo(tokenId);

    assert.equal(info.tokenId.toString(), tokenId.toString());
    assert.equal(info.performId.toString(), "2");
    assert.equal(info.title, "free show");
    assert.equal(info.location, "seoul");
    assert.equal(info.userName, "me");
    assert.equal(info.seatNum.toString(), "10");
    assert.equal(info.status.toString(), "1");
    assert.equal(await ticket.getTokenURI(tokenId), "poster2");
  });
});
