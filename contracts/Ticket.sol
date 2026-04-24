// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./TicketDTO.sol";
/*
* 공연 티켓을 ERC-721 Token(NFT)으로 생성하는 Contract
* @author 상미니
*/

contract Ticket is ERC721Enumerable, TicketDTO {
    using Counters for Counters.Counter;
    constructor() ERC721("TTOKET", "TKT") {

    }
    // NFT(티켓) 생성 시 마다 1씩 증가하는 ID
    Counters.Counter private _tokenIds;
    // NFT 메타데이터 URI 저장을 위한 mapping
    // TokenId => IPFS해시주소
    mapping(uint256 => string) private _tokenURIs;
    // TokenId => 티켓정보
    mapping(uint256 => TicketInfo) private _ticketInfos;
    // NFT 토큰 발행 지갑의 Address 저장을 위한 mapping
    // TokenId => 주인
    mapping(uint256 => address) private _minters;
    // address => TokenId[]
    mapping(address => uint256[]) private _ticketsByAccount;
    // performId => 공연정보
    mapping(uint256 => PerformInfo) private _performInfos;
    // performId => 비하인드 IPFS해시주소 배열
    mapping(uint256 => string[]) private _performBehinds;
    // performId => 티켓 소유자 주소 배열
    mapping(uint256 => address[]) private _ownersByPerform;
    // tokenId => 취소했고 다른 사용자가 구매할 시 환불해줘야하는 금액
    mapping(uint256 => uint256) private _refundAmountByCanceledTicket;
    // performId => 공연별 환불 정보
    mapping(uint256 => PerformRefundInfo) private _refundInfos;
    // tokenId => diary
    mapping(uint256 => Diary) private _diarys;
    // performId  => tokenId[]
    mapping(uint16 => uint256[]) private _tokenIdByperformId;

    function createPerform(uint16 _performId, string memory _title,
                        string memory _description, uint16 _maxSeat, string memory _location,
                        uint256 _price, uint256 _minute, string memory _poster,
                        uint16 _performYear, uint16 _performMonth, uint16 _performDay, uint16 _performHour, uint16 _performMinute) public returns (uint256){
        
        uint256 _performTime = block.timestamp + (_minute * 60);
        uint256 _refundTime14 = _performTime - (86400 * 14); // 14일전 시간
        uint256 _refundTime7 = _performTime - (86400 * 7); // 7일전 시간
        uint256 _refundTime3 = _performTime - (86400 * 3); // 3일전 시간
        uint256 _refundTime1 = _performTime - (86400); // 1일전 시간
        
        PerformRefundInfo memory pr = PerformRefundInfo(_refundTime14,_refundTime7,_refundTime3,_refundTime1);
        _performInfos[_performId] = PerformInfo(_performId,msg.sender,_title,_description,_maxSeat,_location,_price * (10**13),_poster,_performTime+10,_performYear,_performMonth,_performDay,_performHour,_performMinute);
        _setPerformRefundInfo(_performId, pr);
        return _performId;
    }
    /*
    * create
    * 새로운 티켓 정보를 가진 ERC-721 토큰을 생성
    * 
    * @ param 
    * @ return
    */
    function createTicket(uint16 performId, string memory userName, 
                        uint16 seatNum) public payable returns (uint256) {
        
        PerformInfo memory p = _performInfos[performId];
        
        require(p.price == msg.value,"wrong ticket price");
        
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current(); 
        TicketInfo memory t = TicketInfo(newTokenId,p.poster,performId,p.title,p.location,userName,seatNum,1,p.performYear,p.performMonth,p.performDay,p.performHour,p.performMinute);
        _mint(msg.sender, newTokenId); //nft만들어서 msg.sender 지갑에 넣는함수
        _setMinter(newTokenId, msg.sender);
        _setTokenURI(newTokenId, p.poster);
        _setTicketInfo(newTokenId, t);
        _setTicketsByAccount(newTokenId, msg.sender);
        _setOwnersByPerform(performId, msg.sender);

        _tokenIdByperformId[performId].push(newTokenId);
        return newTokenId;
    }
    function cancleMyTicket(uint256 tokenId, uint16 performId) public payable returns (uint256){
        require(_minters[tokenId] == msg.sender, "you're not owner of this ticket");
        require(_ticketInfos[tokenId].status != 2, "already canceled ticket");
        uint256 nowTime = block.timestamp;
        
        PerformInfo memory p = getPerformInfo(performId);

        require(nowTime <= p.performTime, "already finished perform");
        
        uint256 refundAmount = getNowRefundAmount(performId);
        
        payable(msg.sender).transfer(refundAmount); 
        // 환불이 성공해야 취소관련 정보 바꿈
        _ticketInfos[tokenId].status = 2; // 티켓상태 취소로 바꿈
        deleteOneOwnersByPerform(msg.sender,performId);
        deleteOneTicketByAccount(msg.sender,tokenId);
        approve(address(this), tokenId); // 해당 NFT권한을 해당 컨트랙트 주소에 허용시키기
        _refundAmountByCanceledTicket[tokenId] = p.price - refundAmount;
        return refundAmount;
    }
    function buyCanceledTicket(uint16 performId, uint16 seatNum, string memory userName) public payable returns (uint256){
        PerformInfo memory p = _performInfos[performId];
        require(p.price == msg.value, "wrong ticket price");
        uint256 tokenId = 0;
        uint256[] storage tokenIds = _tokenIdByperformId[performId];
        for(uint16 i=0;i<tokenIds.length;i++){
            if(getTicketInfo(tokenIds[i]).seatNum == seatNum){
                tokenId = tokenIds[i];
                tokenIds[i] = tokenIds[tokenIds.length - 1];
                tokenIds.pop();
                break;
            }
        }
        TicketInfo memory t = _ticketInfos[tokenId];
        require(t.status == 2, "not canceled ticket");
        _burn(tokenId);
        _ticketInfos[tokenId] = TicketInfo(0,"",0,"","","",0,0,0,0,0,0,0);

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        
        TicketInfo memory newt = TicketInfo(newTokenId,p.poster,performId,p.title,p.location,userName,seatNum,1,p.performYear,p.performMonth,p.performDay,p.performHour,p.performMinute);
        _mint(msg.sender, newTokenId); 
        _setMinter(newTokenId, msg.sender);
        _setTokenURI(newTokenId, p.poster);
        _setTicketInfo(newTokenId, newt);
        _setTicketsByAccount(newTokenId, msg.sender);
        _setOwnersByPerform(performId, msg.sender);
        _tokenIdByperformId[performId].push(newTokenId);

        address beforeOwner = _minters[tokenId];
        payable(beforeOwner).transfer(_refundAmountByCanceledTicket[tokenId]); //다른애가 사주니까 수수료도 돌려주기
        _refundAmountByCanceledTicket[tokenId] = 0; // 없애기

        _ticketInfos[tokenId].status = 3;
        _ticketInfos[tokenId].userName = userName;
        return newTokenId;
    }

    function getNowRefundAmount(uint16 performId) public view returns(uint256){
        PerformInfo memory p = getPerformInfo(performId);
        PerformRefundInfo memory pr = getPerformRefundInfo(performId);
        uint256 nowTime = block.timestamp;
        if(nowTime >= pr.refundTime1){ // 30퍼 환불
            return p.price * 30 / 100;
        }
        else if(nowTime >= pr.refundTime3){ // 50퍼 환불
            return p.price * 50 / 100;     
        }
        else if(nowTime >= pr.refundTime7){ // 70퍼 환불
            return p.price * 70 / 100;     
        }
        else { // 80퍼 환불
            return p.price * 80 / 100; 
        }
    }
    function insertTicketDiary(uint256 tokenId, string memory title, string memory subtitle,string memory content,string memory color) public returns(uint256){
        _diarys[tokenId] = Diary(title,subtitle,content,color);
        return tokenId;
    }
    function getTicketDetails(uint256 tokenId, uint16 performId) public view returns (TicketDetailReturn memory){
        string[] memory behinds = getBehindList(performId);
        Diary memory diary = _diarys[tokenId];
        return TicketDetailReturn(behinds, diary);
    }

    function insertPerformBehind(uint16 performId, string memory behindAddress) public returns(uint256){
        _performBehinds[performId].push(behindAddress);
        return performId;
    }
    function getBehindList(uint16 performId) public view returns(string[] memory){
        return _performBehinds[performId];
    }
    function getBeforeTicketList() public view returns(TicketInfo[] memory, uint8){
        uint256[] memory tickets = getTicketsByAccount(msg.sender);
        TicketInfo[] memory userTickets = new TicketInfo[](tickets.length);
        uint8 idx = 0;
        for(uint256 i=0; i<tickets.length ; i++){
            uint256 nowTokenId = tickets[i];
            uint256 performTime = getPerformInfo(_ticketInfos[nowTokenId].performId).performTime;
            if(block.timestamp < performTime){
                userTickets[idx] = getTicketInfo(nowTokenId);
                idx++;
            }
        }
        return (userTickets,idx);
    }
    function getAfterTicketList() public view returns(TicketInfo[] memory, uint8){
        uint256[] memory tickets = getTicketsByAccount(msg.sender);
        TicketInfo[] memory userTickets = new TicketInfo[](tickets.length);
        uint8 idx = 0;
        for(uint256 i=0; i<tickets.length ; i++){
            uint256 nowTokenId = tickets[i];
            uint256 performTime = getPerformInfo(_ticketInfos[nowTokenId].performId).performTime;
            if(block.timestamp > performTime){
                userTickets[idx] = getTicketInfo(nowTokenId);
                idx++;
            }
        }
        return (userTickets,idx);
    }
    function isOwnerOfPerform(uint16 _performId) public view returns(bool){
        uint256[] memory tickets = getTicketsByAccount(msg.sender);
        for(uint256 i=0; i<tickets.length ; i++){
            uint16 performId = getTicketInfo(tickets[i]).performId;
            if(_performId == performId){
                return true;
            }
        }
        return false;
    }

    // ERC721URIStorage: TokenURI setter
    function _setTokenURI(
            uint256 tokenId, 
            string memory _tokenURI
        ) internal virtual {
        require(_exists(tokenId), "ERC721URIStorage: URI set of nonexistent token");
        _tokenURIs[tokenId] = _tokenURI;
    }
    function getTokenURI(uint256 tokenId) public view returns (string memory) {
        return _tokenURIs[tokenId];
    }
    function _setTicketInfo(
            uint256 tokenId, 
            TicketInfo memory _ticketInfo
        ) private {
        _ticketInfos[tokenId] = _ticketInfo;
    }
    function getTicketInfo(uint256 tokenId) public view returns (TicketInfo memory) {
        return _ticketInfos[tokenId];
    }
    function _setMinter(
            uint256 tokenId, 
            address minter
        ) private {
        _minters[tokenId] = minter;
    }
    function getMinter(uint256 tokenId) public view returns (address) {
        return _minters[tokenId];
    }
    function _setTicketsByAccount(
            uint256 tokenId, 
            address minter
        ) private {
        _ticketsByAccount[minter].push(tokenId);
    }
    function getTicketsByAccount(address minter) private view returns (uint256[] memory) {
        return _ticketsByAccount[minter];
    }
    function deleteOneTicketByAccount(address owner, uint256 tokenId) private {
        uint256 len = _ticketsByAccount[owner].length;
        for(uint256 i = 0 ; i < len ; i++){
            if(_ticketsByAccount[owner][i] == tokenId){
                _ticketsByAccount[owner][i] = _ticketsByAccount[owner][len - 1];
                _ticketsByAccount[owner].pop();
                return; 
            }
        }
    }    
    function _setPerformInfo(
            uint256 performId, 
            PerformInfo memory _performInfo
        ) private {
        _performInfos[performId] = _performInfo;
    }
    function getPerformInfo(uint16 performId) public view returns (PerformInfo memory) {
        return _performInfos[performId];
    }
    function _setPerformRefundInfo(
            uint16 performId, 
            PerformRefundInfo memory _performRefundInfo
        ) private {
        _refundInfos[performId] = _performRefundInfo;
    }
    function getPerformRefundInfo(uint256 performId) public view returns (PerformRefundInfo memory) {
        return _refundInfos[performId];
    }

    function _setOwnersByPerform(
            uint256 performId, 
            address minter
        ) private {
        _ownersByPerform[performId].push(minter);
    }
    function getOwnersByPerform(uint16 performId) private view returns (address[] memory) {
        return _ownersByPerform[performId];
    }
    function deleteOneOwnersByPerform(address target, uint16 performId) private {
        uint256 len = _ownersByPerform[performId].length;
        for(uint256 i = 0 ; i < len ; i++){ // 해당 공연 티켓소유자 배열에서 없애기
            if(_ownersByPerform[performId][i] == target) {
                _ownersByPerform[performId][i] = _ownersByPerform[performId][len - 1];
                _ownersByPerform[performId].pop();
                return;
            }
        }
    }

    function sendEther() public payable {
        uint256 amount = 0.0001 ether; // Set the amount of ether to send (in wei)
        require(address(this).balance >= amount, "Contract does not have enough ether.");
        payable(msg.sender).transfer(amount); // Send the ether to the msg.sender address
    }

}