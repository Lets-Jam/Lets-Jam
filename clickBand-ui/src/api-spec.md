# clickBand Socket.IO API 명세서

이 문서는 프론트엔드 코드(`App.jsx`)를 바탕으로 역산출한 백엔드 Socket 통신 이벤트 명세입니다. 프론트엔드 유지보수 및 추가 기능 개발 시 참고용으로 사용됩니다.

## 1. Client -> Server (Emit Events)

| 이벤트명 | Payload | 설명 |
| --- | --- | --- |
| `create_room` | 없음 | 호스트(보컬)가 새로운 합주 방을 생성합니다. |
| `join_room` | `{ roomId, instrument }` | 연주자가 방 코드와 악기를 선택해 방에 참가합니다. |
| `start_song` | `{ roomId }` | 호스트가 곡 재생을 시작합니다. |
| `activate_instrument`| `{ roomId, instrument }` | 기기 모션이나 버튼 클릭으로 연주자의 악기를 활성화합니다. |

## 2. Server -> Client (Listen Events)

| 이벤트명 | Payload | 설명 |
| --- | --- | --- |
| `room_created` | `{ roomId, role, activeInstruments, activatedAt }` | 방 생성이 완료되었을 때 호스트에게 전달됩니다. |
| `joined_room` | `{ roomId, role, instrument, activeInstruments, activatedAt, started, startedAt }` | 방 입장이 성공했을 때 참가자에게 전달됩니다. |
| `join_error` | `string` (에러 메시지) | 방 입장 실패 시 에러 메시지를 전달합니다. |
| `song_started` | `{ activeInstruments, activatedAt, startedAt }` | 호스트가 곡을 시작했을 때 모든 참가자에게 전달됩니다. |
| `instrument_activated` | `{ instrument, activeInstruments, activatedAt }` | 특정 악기가 활성화(소리 켜짐)되었을 때 전달됩니다. |
| `instrument_deactivated`| `{ instrument, activeInstruments, activatedAt }` | 특정 악기가 비활성화(소리 꺼짐)되었을 때 전달됩니다. |
| `user_joined` | `{ instrument }` | 새로운 연주자가 방에 입장했음을 알립니다. |
| `user_left` | `{ instrument }` | 기존 연주자가 방에서 퇴장했음을 알립니다. |
| `room_state` | `Room` 객체 | 방의 현재 상태를 동기화합니다. |
| `playback_sync` | `{ startedAt, elapsedSec, serverNow }` | 곡 재생 진행 시간을 서버 시간에 맞춰 동기화합니다. |
| `host_left` | 없음 | 호스트가 방을 나갔을 때 클라이언트를 새로고침 처리하도록 알립니다. |