// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./VoucherDTO.sol";

contract Voucher is ERC721Enumerable, Ownable, EIP712, VoucherDTO {
    using Counters for Counters.Counter;

    bytes32 public constant USE_VOUCHER_TYPEHASH =
        keccak256(
            "UseVoucher(uint256 tokenId,address user,address merchant,uint256 amount,bytes32 metadataHash,uint256 nonce,uint256 deadline)"
        );

    Counters.Counter private _tokenIds;

    mapping(uint16 => VoucherProgram) private _voucherPrograms;
    mapping(uint256 => VoucherInfo) private _voucherInfos;
    mapping(uint256 => string) private _tokenURIs;

    mapping(uint256 => uint256) public voucherValue;
    mapping(address => bool) public approvedMerchant;
    mapping(uint256 => uint256) public useNonce;

    event VoucherProgramCreated(
        uint16 indexed programId,
        address indexed issuer,
        string name,
        uint256 amount,
        uint256 expiryDate,
        uint16 totalSupply,
        string category
    );

    event VoucherMinted(
        uint256 indexed tokenId,
        uint16 indexed programId,
        address indexed recipient,
        uint256 amount,
        uint256 expiryDate,
        string tokenURI
    );

    event MerchantApproved(address indexed merchant, bool approved);

    event VoucherUsed(
        uint256 indexed tokenId,
        address indexed user,
        address indexed merchant,
        uint256 amount,
        uint256 oldValue,
        uint256 newValue,
        bytes32 metadataHash
    );

    constructor() ERC721("Voucher", "VCHR") EIP712("Voucher", "1") {}

    function createVoucherProgram(
        uint16 programId,
        string memory name,
        uint256 amount,
        uint256 expiryDate,
        uint16 totalSupply,
        string memory category
    ) public onlyOwner returns (uint16) {
        require(programId != 0, "Voucher: invalid program");
        require(!_voucherPrograms[programId].exists, "Voucher: program exists");
        require(bytes(name).length > 0, "Voucher: empty name");
        require(amount > 0, "Voucher: amount is zero");
        require(expiryDate > block.timestamp, "Voucher: program expired");
        require(totalSupply > 0, "Voucher: empty supply");

        _voucherPrograms[programId] = VoucherProgram(
            programId,
            msg.sender,
            name,
            amount,
            expiryDate,
            totalSupply,
            0,
            category,
            true
        );

        emit VoucherProgramCreated(programId, msg.sender, name, amount, expiryDate, totalSupply, category);

        return programId;
    }

    function mintVoucher(
        uint16 programId,
        address recipient,
        string memory uri
    ) public onlyOwner returns (uint256) {
        require(recipient != address(0), "Voucher: zero recipient");

        VoucherProgram storage program = _voucherPrograms[programId];
        require(program.exists, "Voucher: missing program");
        require(program.mintedSupply < program.totalSupply, "Voucher: supply exceeded");
        require(program.expiryDate > block.timestamp, "Voucher: program expired");

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        program.mintedSupply += 1;

        _mint(recipient, newTokenId);
        _tokenURIs[newTokenId] = uri;
        voucherValue[newTokenId] = program.amount;
        _voucherInfos[newTokenId] = VoucherInfo(
            newTokenId,
            programId,
            program.name,
            program.amount,
            program.expiryDate,
            1,
            recipient
        );

        emit VoucherMinted(newTokenId, programId, recipient, program.amount, program.expiryDate, uri);

        return newTokenId;
    }

    function approveMerchant(address merchant, bool approved) public onlyOwner {
        require(merchant != address(0), "Voucher: zero merchant");
        approvedMerchant[merchant] = approved;
        emit MerchantApproved(merchant, approved);
    }

    function useVoucher(
        uint256 tokenId,
        address merchant,
        uint256 amount,
        bytes32 metadataHash
    ) public returns (bool) {
        require(ownerOf(tokenId) == msg.sender, "Voucher: caller is not owner");
        _useVoucher(tokenId, msg.sender, merchant, amount, metadataHash);
        return true;
    }

    function useVoucherByMerchant(
        uint256 tokenId,
        uint256 amount,
        bytes32 metadataHash,
        uint256 deadline,
        bytes memory ownerSignature
    ) public returns (bool) {
        require(block.timestamp <= deadline, "Voucher: signature expired");

        address user = ownerOf(tokenId);
        uint256 nonce = useNonce[tokenId];
        bytes32 structHash = keccak256(
            abi.encode(USE_VOUCHER_TYPEHASH, tokenId, user, msg.sender, amount, metadataHash, nonce, deadline)
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), ownerSignature);
        require(signer == user, "Voucher: invalid signature");

        _useVoucher(tokenId, user, msg.sender, amount, metadataHash);
        return true;
    }

    function getVoucherInfo(uint256 tokenId) public view returns (VoucherInfo memory) {
        require(_exists(tokenId), "Voucher: nonexistent token");
        VoucherInfo memory info = _voucherInfos[tokenId];
        info.amount = voucherValue[tokenId];
        info.owner = ownerOf(tokenId);
        if (block.timestamp > info.expiryDate && info.amount > 0) {
            info.status = 3;
        }
        return info;
    }

    function getVoucherProgram(uint16 programId) public view returns (VoucherProgram memory) {
        require(_voucherPrograms[programId].exists, "Voucher: missing program");
        return _voucherPrograms[programId];
    }

    function getTokenURI(uint256 tokenId) public view returns (string memory) {
        require(_exists(tokenId), "Voucher: nonexistent token");
        return _tokenURIs[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return getTokenURI(tokenId);
    }

    function isValidVoucher(uint256 tokenId) public view returns (bool, VoucherInfo memory) {
        if (!_exists(tokenId)) {
            VoucherInfo memory emptyInfo;
            return (false, emptyInfo);
        }

        VoucherInfo memory info = getVoucherInfo(tokenId);
        bool valid = info.status == 1 && info.amount > 0 && block.timestamp <= info.expiryDate;
        return (valid, info);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _useVoucher(
        uint256 tokenId,
        address user,
        address merchant,
        uint256 amount,
        bytes32 metadataHash
    ) private {
        require(approvedMerchant[merchant], "Voucher: unapproved merchant");
        require(amount > 0, "Voucher: amount is zero");

        VoucherInfo storage info = _voucherInfos[tokenId];
        require(info.status == 1, "Voucher: inactive voucher");
        require(block.timestamp <= info.expiryDate, "Voucher: expired voucher");

        uint256 oldValue = voucherValue[tokenId];
        require(oldValue >= amount, "Voucher: insufficient balance");

        uint256 newValue = oldValue - amount;
        voucherValue[tokenId] = newValue;
        useNonce[tokenId] += 1;
        info.amount = newValue;
        info.owner = user;
        if (newValue == 0) {
            info.status = 2;
        }

        emit VoucherUsed(tokenId, user, merchant, amount, oldValue, newValue, metadataHash);
    }
}
