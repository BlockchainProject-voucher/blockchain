// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SangToken is ERC20, Ownable{
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
    
    function mint(uint256 amount) public onlyOwner{
        _mint(_msgSender(), amount);
    }
    function gibu(uint256 amount) public{
        _mint(_msgSender(), amount);
    }
    function forceToTransfer(address from, address to, uint256 amount) public onlyOwner{
        _transfer(from, to, amount);
    }
}

/*확인해보니, 지금 코드 기준으로 SangToken은 사실상 거의 안 쓰입니다.

근거:

실제 검색 결과에서 SangToken은 거의 자기 파일이랑 마이그레이션 파일에서만 나옵니다
프론트는 Ticket ABI만 쓰고 있습니다: Abi.ts (line 3), useWeb3.ts (line 47)
백엔드에서도 SangToken을 직접 쓰는 흔적은 안 잡혔습니다
배포할 때만 같이 올리게 되어 있습니다: 1_initial_migration.js (line 1)
즉 현재 상태를 정리하면:

Ticket: 실제 서비스 핵심
SangToken: 배포 스크립트에만 포함된 보조/실험용 컨트랙트 느낌
그래서 결론은:

서비스 이해 관점에서는 SangToken은 일단 무시해도 됩니다
프로젝트 실행 관점에서는 배포 스크립트 때문에 남아 있는 정도로 보면 됩니다
한 줄 요약:
지금 repo 기준으로 SangToken은 핵심 기능에 거의 안 쓰이고, 마이그레이션에서만 함께 배포되는 보조 컨트랙트입니다. */



