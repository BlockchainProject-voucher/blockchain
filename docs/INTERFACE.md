# VoucherNFT — 백엔드 연동 인터페이스 명세

> **대상**: 백엔드 개발자  
> **필독**: §3 (tokenId 파싱), §5 (metadataHash 규약)은 연동 오류의 주요 원인이므로 반드시 숙지할 것.

---

## §1. 컨트랙트 메타정보

| 항목 | 값 |
|---|---|
| Solidity | `^0.8.20` |
| 표준 | ERC-721 (ERC721URIStorage) + AccessControl |
| 컴파일러 최적화 | `optimizer: true, runs: 200` |

### 배포 후 백엔드에 전달할 항목

| 항목 | 위치 |
|---|---|
| 컨트랙트 주소 | `deployments/<network>.json` → `address` |
| ABI | `artifacts/contracts/VoucherNFT.sol/VoucherNFT.json` → `abi` |
| 배포 블록 번호 | `deployments/<network>.json` → `blockNumber` (Scanner 시작점) |

---

## §2. 백엔드가 호출할 함수

### `mintVoucher(address to, string memory uri) → uint256 tokenId`

```
권한: MINTER_ROLE
가스: ~100,000 (추정)
```

사용자 신청이 승인될 때 호출한다. `tokenId`는 반환값과 Transfer 이벤트 양쪽에서 얻을 수 있다(§3 참조).

**ethers.js v6 예시**

```js
const tx = await voucherNFT.mintVoucher(userAddress, "ipfs://Qm...");
const receipt = await tx.wait();
// tokenId 파싱 → §3 참조
```

**Revert 조건**

| 에러 | 원인 |
|---|---|
| `AccessControlUnauthorizedAccount(caller, MINTER_ROLE)` | 호출자에게 MINTER_ROLE 없음 |

---

### `updateValue(uint256 tokenId, uint256 newValue, bytes32 metadataHash)`

```
권한: UPDATER_ROLE
가스: ~50,000 (추정)
```

사용자가 바우처를 사용하면 RDB 잔액 갱신 후 이 함수를 호출해 체인에 기록한다.

**ethers.js v6 예시**

```js
const metadataHash = ethers.keccak256(
  ethers.toUtf8Bytes(canonicalJson({ tokenId, oldAmount, newAmount, usedAt }))
);
const tx = await voucherNFT.updateValue(tokenId, newAmountBigInt, metadataHash);
await tx.wait();
```

**Revert 조건**

| 에러 | 원인 | 해결 |
|---|---|---|
| `AccessControlUnauthorizedAccount(caller, UPDATER_ROLE)` | 호출자에게 UPDATER_ROLE 없음 | 관리자가 `grantUpdaterRole` 호출 |
| `TokenDoesNotExist(tokenId)` | 해당 tokenId가 mint된 적 없음 | tokenId 확인 |
| `InvalidMetadataHash()` | `metadataHash == bytes32(0)` | §5 규약대로 해시 생성 |

> ⚠️ **주의**: `newValue == oldValue`인 경우에도 revert 없이 성공하고 이벤트가 emit된다. 중복 호출 방지는 백엔드에서 처리해야 한다.

---

### 역할 관리 함수 (관리자 전용)

```js
// 모두 DEFAULT_ADMIN_ROLE 필요
await voucherNFT.grantMinterRole(backendWallet);
await voucherNFT.grantUpdaterRole(backendWallet);
await voucherNFT.revokeUpdaterRole(compromisedWallet);
```

---

## §3. mintVoucher 후 tokenId 파싱 가이드

> ⚠️ **흔한 실수**: `tx.wait()`의 반환값(receipt)에서 tokenId를 읽어야 한다.  
> `mintVoucher`의 반환값(`uint256`)은 ethers.js에서 트랜잭션 결과가 아닌 정적 call로만 읽을 수 있으므로, 실제 mint 후 tokenId는 이벤트에서 파싱해야 한다.

### 방법 A — topics[3] 직접 접근 (권장: ABI 불필요)

ERC-721 `Transfer(address indexed from, address indexed to, uint256 indexed tokenId)` 이벤트는:
- `topics[0]` = `keccak256("Transfer(address,address,uint256)")`
- `topics[1]` = `from` (32바이트 패딩, mint 시 address(0))
- `topics[2]` = `to` (32바이트 패딩)
- `topics[3]` = `tokenId` (32바이트 패딩 uint256) ← **여기서 읽는다**

```js
const TRANSFER_SIG = ethers.id("Transfer(address,address,uint256)");

const tx = await voucherNFT.mintVoucher(userAddress, uri);
const receipt = await tx.wait();

const transferLog = receipt.logs.find((l) => l.topics[0] === TRANSFER_SIG);
const tokenId = BigInt(transferLog.topics[3]); // ✅ 반드시 BigInt로 변환
```

> ⚠️ `Number(transferLog.topics[3])`은 **절대 사용 금지**. uint256 범위에서 JavaScript Number의 정밀도(2^53)를 초과하면 잘못된 값이 된다.

### 방법 B — interface.parseLog (ABI 필요)

```js
const parsed = voucherNFT.interface.parseLog({
  topics: transferLog.topics,
  data: transferLog.data,
});
const tokenId = parsed.args.tokenId; // ethers v6: BigInt 반환
```

### 두 방법 교차 검증 (권장)

```js
const tokenIdA = BigInt(transferLog.topics[3]);
const tokenIdB = voucherNFT.interface.parseLog({ topics: transferLog.topics, data: transferLog.data }).args.tokenId;
if (tokenIdA !== tokenIdB) throw new Error("tokenId mismatch — ABI might be stale");
const tokenId = tokenIdA;
```

---

## §4. 이벤트 스펙 + Scanner Polling 예시

### Transfer (ERC-721 표준)

```
event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
```

| 필드 | indexed | 설명 |
|---|---|---|
| `from` | ✅ | mint 시 `address(0)` |
| `to` | ✅ | 수신자 주소 |
| `tokenId` | ✅ | 발급된 NFT ID |

### ValueUpdated (커스텀)

```
event ValueUpdated(
  uint256 indexed tokenId,
  address indexed updater,
  uint256 oldValue,
  uint256 newValue,
  bytes32 metadataHash
)
```

| 필드 | indexed | 설명 |
|---|---|---|
| `tokenId` | ✅ | 잔액이 변경된 NFT ID |
| `updater` | ✅ | 호출한 백엔드 지갑 주소 |
| `oldValue` | ❌ | 변경 전 잔액 (원 단위) |
| `newValue` | ❌ | 변경 후 잔액 (원 단위) |
| `metadataHash` | ❌ | RDB JSON의 keccak256 해시 |

### Scanner Polling 예시 (ethers.js v6)

```js
// 전체 수집 (최초 동기화)
const fromBlock = DEPLOY_BLOCK_NUMBER;
const allValueUpdated = await voucherNFT.queryFilter(
  voucherNFT.filters.ValueUpdated(),
  fromBlock,
  "latest"
);

// 특정 tokenId만 필터링
const tokenFilter = voucherNFT.filters.ValueUpdated(targetTokenId); // BigInt
const events = await voucherNFT.queryFilter(tokenFilter, fromBlock, "latest");

// args 접근 패턴
for (const event of events) {
  const { tokenId, updater, oldValue, newValue, metadataHash } = event.args;
  // tokenId, oldValue, newValue: BigInt
  // updater: string (checksummed address)
  // metadataHash: string ("0x..." 32바이트 hex)
  // event.blockNumber: number
  // event.transactionHash: string
}
```

> ⚠️ **Polling 시 주의**: `queryFilter`는 노드의 블록 범위 제한(`eth_getLogs`)이 있다.  
> Sepolia 공용 RPC는 보통 최대 10,000 블록 범위를 허용한다. 대량 수집 시 청크로 나눠야 한다.

---

## §5. metadataHash 생성 규약

### 목적

`updateValue` 호출 시 RDB에 저장된 잔액 변경 레코드의 keccak256 해시를 함께 기록한다.  
이를 통해 온체인 이벤트 ↔ 오프체인 RDB 레코드의 무결성을 검증할 수 있다.

### Canonical JSON 규칙

> ⚠️ **JSON 직렬화 순서가 다르면 해시가 달라진다.** 아래 규칙을 반드시 준수할 것.

1. 키는 **알파벳 오름차순** 정렬
2. 공백 없음 (compact JSON)
3. 숫자 필드는 `string`이 아닌 **JSON number** 타입 사용
4. `usedAt`은 UNIX timestamp (초 단위 정수)

### 포함 필드 (updateValue 호출 시)

```json
{
  "merchantId": 42,
  "newAmount": 500,
  "oldAmount": 1000,
  "tokenId": 7,
  "usedAt": 1717200000,
  "usedAmount": 500
}
```

### 예시 코드

**Node.js / TypeScript**

```ts
import { ethers } from "ethers";

function canonicalJson(data: object): string {
  const sorted = Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
  );
  return JSON.stringify(sorted); // compact, no spaces
}

function buildMetadataHash(record: {
  merchantId: number;
  newAmount: number;
  oldAmount: number;
  tokenId: number;
  usedAt: number;       // UNIX timestamp in seconds
  usedAmount: number;
}): string {
  const json = canonicalJson(record);
  return ethers.keccak256(ethers.toUtf8Bytes(json));
}

// 사용 예시
const hash = buildMetadataHash({
  merchantId: 42,
  newAmount: 500,
  oldAmount: 1000,
  tokenId: 7,
  usedAt: Math.floor(Date.now() / 1000),
  usedAmount: 500,
});
// hash === "0x..."  (32바이트 hex string)
```

**검증 방법 (RDB ↔ 온체인 무결성 확인)**

```ts
// 1. 온체인 이벤트에서 metadataHash 읽기
const events = await voucherNFT.queryFilter(voucherNFT.filters.ValueUpdated(tokenId));
const onChainHash = events[events.length - 1].args.metadataHash;

// 2. RDB 레코드로 해시 재계산
const rdbRecord = await db.getRecord(tokenId, txHash);
const recomputedHash = buildMetadataHash(rdbRecord);

// 3. 비교
if (onChainHash !== recomputedHash) {
  throw new Error(`Integrity violation: tokenId=${tokenId}`);
}
```

> ⚠️ **흔한 실수**:
> - JSON 키 순서가 삽입 순서(예: `tokenId` 먼저)이면 해시가 달라진다. 반드시 정렬할 것.
> - `BigInt`를 JSON에 직렬화하면 기본 동작이 에러이므로, number 타입으로 변환 후 직렬화한다.
> - `usedAt`을 millisecond로 저장하면 체인 기록과 불일치가 생긴다. 초 단위(UNIX timestamp)만 사용.

---

## §6. 에러 핸들링 — 커스텀 에러 catch 패턴

OZ v5 및 이 컨트랙트의 모든 revert는 **커스텀 에러**를 사용한다 (revert string 없음).

**ethers.js v6 catch 패턴**

```ts
import { Contract, ContractTransactionResponse, ethers } from "ethers";

async function safeUpdateValue(
  contract: Contract,
  tokenId: bigint,
  newValue: bigint,
  metadataHash: string
) {
  try {
    const tx = await contract.updateValue(tokenId, newValue, metadataHash);
    await tx.wait();
  } catch (err: any) {
    // ethers v6: err.code === "CALL_EXCEPTION", err.data contains error selector
    if (err.data) {
      const iface = contract.interface;
      try {
        const decoded = iface.parseError(err.data);
        switch (decoded.name) {
          case "TokenDoesNotExist":
            console.error(`Token ${decoded.args[0]} does not exist`);
            break;
          case "InvalidMetadataHash":
            console.error("metadataHash is zero — check canonical JSON generation");
            break;
          case "AccessControlUnauthorizedAccount":
            console.error(`Wallet ${decoded.args[0]} lacks role ${decoded.args[1]}`);
            break;
          default:
            console.error(`Unknown error: ${decoded.name}`);
        }
      } catch {
        console.error("Unrecognized revert:", err);
      }
    }
    throw err;
  }
}
```

> ⚠️ **주의**: `err.message`의 문자열 매칭으로 에러를 식별하지 말 것.  
> 노드 종류(Hardhat/Infura/Alchemy)마다 메시지 포맷이 다르다.  
> `iface.parseError(err.data)`가 유일하게 신뢰할 수 있는 방법이다.
