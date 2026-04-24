const Ticket = artifacts.require("Ticket");
contract('Ticket',function([deployer,user1,user2,user3]){
    let ticket;

    beforeEach(async() => {
        ticket = await Ticket.new(); 
    })
    describe("Value", function(){
        it('check the return value', async() => {
            await ticket.createTicket(1,"me",10,{from:deployer});
            await ticket.createTicket(2,"you",15,{from:deployer});
            await ticket.createTicket(3,"nick",16,{from:deployer});
            await ticket.createTicket(4,"name",18,{from:deployer});
            
            let returnValue =  await ticket.getTicketList(deployer);

            console.log(returnValue);
            console.log(111111111);
        })

        it('createPerform', async() => {
            await ticket.createPerform(1,user1,"title1","description1", 100, "bundang",1000,15,6,0,"poster1");
            await ticket.createPerform(2,user2,"title2","description2", 150, "seoul",1500,20,9,0,"poster2");
            await ticket.createPerform(3,user3,"title3","description3", 200, "daejeon",2000,25,5,30,"poster3");

            let returnValue = await ticket.getPerformInfo(1);
            console.log(returnValue);
            returnValue = await ticket.getPerformInfo(2);
            console.log(returnValue);
            returnValue = await ticket.getPerformInfo(3);
            console.log(returnValue);
        })
    })
});