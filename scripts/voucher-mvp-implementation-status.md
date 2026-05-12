# Voucher MVP 구현 상태 문서

작성 시각: 2026-05-08 01:50 KST
기준 문서: `.omx/plans/prd-blockchain-voucher-mvp.md`, `.omx/plans/test-spec-blockchain-voucher-mvp.md`
검증 기준 repo: `dev/blockchain`

## 1. 결론

Blockchain Voucher Contract MVP는 현재 `dev/blockchain` 범위에서 구현 및 단위/통합 테스트 검증이 완료된 상태다. 다만 Backend web3j 연동, Frontend QR/지갑 UX, 전체 E2E 데모, IPFS 자동화, 공개망 배포, 실제 결제/PG는 계획 문서 기준 후속 과제이며 이번 완료 범위에 포함하지 않는다.

| 항목 | 현재 상태 | 근거 |
|---|---:|---|
| 컨트랙트 구현 | 완료 | `contracts/Voucher.sol`, `contracts/VoucherDTO.sol` |
| Migration | 완료 | `migrations/2_deploy_voucher.js` |
| Truffle compile | PASS | `npm run compile` exit 0 |
| Truffle test | PASS | `npm test` 8 passing, exit 0 |
| ABI 산출 | 완료 | `build/contracts/Voucher.json` |
| ABI 핵심 함수/이벤트 | PASS | `mintVoucher`, `useVoucher`, `useVoucherByMerchant`, `VoucherUsed` 존재 |
| 테스트 리포트 정합성 | 완료 | `scripts/voucher-mvp-test-report.md` 갱신 |
| Backend/Frontend 구현 | 후속 | PRD out-of-scope 및 deep-interview non-goal |
| 전체 E2E 데모 | 후속 | PRD out-of-scope 및 deep-interview non-goal |

## 2. 구현 범위 매핑

| PRD 범위 | 대상 | 상태 | 비고 |
|---|---|---:|---|
| DTO | `contracts/VoucherDTO.sol` | 완료 | `VoucherProgram`, `VoucherInfo` 기준 |
| 컨트랙트 | `contracts/Voucher.sol` | 완료 | ERC721Enumerable + Ownable + EIP712 기반 |
| 배포 | `migrations/2_deploy_voucher.js` | 완료 | Voucher 배포 포함 |
| 테스트 | `test/Voucher_Test.js`, `test/Ticket_Test.js` | 검증 완료 | 8 passing |
| ABI | `build/contracts/Voucher.json` | 검증 완료 | 후속 backend 연동 입력 |
| 문서 | `scripts/voucher-mvp-test-report.md` | 완료 | 현재 PASS 결과 반영 |

## 3. Acceptance Criteria 상태

| ID | 기준 | 상태 | 근거 |
|---|---|---:|---|
| AC-1 | G-1~G-4 결과 기록 | 완료 | `.omx/state/blockchain-voucher-gates.md` 및 본 문서 검증 섹션 |
| AC-2 | `truffle compile` 성공 | PASS | `npm run compile` exit 0 |
| AC-3 | `truffle test` 성공 | PASS | `npm test` 8 passing |
| AC-4 | owner만 `createVoucherProgram`, `mintVoucher`, `approveMerchant` 성공 | PASS | `Voucher_Test.js` owner permissions |
| AC-5 | non-owner의 owner-only 함수 호출은 revert | PASS | `Voucher_Test.js` owner permissions |
| AC-6 | mint 후 `ownerOf`, `voucherValue`, `getVoucherInfo`, `getTokenURI`, `tokenURI` 값 일치 | PASS | `Voucher_Test.js` mint and read model |
| AC-7 | 직접 `useVoucher` 성공 시 잔액 감소, nonce 증가, `VoucherUsed` 이벤트 값 일치 | PASS | `Voucher_Test.js` direct useVoucher |
| AC-8 | 직접 `useVoucher`는 미소유자/미승인 가맹점/0원/잔액 부족/만료에서 revert | PASS | `Voucher_Test.js` direct useVoucher revert matrix |
| AC-9 | `useVoucherByMerchant`는 유효 EIP-712 서명으로 성공 | PASS | `Voucher_Test.js` merchant EIP-712 success |
| AC-10 | 가맹점 호출은 같은 서명 재사용 시 revert | PASS | `Voucher_Test.js` merchant EIP-712 replay |
| AC-11 | 잘못된 signer, 미승인 가맹점, 만료 deadline, 잔액 부족에서 revert | PASS | `Voucher_Test.js` merchant EIP-712 revert matrix |
| AC-12 | canonical typed tuple fixture hash와 이벤트 `metadataHash`가 정확히 일치 | PASS | `Voucher_Test.js` metadataHash assertion |
| AC-13 | DB 상세 JSON 원문과 `UseRecord` 상세 내역은 컨트랙트 state에 저장하지 않음 | 충족 | 컨트랙트는 hash/event 및 voucher state 중심 |
| AC-14 | ABI에서 핵심 함수/이벤트 확인 가능 | PASS | ABI check 4개 항목 true |
| AC-15 | backend ABI 불일치가 후속 risk로 문서화됨 | 완료 | 후속 과제 섹션 |

## 4. 검증 환경 및 도구 확인

| 도구 | 확인 결과 | 사용 여부 |
|---|---|---|
| Redis | `redis-server v8.6.3` | 미사용: 이번 범위는 blockchain 문서/검증 |
| MySQL | `mysql 9.6.0` | 미사용: 이번 범위는 blockchain 문서/검증 |
| Ganache | `ganache v7.9.1` | 사용: Truffle `test` network provider |
| Truffle | `Truffle v5.11.5` | 사용: compile/test |

`µWS` native binary 경고는 Ganache가 Node.js 구현으로 fallback한다는 경고이며, 이번 검증에서는 compile/test exit code 0으로 완료됐다.

## 5. 실행한 검증

### 5.1 Compile

```bash
cd dev/blockchain && npm run compile
```

결과:

```text
Compiling your contracts...
===========================
> Everything is up to date, there is nothing to compile.
compile_exit=0
```

### 5.2 Test

```bash
cd dev/blockchain && npm test
```

결과:

```text
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

### 5.3 ABI 확인

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

## 6. 후속 구현 및 테스트 계획

| 우선순위 | 후속 과제 | 구현 계획 | 테스트 계획 |
|---:|---|---|---|
| 1 | Backend web3j 연동 | `Voucher.json` ABI 기반 Java wrapper/service 연동 | 로컬 Ganache 대상 contract call integration test |
| 2 | Frontend QR/지갑 UX | 바우처 조회/사용 요청 화면과 서명 UX 설계 | 지갑 서명, QR payload, 오류 상태 UI 검증 |
| 3 | 전체 E2E 데모 | create program → mint → user/merchant use → backend 기록 대조 | backend+frontend+chain 통합 시나리오 |
| 4 | IPFS/파일 저장 자동화 | DB JSON 또는 metadata 원문 저장소 정책 결정 | metadataHash와 원문 재계산 일치 검증 |
| 5 | 공개망 배포 | 네트워크별 migration/config/주소 관리 | testnet 배포 후 explorer/contract call 검증 |

## 7. 완료 판단 경계

이번 문서 기준으로 “Blockchain Voucher Contract MVP”는 완료로 판단한다. 그러나 “서비스 전체 MVP” 또는 “백엔드/프론트 포함 E2E 완료”로 표현하면 안 된다.
