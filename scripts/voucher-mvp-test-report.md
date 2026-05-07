# Voucher MVP 테스트 리포트

작성 시각: 2026-05-08 01:50 KST
작성 범위: `dev/blockchain` Truffle compile/test, ABI 확인, 구현 상태 문서 정합성 갱신

## 1. 결론

현재 `dev/blockchain` Blockchain Voucher Contract MVP는 compile, Truffle test, ABI 확인을 모두 통과했다. 테스트는 외부 Ganache GUI 없이 `truffle-config.js`의 `test` network가 생성하는 in-process Ganache provider로 재현된다.

| 검증 | 결과 | 근거 |
|---|---:|---|
| Toolchain check | PASS | Redis/MySQL/Ganache/Truffle 설치 확인 |
| Compile | PASS | `npm run compile` exit 0 |
| Truffle test | PASS | `npm test` 8 passing, exit 0 |
| ABI 함수/이벤트 확인 | PASS | `Voucher.json`에 `mintVoucher`, `useVoucher`, `useVoucherByMerchant`, `VoucherUsed` 존재 |
| 구현 상태 문서 | PASS | `scripts/voucher-mvp-implementation-status.md` 작성 |
| 후속 범위 분리 | PASS | Backend/Frontend 구현과 전체 E2E 데모는 후속 과제로 분리 |

## 2. 실행 환경

```text
node --version
v25.9.0

npm --version
11.12.1
```

도구 확인:

| 도구 | 확인 결과 |
|---|---|
| Redis | `redis-server v8.6.3` |
| MySQL | `mysql 9.6.0` |
| Ganache | `ganache v7.9.1` |
| Truffle | `Truffle v5.11.5` |

## 3. Compile

명령:

```bash
cd dev/blockchain && npm run compile
```

결과:

```text
> compile
> truffle compile

Compiling your contracts...
===========================
> Everything is up to date, there is nothing to compile.
compile_exit=0
```

## 4. Test

명령:

```bash
cd dev/blockchain && npm test
```

결과:

```text
Using network 'test'.

Contract: Ticket
  ✔ creates a perform and stores current Ticket contract fields
  ✔ creates a ticket for an existing free-price perform and stores ticket info

Contract: Voucher
  owner permissions
    ✔ owner-only functions succeed for owner and revert for non-owner
  mint and read model
    ✔ stores owner, balance, voucher info, getTokenURI, tokenURI, and ABI entries
  direct useVoucher
    ✔ decreases balance, increments nonce, and emits canonical metadataHash
    ✔ reverts for non-owner, unapproved merchant, zero amount, insufficient balance, and expired voucher
  merchant EIP-712 useVoucherByMerchant
    ✔ succeeds with valid owner signature and rejects replay
    ✔ reverts for wrong signer, unapproved merchant, expired deadline, and insufficient balance

8 passing
test_exit=0
```

### Test network note

`package.json`의 `test` script는 `truffle test --network test`를 실행한다. `truffle-config.js`의 `test` network는 Ganache provider를 process 내부에서 생성하므로 별도 Ganache GUI나 외부 7545 포트 프로세스가 필요 없다.

## 5. ABI 확인

명령:

```bash
cd dev/blockchain
node - <<'NODE'
const abi = require('./build/contracts/Voucher.json').abi;
for (const name of ['mintVoucher', 'useVoucher', 'useVoucherByMerchant', 'VoucherUsed']) {
  console.log(`${name}=${abi.some((entry) => entry.name === name)}`);
}
NODE
```

결과:

```text
mintVoucher=true
useVoucher=true
useVoucherByMerchant=true
VoucherUsed=true
abi_exit=0
```

## 6. 구현 상태 요약

| 영역 | 파일 | 상태 |
|---|---|---:|
| 컨트랙트 | `contracts/Voucher.sol`, `contracts/VoucherDTO.sol` | 완료 |
| Migration | `migrations/2_deploy_voucher.js` | 완료 |
| 테스트 | `test/Voucher_Test.js`, `test/Ticket_Test.js` | 8 passing |
| 테스트 재현성 | `truffle-config.js`, `package.json` | in-process Ganache test network |
| ABI | `build/contracts/Voucher.json` | 산출 완료 |
| 구현 상태 문서 | `scripts/voucher-mvp-implementation-status.md` | 작성 완료 |

## 7. 후속 과제

| 후속 과제 | 상태 |
|---|---|
| Backend web3j 연동 | 후속 |
| Frontend QR/지갑 UX | 후속 |
| 전체 E2E 데모 | 후속 |
| IPFS/파일 저장 자동화 | 후속 |
| 공개망 배포 | 후속 |

## 8. 주의 사항

이번 완료 범위는 `dev/blockchain`의 Blockchain Voucher Contract MVP다. Backend/Frontend 구현과 전체 E2E 데모는 deep-interview에서 제외한 범위이며, 서비스 전체 완료로 과장해 표현하지 않는다.
