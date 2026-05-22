# Voucher 전용 블록체인 패키지 테스트 리포트

작성 시각: 2026-05-22 UTC
작성 범위: `blockchain` Truffle compile/test, ABI 확인, dependency/docs boundary check

## 1. 결론

`Voucher` contract 범위는 compile, Ganache 기반 Truffle test, ABI deep equality, legacy keyword 검사, dependency snapshot 비교, root docs checksum 비교를 통과했다.

| 검증 | 결과 | 근거 |
|---|---:|---|
| Compile | PASS | `npm run compile` exit 0 |
| Truffle test | PASS | `npm test` 10 passing, exit 0 |
| ABI wrapper | PASS | `abi.json`이 `{ "abi": [...] }` 형태 유지 |
| ABI 동기화 | PASS | `abi.json.abi`와 `build/contracts/Voucher.json.abi` deep equality |
| ABI 보존 | PASS | cleanup 전/후 Voucher ABI deep equality |
| Legacy keyword 검사 | PASS | `blockchain/` recursive grep no match |
| Dependency 표면 | PASS | dependency snapshot 동일 |
| Root docs product file | PASS | checksum manifest 동일 |
| Diff whitespace | PASS | `git diff --check` |

## 2. 실행 환경

| 항목 | 값 |
|---|---|
| Truffle | `5.11.5` |
| Solidity compiler | `0.8.19` |
| Test network | `truffle-config.js`의 in-process Ganache `test` provider |

`µWS` native binary 경고는 Ganache가 Node.js 구현으로 fallback한다는 경고이며, 이번 검증에서는 compile/test exit code 0으로 완료됐다.

## 3. Compile

명령:

```bash
cd blockchain && npm run compile
```

결과 요약:

```text
> Compiling ./contracts/Voucher.sol
> Compiling ./contracts/VoucherDTO.sol
> Artifacts written to /home/azureuser/projects/bc/blockchain/build/contracts
> Compiled successfully using:
   - solc: 0.8.19+commit.7dd6d404.Emscripten.clang
```

## 4. Test

명령:

```bash
cd blockchain && npm test
```

결과 요약:

```text
Contract: Voucher
  canonical hash schema
    ✔ recalculates frozen recordCommitmentHash and usageHash vectors with ABI encoding
  owner permissions
    ✔ owner-only functions succeed for owner and revert for non-owner
  mint and read model
    ✔ stores owner, balance, voucher info, getTokenURI, tokenURI, and ABI entries
  direct useVoucher
    ✔ decreases balance, increments nonce, and emits contract-computed usageHash
    ✔ reverts for non-owner, unapproved merchant, zero amount, zero record, insufficient balance, and expired voucher
  merchant EIP-712 useVoucherByMerchant
    ✔ succeeds with valid owner signature, emits usageHash, and rejects replay
    ✔ reverts for wrong signer, unapproved merchant, expired deadline, zero record, and insufficient balance
    ✔ rejects tampered amount, merchant, record commitment, deadline, and nonce
  local usage verifier integration
    ✔ verifies matching Ganache VoucherUsed event against a file-backed usage detail store
    ✔ returns MISMATCH, MISSING_DB, MISSING_ONCHAIN, and duplicate commitment findings

10 passing
```

## 5. ABI 확인

```bash
node - <<'NODE'
const fs = require('fs');
const wrapper = JSON.parse(fs.readFileSync('abi.json', 'utf8'));
const voucher = JSON.parse(fs.readFileSync('build/contracts/Voucher.json', 'utf8'));
console.log(Array.isArray(wrapper.abi));
console.log(JSON.stringify(wrapper.abi) === JSON.stringify(voucher.abi));
NODE
```

기대 결과:

```text
true
true
```

## 6. 완료 판단 경계

이번 완료 범위는 `Voucher` contract, local integration test, ABI artifact sync다. 외부 배포와 frontend/backend 호출부 반영은 비범위다.
