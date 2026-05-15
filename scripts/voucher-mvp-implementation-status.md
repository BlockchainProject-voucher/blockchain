# Voucher Anti-Fraud UsageHash 구현 상태

작성 시각: 2026-05-14 KST
기준 문서: `.omx/plans/blockchain-antifraud-usagehash-ralplan.md`, `.omx/plans/prd-blockchain-antifraud-usagehash.md`, `.omx/plans/test-spec-blockchain-antifraud-usagehash.md`

## 1. 결론

`Voucher` v1 anti-fraud 강화는 contract/local verification 범위에서 구현됐다. 핵심 변경은 `recordCommitmentHash` 입력과 컨트랙트 내부 `usageHash` 계산이다. production DB adapter와 backend/frontend ABI 반영은 후속 과제다.

| 항목 | 현재 상태 | 근거 |
|---|---:|---|
| Contract event/API 강화 | 완료 | `contracts/Voucher.sol` |
| EIP-712 typed data 변경 | 완료 | `recordCommitmentHash` 포함 |
| zero commitment 방지 | 완료 | `recordCommitmentHash != bytes32(0)` |
| contract-computed `usageHash` | 완료 | `_useVoucher`에서 `keccak256(abi.encode(...))` |
| Canonical schema vector test | PASS | `test/Voucher_Test.js` |
| Direct/merchant/replay/tamper tests | PASS | `npm test` 12 passing |
| Local verifier integration | PASS | `test/helpers/usageHashVerifier.js` |
| Docs claim boundary | 완료 | `../docs/02-*`, `../docs/03-*`, `../docs/06-*`, `../docs/07-*` |
| Production DB adapter | 후속 | repo 내 adapter 미확인 |

## 2. Acceptance Criteria 상태

| AC | 기준 | 상태 | 근거 |
|---|---|---:|---|
| AC-1 | DB/off-chain 잔액 조작이 `voucherValue[tokenId]`를 변경하지 못함 | PASS | 잔액 source of truth는 public contract state |
| AC-2 | value setter 없음 | PASS | ABI/static test |
| AC-3 | `newValue = oldValue - amount` 내부 계산 | PASS | `_useVoucher` 구현 |
| AC-4 | backend/비소유자 direct 차감 실패 | PASS | direct revert test |
| AC-5 | owner signature 없는 대리 사용 실패 | PASS | wrong signer/invalid signature tests |
| AC-6 | replay 실패 | PASS | merchant replay test |
| AC-7 | event에 old/new/amount/nonce/commitment/usageHash 포함 | PASS | ABI/event assertion |
| AC-8 | event `usageHash` 재계산 일치 | PASS | direct/merchant success tests |
| AC-9 | 외부 `usageHash` 주입 API 없음 | PASS | ABI static test |
| AC-10 | zero `recordCommitmentHash` 실패 | PASS | direct/merchant revert tests |
| AC-11 | signed field tamper 실패 | PASS | amount/merchant/record/deadline/nonce tamper test |
| AC-12 | verifier `VERIFIED` | PASS | local verifier integration |
| AC-13 | verifier `MISMATCH` | PASS | mutated canonical detail test |
| AC-14 | verifier `MISSING_DB` | PASS | event-only test |
| AC-15 | verifier `MISSING_ONCHAIN` | PASS | record-only test |
| AC-15a | duplicate commitment finding | PASS | `DUPLICATE_COMMITMENT` test |
| AC-16 | 전체 회귀 테스트 통과 | PASS | `npm test` 12 passing |
| AC-17 | 문서 claim boundary 갱신 | PASS | docs updated |

## 3. 변경 파일

| 파일 | 변경 요약 |
|---|---|
| `contracts/Voucher.sol` | event/API/typehash를 `recordCommitmentHash`로 전환, `usageHash` 내부 계산 |
| `test/Voucher_Test.js` | canonical vector, direct/merchant, tamper, local verifier tests 추가 |
| `test/helpers/usageHashVerifier.js` | canonical usage detail hash, file-backed store, verifier result matrix 구현 |
| `build/contracts/Voucher.json` | Truffle compile 산출 ABI 갱신 |
| `scripts/voucher-mvp-test-report.md` | 최신 검증 리포트로 갱신 |
| `../docs/02-UX플로우.md` | 온체인 영구 상세 기록 과장 표현을 event anchor + off-chain verifier 범위로 정정 |
| `../docs/03-*`, `../docs/06-*`, `../docs/07-*` | RDB 불변 주장을 온체인 근거 기반 사후 탐지 범위로 정리 |

## 4. 검증 명령

```bash
cd blockchain && npm run compile
cd blockchain && npm test
```

최신 결과:

```text
npm run compile: exit 0, everything up to date
npm test: 12 passing
static/docs checks: usageHashInput=false, valueSetter=false, legacy hash name absent, diff --check PASS
```

## 5. 완료 판단 경계

| 항목 | 판단 |
|---|---|
| Contract/local verification | 완료 |
| Production DB verifier adapter | 후속 |
| Backend/frontend ABI migration | 후속 |
| RDB 자체 불변성 | 보장하지 않음 |
| 현실 결제 사실성/피싱/merchant key 탈취 방어 | v1 비범위 |
