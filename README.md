# Pixel Chat

![Pixel Chat Banner](docs/banner.svg)

픽셀 동물 캐릭터로 소통하는 데스크탑 오버레이 채팅 앱입니다.

## 특징

- **투명 오버레이** — 바탕화면 위에 떠있으며, 뒤쪽 앱도 정상 조작 가능
- **18종 픽셀 동물** — 고양이, 강아지, 토끼, 새, 개구리, 펭귄, 곰, 여우, 햄스터, 판다, 부엉이, 거북이, 병아리, 고래, 원숭이, 돼지, 용, 슬라임, 유령
- **방 코드 공유** — 같은 코드로 접속하면 동일 세션, 복사 버튼으로 간편 공유
- **실시간 위치 동기화** — 본인 캐릭터를 드래그로 이동, 모든 유저에게 반영
- **말풍선 채팅** — 메시지를 보내면 캐릭터 위에 말풍선 표시, 화면 밖으로 벗어나지 않도록 자동 보정
- **채팅 기록** — 최대 100건까지 저장, 기록 패널로 확인 가능
- **접속자 목록** — 접속 인원에 마우스를 올리면 현재 유저 목록 확인
- **캐릭터 호버** — 캐릭터에 마우스를 올리면 이름 툴팁 표시
- **자동 업데이트** — 서버 버전이 변경되면 클라이언트 자동 업데이트
- **항상 최상단** — 다른 창 위에 항상 표시
- **경량 빌드** — Tauri 기반, 실행파일 약 8MB

## 사전 요구사항

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://rustup.rs/) (클라이언트 빌드 시 필요)
- MSVC Build Tools (Windows, 클라이언트 빌드 시 필요)

## 실행 방법

### 1. 의존성 설치

```bash
cd server && npm install
cd ../client && npm install
```

### 2. 환경 변수 설정

루트 폴더에 `.env` 파일을 생성합니다 (`.env.example` 참고):

```env
VITE_SERVER_IP=127.0.0.1
VITE_SERVER_PORT=3031
VITE_HTTP_PORT=3030
```

### 3. 서버 실행

```bash
cd server
npm run dev
```

### 4. 클라이언트 실행

개발 모드:
```bash
cd client
npm run tauri:dev
```

빌드 (실행파일 생성):
```bash
cd client
npx tauri build
```

빌드 결과:
- 실행파일: `client/src-tauri/target/release/pixel-chat.exe`
- 인스톨러: `client/src-tauri/target/release/bundle/nsis/Pixel Chat_1.0.0_x64-setup.exe`

### 5. 서버에 프론트엔드 배포 (자동 업데이트용)

```bash
cd server
npm run deploy
```

클라이언트 빌드 결과물을 `server/public/`에 복사합니다. 서버 버전(`APP_VERSION`)을 올리면 클라이언트가 다음 실행 시 자동으로 서버의 최신 버전을 로드합니다.

## 사용법

1. 닉네임 입력 및 캐릭터 선택
2. **방 만들기** 또는 **방 코드로 참가**
3. 캐릭터를 드래그하여 위치 이동
4. 하단 입력창에서 채팅 (Enter로 전송)
5. 방 코드를 복사하여 친구에게 공유

## 기술 스택

- **클라이언트**: Tauri v2 + React + TypeScript + Vite
- **서버**: Node.js + WebSocket (ws) + HTTP (정적 파일 서빙)
- **렌더링**: HTML Canvas

## 프로젝트 구조

```
pixel-chat/
├── .env                        # 서버 IP/포트 설정
├── .env.example                # 환경 변수 예시
├── server/
│   ├── src/index.ts            # WebSocket + HTTP 서버
│   └── public/                 # 프론트엔드 배포 파일 (자동 업데이트용)
└── client/
    ├── src-tauri/
    │   ├── tauri.conf.json     # Tauri 설정
    │   └── src/main.rs         # 네이티브 윈도우 로직
    └── src/
        ├── App.tsx             # 버전 체크 + 상태 관리
        ├── assets/animals.ts   # 18종 픽셀 스프라이트 데이터
        └── components/
            ├── Lobby.tsx       # 로비 (접속 화면)
            ├── GameRoom.tsx    # 메인 화면
            └── PixelAnimal.tsx # 픽셀 렌더러
```
