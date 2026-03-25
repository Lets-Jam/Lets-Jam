# clickBand-ui (React + Vite)

## 1) 설치

```bash
cd clickBand-ui
npm install
```

## 2) 로컬 실행

```bash
cp .env.example .env
npm run dev
```

- 기본 소켓 서버 주소: `http://localhost:3000`
- 다른 주소를 쓰려면 `.env`에서 `VITE_SOCKET_URL` 변경

## 3) Vercel 배포

- Root Directory를 `clickBand-ui`로 설정
- Environment Variable 추가:
  - `VITE_SOCKET_URL=https://<render-서버-도메인>`

## 4) 주의사항

- 보컬이 실제 오디오 믹싱(각 파트 gain 제어)을 수행
- `public/audio/`에 아래 파일이 있어야 함
  - `vocal.mp3`
  - `piano.mp3`
  - `guitar.mp3`
  - `drums.mp3`
