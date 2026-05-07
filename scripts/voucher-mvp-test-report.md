# Voucher MVP 테스트 리포트

작성 시각: 2026-05-07 18:31 KST  
작성 범위: `dev/blockchain` Truffle 검증, ABI 확인, `dev/docs/03-스마트컨트랙트-스펙.md` 문서 동기화

## 1. 결론

현재 작업물은 `truffle compile --all`과 ABI 함수/이벤트 확인은 통과했다. 다만 local Ganache 기준 `Voucher_Test.js`가 현재 `Voucher.sol` 함수 시그니처와 맞지 않아 실패하므로 스마트 컨트랙트 MVP 완료로 주장하면 안 된다.

| 검증 | 결과 | 근거 |
|---|---:|---|
| Truffle CLI gate | PASS | `npx --no-install truffle version` 성공 |
| Compile | PASS | `npx --no-install truffle compile --all` 성공 |
| Voucher tests | FAIL | `Voucher_Test.js` 6 failing: old function signature 호출 |
| Full test suite | FAIL | `Ticket_Test.js` 2 passing, `Voucher_Test.js` 6 failing |
| ABI 함수/이벤트 확인 | PASS | `Voucher.json`에 `mintVoucher`, `useVoucher`, `useVoucherByMerchant`, `VoucherUsed` 존재 |
| Lint script | PASS | `npm run lint --if-present` 종료 코드 0 |

## 2. 실행 환경

```text
node --version
v25.9.0

npm --version
11.12.1
```

## 3. Truffle CLI gate

명령:

```bash
cd dev/blockchain && npx --no-install truffle version
```

결과:

```text
Truffle v5.11.5 (core: 5.11.5)
Ganache v7.9.1
Solidity - 0.8.19 (solc-js)
Node v25.9.0
Web3.js v1.10.0
exit=0
```

## 4. Compile

명령:

```bash
cd dev/blockchain && npx --no-install truffle compile --all
```

결과:

```text
Compiling your contracts...
===========================
> Compiling ./contracts/SangToken.sol
> Compiling ./contracts/Ticket.sol
> Compiling ./contracts/TicketDTO.sol
> Compiling ./contracts/Voucher.sol
> Compiling ./contracts/VoucherDTO.sol
> Compiling @openzeppelin/contracts/access/Ownable.sol
> Compiling @openzeppelin/contracts/token/ERC20/ERC20.sol
> Compiling @openzeppelin/contracts/token/ERC721/ERC721.sol
> Compiling @openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol
> Compiling @openzeppelin/contracts/utils/cryptography/ECDSA.sol
> Compiling @openzeppelin/contracts/utils/cryptography/EIP712.sol
> Artifacts written to /Users/hwangjonghoon/projects/blockchain-voucher-system/dev/blockchain/build/contracts
> Compiled successfully using:
   - solc: 0.8.19+commit.7dd6d404.Emscripten.clang
exit=0
```

### Compile note

초기 검증에서는 `Voucher.sol:265` override list 오류가 있었으나 contracts lane에서 수정된 뒤 `compile --all` 재검증은 통과했다.

## 5. Test

명령:

```bash
cd dev/blockchain
npx --no-install ganache --server.host 127.0.0.1 --server.port 7545 --chain.chainId 5777 --wallet.deterministic --quiet
npx --no-install truffle test
```

결과:

```text
This version of µWS is not compatible with your Node.js build:
Falling back to a NodeJS implementation; performance may be degraded.

Using network 'development'.

Contract: Ticket
  ✔ creates a perform and stores current Ticket contract fields
  ✔ creates a ticket for an existing free-price perform and stores ticket info

Contract: Voucher
  owner permissions
    1) owner-only functions succeed for owner and revert for non-owner
  mint and read model
    2) stores owner, balance, voucher info, getTokenURI, tokenURI, and ABI entries
  direct useVoucher
    3) decreases balance, increments nonce, and emits canonical metadataHash
    4) reverts for non-owner, unapproved merchant, zero amount, insufficient balance, and expired voucher
  merchant EIP-712 useVoucherByMerchant
    5) succeeds with valid owner signature and rejects replay
    6) reverts for wrong signer, unapproved merchant, expired deadline, and insufficient balance

2 passing (766ms)
6 failing

1) Contract: Voucher / owner permissions:
   Error: VM Exception while processing transaction: revert Voucher: expiry is past -- Reason given: Voucher: expiry is past.

2) Contract: Voucher / mint and read model:
   Error: VM Exception while processing transaction: revert Voucher: expiry is past -- Reason given: Voucher: expiry is past.

3) Contract: Voucher / direct useVoucher:
   Error: VM Exception while processing transaction: revert Voucher: expiry is past -- Reason given: Voucher: expiry is past.

4) Contract: Voucher / direct useVoucher revert matrix:
   Error: VM Exception while processing transaction: revert Voucher: expiry is past -- Reason given: Voucher: expiry is past.

5) Contract: Voucher / merchant EIP-712 success/replay:
   Error: VM Exception while processing transaction: revert Voucher: expiry is past -- Reason given: Voucher: expiry is past.

6) Contract: Voucher / merchant EIP-712 revert matrix:
   Error: VM Exception while processing transaction: revert Voucher: expiry is past -- Reason given: Voucher: expiry is past.

full_exit=6
```

### Test blocker

`Voucher_Test.js`가 old API를 호출한다.

| 테스트 호출 | 현재 `Voucher.sol` |
|---|---|
| `createVoucherProgram(programId, name, amount, expiryDate, supply, category)` | `createVoucherProgram(name, description, initialValue, startsAt, expiresAt, active)` |
| `mintVoucher(programId, recipient, uri)` | `mintVoucher(user, programId, uri)` |

첫 인자 `PROGRAM_ID = 1`이 `name`으로 들어가고, `expiryDate`가 `startsAt`으로 밀리면서 `expiresAt` 위치에 `PROGRAM_SUPPLY = 10`이 전달된다. 그래서 컨트랙트가 `Voucher: expiry is past`로 revert 한다. worker-3 범위는 scripts/docs이므로 test 파일은 수정하지 않고 leader와 worker-2에 전달했다.

## 6. ABI 확인

명령:

```bash
cd dev/blockchain
test -f build/contracts/Voucher.json
node -e "const a=require('./build/contracts/Voucher.json').abi; console.log(a.some(x=>x.name==='mintVoucher'), a.some(x=>x.name==='useVoucher'), a.some(x=>x.name==='useVoucherByMerchant'), a.some(x=>x.name==='VoucherUsed'))"
```

결과:

```text
exit=0
true true true true
```

주의: ABI presence는 통과했지만 전체 suite 실패가 남아 있으므로 전체 MVP 완료 증거로 단독 사용하면 안 된다.

## 7. Lint script

명령:

```bash
cd dev/blockchain && npm run lint --if-present
```

결과:

```text
exit=0
```

`package.json`에 lint script가 없으므로 실제 Solidity/Markdown lint 검증은 수행되지 않았다.

## 8. 문서 검토 결과

`dev/docs/03-스마트컨트랙트-스펙.md`를 PRD와 test spec 기준으로 갱신했다.

반영 내용:

- `VoucherDTO.sol`의 `VoucherProgram`, `VoucherInfo` 필드 기준 반영
- `voucherValue`, `approvedMerchant`, `useNonce` state 기준 반영
- `VoucherProgramCreated`, `VoucherMinted`, `MerchantApproved`, `VoucherUsed` 이벤트 반영
- 사용자 직접 `useVoucher`와 가맹점 EIP-712 `useVoucherByMerchant` 모두 MVP in-scope로 반영
- `metadataHash`는 DB 조작 방지가 아니라 사후 변경 탐지 기준이라고 명시
- backend/frontend/IPFS/공개망/전체 데모는 후속 범위로 분리

## 9. Delegation compliance

Subagent skip reason: worker-3의 허용 write scope가 `dev/blockchain/scripts`와 `dev/docs/03-스마트컨트랙트-스펙.md`로 좁고, 상위 사용자 품질 규칙이 명시 요청 없는 subagent spawn을 제한한다. 병렬 probe 대신 실제 `truffle` 검증, ABI 확인, PRD/test spec 대조로 리스크를 확인했다.
