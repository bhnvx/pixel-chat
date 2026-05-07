# Pixel Chat

![Pixel Chat Banner](docs/banner.svg)

픽셀 동물 캐릭터로 소통하는 데스크탑 오버레이 채팅 앱입니다.

## 특징

- **투명 오버레이** — 바탕화면 위에 떠있으며, 뒤쪽 앱도 정상 조작 가능
- **18종 픽셀 동물** — 고양이, 강아지, 토끼, 새, 개구리, 펭귄, 곰, 여우, 햄스터, 판다, 부엉이, 거북이, 병아리, 고래, 원숭이, 돼지, 용, 슬라임, 유령
- **방 코드 공유** — 같은 코드로 접속하면 동일 세션
- **실시간 위치 동기화** — 본인 캐릭터를 드래그로 이동, 모든 유저에게 반영
- **말풍선 채팅** — 메시지를 보내면 캐릭터 위에 말풍선 표시
- **채팅 기록** — 최대 100건까지 저장, 기록 패널로 확인 가능
- **항상 최상단** — 다른 창 위에 항상 표시

## 실행 방법

### 1. 의존성 설치

```bash
cd server && npm install
cd ../client && npm install
```

### 2. 환경 변수 설정

루트 폴더의 `.env` 파일에서 서버 IP를 설정합니다:

```env
VITE_SERVER_IP=192.168.103.196
VITE_SERVER_PORT=3031
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
npm run dev
```

빌드 (실행파일 생성):
```bash
cd client
npm run build
```

빌드 결과: `client/release/win-unpacked/Pixel Chat.exe`

## 사용법

1. 닉네임 입력 및 캐릭터 선택
2. **방 만들기** 또는 **방 코드로 참가**
3. 캐릭터를 드래그하여 위치 이동
4. 하단 입력창에서 채팅 (Enter로 전송)
5. 방 코드를 복사하여 친구에게 공유

## 기술 스택

- **클라이언트**: Electron + React + TypeScript + Vite
- **서버**: Node.js + WebSocket (ws)
- **렌더링**: HTML Canvas

## 프로젝트 구조

```
session_cat/
├── .env                    # 서버 IP 설정
├── server/
│   └── src/index.ts        # WebSocket 서버
└── client/
    ├── electron/main.js    # Electron 메인 프로세스
    └── src/
        ├── App.tsx
        ├── assets/animals.ts   # 픽셀 스프라이트 데이터
        └── components/
            ├── Lobby.tsx       # 로비 (접속 화면)
            ├── GameRoom.tsx    # 메인 화면
            └── PixelAnimal.tsx # 픽셀 렌더러
```
