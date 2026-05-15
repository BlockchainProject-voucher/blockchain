# Voucher Anti-Fraud UsageHash 테스트 리포트

작성 시각: 2026-05-14 KST
작성 범위: `blockchain` Truffle compile/test, ABI 확인, local verifier integration, docs claim-boundary check

## 1. 결론

`Voucher` contract/local verifier 범위는 compile, Truffle test, ABI 확인을 통과했다. production DB adapter와 backend/frontend 호출부 반영은 후속 범위다.

| 검증 | 결과 | 근거 |
|---|---:|---|
| Compile | PASS | `npm run compile` exit 0 |
| Truffle test | PASS | `npm test` 12 passing, exit 0 |
| ABI 함수/이벤트 확인 | PASS | `Voucher.json`에 `mintVoucher`, `useVoucher`, `useVoucherByMerchant`, `VoucherUsed` 존재 |
| `usageHash` 외부 주입 금지 | PASS | `useVoucher*` ABI inputs에 `usageHash` 없음 |
| local verifier | PASS | Ganache 실제 event + 파일 기반 detail store로 `VERIFIED/MISMATCH/MISSING_DB/MISSING_ONCHAIN`, `DUPLICATE_COMMITMENT` 검증 |
| docs claim boundary | PASS | legacy hash 명칭 잔존 없음, UX 문서의 상세 기록 과장 표현 정정 |

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
Artifacts written to /home/azureuser/projects/bc-voucher/blockchain/build/contracts
Compiled successfully using:
   - solc: 0.8.19+commit.7dd6d404.Emscripten.clang
```

## 4. Test

명령:

```bash
cd blockchain && npm test
```

결과 요약:

```text
Contract: Ticket
  ✔ creates a perform and stores current Ticket contract fields
  ✔ creates a ticket for an existing free-price perform and stores ticket info

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

12 passing
```

## 5. ABI 확인

```bash
node - <<'NODE'
const abi = require('./build/contracts/Voucher.json').abi;
for (const name of ['mintVoucher', 'useVoucher', 'useVoucherByMerchant', 'VoucherUsed']) {
  console.log(`${name}=${abi.some((entry) => entry.name === name)}`);
}
const useVoucher = abi.find((entry) => entry.name === 'useVoucher');
const merchantUse = abi.find((entry) => entry.name === 'useVoucherByMerchant');
console.log(`usageHashInput=${[...useVoucher.inputs, ...merchantUse.inputs].some((input) => input.name === 'usageHash')}`);
NODE
```

기대 결과:

```text
mintVoucher=true
useVoucher=true
useVoucherByMerchant=true
VoucherUsed=true
usageHashInput=false
```

## 6. 완료 판단 경계

이번 완료 범위는 `Voucher` contract와 local verification이다. RDB 자체 불변, 현실 결제 사실성, 피싱 방어, merchant key 탈취 방어, production DB adapter 완료로 표현하지 않는다.
