// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface VoucherDTO {
    struct VoucherProgram {
        uint16 programId;
        address issuer;
        string name;
        uint256 amount;
        uint256 expiryDate;
        uint16 totalSupply;
        uint16 mintedSupply;
        string category;
        bool exists;
    }

    struct VoucherInfo {
        uint256 tokenId;
        uint16 programId;
        string programName;
        uint256 amount;
        uint256 expiryDate;
        uint16 status; // 1: active, 2: used, 3: expired
        address owner;
    }
}
