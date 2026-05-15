# blockchain-Voucher

ERC-721 기반 바우처 NFT 발급 및 잔액 관리 스마트 컨트랙트.
백엔드 운영 지갑이 모든 트랜잭션을 수행하며, 프론트엔드는 컨트랙트와 직접 통신하지 않는다.

---

## 목차

1. [컨트랙트 구조](#컨트랙트-구조)
2. [환경 요구사항](#환경-요구사항)
3. [설치](#설치)
4. [실행 순서 (End-to-End)](#실행-순서-end-to-end)
5. [주요 명령](#주요-명령)
6. [테스트](#테스트)
7. [디렉토리 구조](#디렉토리-구조)
8. [백엔드 ↔ 블록체인 연동](#백엔드--블록체인-연동)
9. [백엔드 담당자에게 전달할 항목](#백엔드-담당자에게-전달할-항목)
10. [트러블슈팅](#트러블슈팅)

---

## 컨트랙트 구조

```
AccessManager   — Role 상수 (MINTER_ROLE, UPDATER_ROLE) + 권한 부여/회수
ValueStorage    — 바우처 잔액 mapping + ValueUpdated 이벤트 정의
ValueUpdater    — updateValue 로직 (CEI 패턴, 권한·존재·해시 검증)
VoucherNFT      — ERC-721URIStorage + ValueUpdater 통합, mintVoucher 진입점
```

배포되는 컨트랙트는 `VoucherNFT.sol` 하나이며, 나머지 3개는 모두 그 안에 상속되어 합쳐진다.

### 의존성

| 항목 | 버전 |
|---|---|
| Solidity | `0.8.28` |
| EVM Version | `cancun` |
| OpenZeppelin Contracts | `^5.0.0` |
| Hardhat | `^2.22.0` (테스트 2.28까지 확인) |

> ⚠️ OZ v5는 v4와 AccessControl 에러 처리 방식이 다르다 (revert string → custom error). 백엔드/프론트엔드의 에러 파싱 로직은 반드시 v5 기준으로 작성한다.

---

## 환경 요구사항

| 도구 | 버전 | 비고 |
|---|---|---|
| Node.js | LTS (18~20 권장) | v23은 Hardhat 공식 미지원이지만 동작은 함 |
| npm | Node.js 동봉 | |
| (백엔드 연동 시) JDK | 17 이상 | Spring Boot 3.2 기준 |
| (백엔드 연동 시) MySQL | 8.x | `voucher` 데이터베이스 필요 |

---

## 설치

```bash
cd blockchain
npm install
```

### `.env` 파일 (Sepolia 배포 시에만 필요)

로컬 개발(`localhost` 네트워크)은 Hardhat 내장 계정을 자동으로 사용하므로 `.env`가 **불필요**하다.

Sepolia 배포·검증 시에만 다음 절차를 따른다:

```bash
cp .env.example .env
# 에디터로 값 입력
```

| 변수 | 설명 |
|---|---|
| `SEPOLIA_RPC_URL` | Infura/Alchemy 등 Sepolia RPC URL |
| `PRIVATE_KEY` | 배포자 지갑 private key (0x 제외) |
| `BACKEND_WALLET_ADDRESS` | 배포자와 다른 백엔드 지갑 (옵션) |
| `ETHERSCAN_API_KEY` | 배포 후 컨트랙트 검증용 |
| `CONTRACT_NAME` / `CONTRACT_SYMBOL` | 기본값 `Voucher` / `VCH` |

---

## 실행 순서 (End-to-End)

백엔드와 함께 로컬에서 전체 시스템을 띄우는 절차다.

### 사전 준비 (최초 1회)

```bash
# 1. MySQL 설치 및 시작
brew install mysql
brew services start mysql
mysql -u root -e "CREATE DATABASE IF NOT EXISTS voucher CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. JDK 설정 (백엔드 빌드용)
brew install --cask temurin@17
echo 'export JAVA_HOME=$(/usr/libexec/java_home)' >> ~/.zshrc
source ~/.zshrc

# 3. 블록체인 의존성 설치
cd blockchain
npm install

# 4. Gradle Wrapper jar 누락 시 다운로드 (backend 실행 전)
ls ../backend/gradle/wrapper/gradle-wrapper.jar 2>/dev/null || \
  curl -sL https://raw.githubusercontent.com/gradle/gradle/v8.8.0/gradle/wrapper/gradle-wrapper.jar \
    -o ../backend/gradle/wrapper/gradle-wrapper.jar
chmod +x ../backend/gradlew
```

### 매번 개발할 때 (3개의 터미널 필요)

#### 터미널 1 — Hardhat 로컬 노드

```bash
cd blockchain
npx hardhat node
```

> 노드가 실행 중인 동안 계속 켜둘 것. 끄면 모든 온체인 상태가 초기화된다.

#### 터미널 2 — 컨트랙트 배포

```bash
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
```

출력에서 `Contract address`를 확인한다. 보통 `0x5FbDB2315678afecb367f032d93F642f64180aa3`로 고정되지만, 다른 트랜잭션이 먼저 발생했다면 달라질 수 있다.

배포 정보는 `deployments/localhost.json`에 자동 저장된다.

#### 백엔드 `application.yml` 확인

`backend/src/main/resources/application.yml`의 `contract-address`가 배포된 주소와 일치하는지 확인한다. 다르면 수정한다.

```yaml
blockchain:
  rpc-url: "http://localhost:8545"
  private-key: "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  contract-address: "0x5FbDB2315678afecb367f032d93F642f64180aa3"
```

> ⚠️ **세 값 모두 반드시 따옴표로 감쌀 것.**
> - SnakeYAML이 `0x...`를 16진수 정수로 자동 파싱해 값이 깨진다.
> - `private-key`는 `0x` prefix를 **빼고** 입력한다 (web3j `Credentials.create()` 사양).

#### 터미널 2 — 백엔드 실행

```bash
cd ../backend
./gradlew bootRun
```

`Started VoucherApplication` 메시지가 뜨면 성공.

#### 터미널 3 — API 테스트

```bash
# Merchant 생성
curl -X POST http://localhost:8080/api/members/merchant \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","nickname":"M","category":"Coffee"}'

# User 생성
curl -X POST http://localhost:8080/api/members/user \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","nickname":"U"}'

# Merchant를 ADMIN으로 승격 (프로그램 생성 권한)
mysql -u root voucher -e \
  "UPDATE member SET role='ADMIN' WHERE wallet_address='0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';"

# 바우처 프로그램 생성
curl -X POST http://localhost:8080/api/voucher-programs \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","name":"10000원 쿠폰","description":"테스트","maxValue":10000,"validFrom":"2026-01-01T00:00:00","validUntil":"2027-01-01T00:00:00"}'

# 바우처 발급 (NFT 민팅)
curl -X POST http://localhost:8080/api/vouchers \
  -H "Content-Type: application/json" \
  -d '{"voucherProgramId":1,"walletAddress":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"}'
```

### 온체인 검증

```bash
cd blockchain
npx hardhat console --network localhost
```

```javascript
const abi = require("./artifacts/contracts/VoucherNFT.sol/VoucherNFT.json").abi;
const c = new ethers.Contract("0x5FbDB2315678afecb367f032d93F642f64180aa3", abi, ethers.provider);
await c.ownerOf(0);    // → 수령자 지갑 주소
await c.tokenURI(0);   // → http://localhost:8080/api/metadata/<programId>
await c.getValue(0);   // → 0n (mint 직후 잔액은 0)
.exit
```

### DB 초기화 (재테스트 시)

```bash
mysql -u root voucher -e "SET FOREIGN_KEY_CHECKS=0; \
  TRUNCATE TABLE voucher; TRUNCATE TABLE voucher_program; \
  TRUNCATE TABLE member; SET FOREIGN_KEY_CHECKS=1;"
```

---

## 주요 명령

```bash
# 컴파일
npm run compile

# 테스트 (Hardhat 내장 네트워크 자동 사용)
npm run test

# 로컬 노드 실행
npm run node                  # 또는 npx hardhat node

# 로컬 배포 (node 실행 후 별도 터미널에서)
npm run deploy:local          # 또는 npx hardhat run scripts/deploy.js --network localhost

# Sepolia 배포 (.env 필요)
npm run deploy:sepolia

# Etherscan 검증 (배포 후)
npm run verify:sepolia
```

---

## 테스트

`npm run test`는 `test/VoucherNFT.test.js`를 진입점으로 5개의 서브 스위트를 실행한다. 각 테스트는 `fixture.js`의 `loadFixture(deployVoucherNFT)`로 컨트랙트를 새로 배포해 상태를 격리한다.

| 파일 | 검증 내용 |
|---|---|
| `test/VoucherNFT.test.js` | 진입점. 5개의 서브 스위트를 순차 실행 |
| `test/fixture.js` | 공통 배포 fixture (테스트마다 클린 상태) |
| `test/deployment.test.js` | 배포 후 초기 상태 (role 부여, name/symbol, 첫 tokenId=0) |
| `test/roleManagement.test.js` | grant/revoke MINTER·UPDATER 권한 검증 |
| `test/mint.test.js` | mintVoucher, topics[3] 파싱, 연속 mint tokenId 증가 |
| `test/updateValue.test.js` | 잔액 갱신, 커스텀 에러 (`TokenDoesNotExist`, `InvalidMetadataHash`) |
| `test/eventScan.test.js` | 백엔드 Scanner 시뮬레이션, indexed 필터링 |

> 테스트 실행 시 `npx hardhat node`를 따로 띄울 필요 없다. Hardhat이 내부에서 임시 네트워크를 자동 생성한다.

---

## 디렉토리 구조

```
blockchain/
├── contracts/
│   ├── AccessManager.sol       # Role 상수 + grant/revoke 함수
│   ├── ValueStorage.sol        # 잔액 mapping + ValueUpdated 이벤트
│   ├── ValueUpdater.sol        # updateValue 로직 (권한·존재·해시 검증)
│   └── VoucherNFT.sol          # 최종 배포 컨트랙트 (위 3개 상속 + mintVoucher)
├── scripts/
│   ├── deploy.js               # 로컬/Sepolia 배포 진입점
│   ├── verify.js               # Etherscan 검증 스크립트
│   └── utils/
│       ├── roleSetup.js        # 배포 후 백엔드 지갑에 MINTER/UPDATER 부여
│       └── saveDeployment.js   # deployments/<network>.json 저장/로드
├── test/
│   ├── VoucherNFT.test.js      # 테스트 진입점 (서브 스위트 5개 호출)
│   ├── fixture.js              # loadFixture용 공통 배포 함수
│   ├── deployment.test.js
│   ├── roleManagement.test.js
│   ├── mint.test.js
│   ├── updateValue.test.js
│   └── eventScan.test.js
├── deployments/
│   └── localhost.json          # 배포 시 자동 생성 (address, blockNumber, txHash)
├── artifacts/                  # 컴파일 결과물 (ABI 포함)
│   └── contracts/VoucherNFT.sol/VoucherNFT.json
├── docs/
│   └── INTERFACE.md            # 백엔드 연동 가이드 (tokenId 파싱, metadataHash 규약)
├── hardhat.config.js
├── package.json
├── .env.example
└── README.md
```

---

## 백엔드 ↔ 블록체인 연동

백엔드는 web3j 라이브러리로 컨트랙트와 통신한다. 모든 트랜잭션은 백엔드 운영 지갑(MINTER_ROLE/UPDATER_ROLE 보유)이 서명한다.

### 1. 백엔드가 호출하는 트랜잭션 함수

#### ✅ 현재 백엔드가 호출 중

| 함수 | 위치 | 백엔드 호출 코드 | 역할 |
|---|---|---|---|
| `mintVoucher(address to, string uri)` | `contracts/VoucherNFT.sol:80` | `BlockchainService.sendMintTx()` | NFT 발행. MINTER_ROLE 필요. Transfer 이벤트로 새 tokenId emit |

#### 🔜 백엔드 미구현 (추후 개발 필요)

| 함수 | 위치 | 역할 |
|---|---|---|
| `updateValue(uint256 tokenId, uint256 newValue, bytes32 metadataHash)` | `contracts/ValueUpdater.sol:60` | 바우처 잔액 변경 (사용/충전). UPDATER_ROLE 필요. `ValueUpdated` 이벤트 emit |
| `grantMinterRole(address)` | `contracts/AccessManager.sol:23` | MINTER_ROLE 부여. ADMIN만 호출 가능 |
| `grantUpdaterRole(address)` | `contracts/AccessManager.sol:31` | UPDATER_ROLE 부여. ADMIN만 호출 가능 |
| `revokeUpdaterRole(address)` | `contracts/AccessManager.sol:39` | UPDATER_ROLE 회수 |

### 2. 백엔드가 조회하는 view 함수 (트랜잭션 아님)

| 함수 | 위치 | 역할 | 사용 시점 |
|---|---|---|---|
| `ownerOf(uint256 tokenId)` | ERC-721 표준 | NFT 소유자 조회 | 소유권 검증 |
| `tokenURI(uint256 tokenId)` | `contracts/VoucherNFT.sol:107` | 토큰 메타데이터 URI 반환 | OpenSea/메타데이터 검증 |
| `getValue(uint256 tokenId)` | `contracts/ValueStorage.sol:46` | 바우처 현재 잔액 | DB와 온체인 잔액 일치 검증 |
| `values(uint256)` | `contracts/ValueStorage.sol:13` | 잔액 mapping public getter | `getValue`와 동일 결과 |
| `hasRole(bytes32 role, address account)` | AccessControl 표준 | Role 보유 여부 | 백엔드 지갑 권한 진단 |

### 3. 백엔드가 수신하는 이벤트

#### Transfer (ERC-721 표준, `_mint` 내부 emit)
```solidity
event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
```
- **발생 시점**: `mintVoucher()` 호출 시 (`from = address(0)`)
- **백엔드 사용처**: `BlockchainService.extractTokenId()` — receipt log의 `topics[3]`에서 tokenId 추출
- **특징**: tokenId가 indexed이므로 ABI 없이 raw log에서 직접 파싱 가능

#### ValueUpdated
```solidity
// contracts/ValueStorage.sol:23
event ValueUpdated(
    uint256 indexed tokenId,
    address indexed updater,
    uint256 oldValue,
    uint256 newValue,
    bytes32 metadataHash
);
```
- **발생 시점**: `updateValue()` 호출 시
- **백엔드 사용처**: 현재 미구현. 잔액 변경 추적 Scanner 구현 시 활용

### 4. 권한(Role) 구조

| Role | 상수 위치 | 보유자 | 권한 |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | OZ AccessControl 표준 | 배포자 | 다른 Role 부여/회수 |
| `MINTER_ROLE` | `contracts/AccessManager.sol:14` | 배포자 + 백엔드 지갑 | `mintVoucher()` 호출 |
| `UPDATER_ROLE` | `contracts/AccessManager.sol:17` | 배포자 + 백엔드 지갑 | `updateValue()` 호출 |

> `deploy.js`는 deployer에게 3개 Role을 자동 부여한다 (생성자 로직). `BACKEND_WALLET_ADDRESS`가 별도로 지정된 경우 `grantInitialRoles`로 MINTER/UPDATER를 추가 부여한다.

### 5. 호출 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│ Backend (BlockchainService.java)                            │
└─────────────────────────────────────────────────────────────┘
        │                                          ▲
        │ ① sendMintTx()                          │ ④ extractTokenId()
        │   → mintVoucher(to, uri)                │   ← Transfer 이벤트 topics[3]
        ▼                                          │
┌─────────────────────────────────────────────────────────────┐
│ VoucherNFT.sol                                              │
│  ├─ mintVoucher(address, string) ← MINTER_ROLE              │
│  ├─ tokenURI(uint256)            [view]                     │
│  └─ ownerOf(uint256)             [view]                     │
│                                                             │
│ inherits ValueUpdater.sol                                   │
│  └─ updateValue(uint256, uint256, bytes32) ← UPDATER_ROLE   │
│      [백엔드 미구현 — 잔액 변경 시 필요]                       │
│                                                             │
│ inherits ValueStorage.sol                                   │
│  ├─ getValue(uint256)            [view]                     │
│  └─ event ValueUpdated(tokenId, updater, old, new, hash)    │
│                                                             │
│ inherits AccessManager.sol                                  │
│  ├─ grantMinterRole(address)     ← ADMIN                    │
│  ├─ grantUpdaterRole(address)    ← ADMIN                    │
│  └─ revokeUpdaterRole(address)   ← ADMIN                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 백엔드 담당자에게 전달할 항목

배포 후 아래 항목을 백엔드 팀에 전달한다.

1. **컨트랙트 주소** — `deployments/<network>.json` → `address`
2. **ABI** — `artifacts/contracts/VoucherNFT.sol/VoucherNFT.json` → `abi`
3. **배포 블록 번호** — `deployments/<network>.json` → `blockNumber` (Scanner 시작점)
4. **백엔드 지갑 Role** — 배포자가 아닌 백엔드 지갑이라면 MINTER_ROLE/UPDATER_ROLE 부여 완료 여부 확인
5. **연동 가이드** — [`docs/INTERFACE.md`](docs/INTERFACE.md) (tokenId 파싱 규약, metadataHash 계산 규칙 포함)

---

## 트러블슈팅

### Hardhat 노드 재시작 후 백엔드 연결 실패

Hardhat 노드를 끄면 모든 온체인 상태가 사라진다. 컨트랙트도 재배포해야 한다.

```bash
# 1. 다시 노드 실행
npx hardhat node

# 2. 다시 배포
npx hardhat run scripts/deploy.js --network localhost

# 3. 배포된 주소가 application.yml의 contract-address와 다르면 수정
```

### 백엔드 민팅 시 `unexpected length` 에러

원인: `application.yml`의 `contract-address`가 따옴표 없이 입력되어 SnakeYAML이 16진수 정수로 파싱했다.

해결:
```yaml
contract-address: "0x5FbDB2315678afecb367f032d93F642f64180aa3"   # 반드시 따옴표
```

### 백엔드 민팅 시 `Scalar is not in the interval [1, n - 1]` 에러

원인: `private-key`에 `0x` prefix가 포함되어 있다.

해결: prefix 제거
```yaml
private-key: "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
```

### `npm run test` 시 Node.js 버전 경고

Hardhat은 Node.js v23을 공식 지원하지 않는다. 동작은 하지만 안정성을 위해 LTS(v18 또는 v20)를 권장한다.

```bash
# nvm 사용 시
nvm install 20
nvm use 20
```

### 8080 포트 충돌 (백엔드 실행 시)

```bash
kill -9 $(lsof -ti :8080)
./gradlew bootRun
```
