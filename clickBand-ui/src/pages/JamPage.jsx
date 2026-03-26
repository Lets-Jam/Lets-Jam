import React from "react";
import { formatTime, instrumentLabels } from "../hooks/useJamSession";

export default function JamPage({ onLeave, session }) {
  const progress = session.playback.duration
    ? Math.min((session.playback.current / session.playback.duration) * 100, 100)
    : 0;
  const visibleInstruments = ["vocal", ...session.availableInstruments];

  return (
    <div className="jam-room-page">
      <div className="jam-room-shell">
        <header className="jam-room-header">
          <div>
            <p className="jam-overline">Live Session</p>
            <h1>Jam Room</h1>
            <p className="jam-subtitle">{session.roleText}</p>
            <p className="jam-song-title">{session.selectedSongTitle}</p>
          </div>
          <div className="jam-header-actions">
            <div className="room-code-card">
              <span>ROOM CODE</span>
              <strong>{session.roomId}</strong>
            </div>
            <button className="jam-secondary-button" onClick={onLeave}>
              방 나가기
            </button>
          </div>
        </header>

        <section className="jam-hero-card">
          <div className="jam-progress-copy">
            <p className="jam-section-label">Playback</p>
            <h2>{session.songStarted ? "합주가 진행 중입니다" : "보컬이 시작을 기다리고 있어요"}</h2>
            <p>
              {formatTime(session.playback.current)} / {formatTime(session.playback.duration)}
            </p>
          </div>
          <div className="jam-progress-track">
            <div className="jam-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </section>

        <section className="jam-members-grid">
          {visibleInstruments.map((instrument) => {
            const isActive = session.activeInstruments[instrument];
            const joinedAt = session.activatedAt[instrument];

            return (
              <article key={instrument} className={`jam-member-card ${isActive ? "active" : ""}`}>
                <p className="jam-section-label">{instrument === "vocal" ? "HOST" : "PLAYER"}</p>
                <h3>{instrumentLabels[instrument]}</h3>
                <strong>{isActive ? "ON AIR" : "READY"}</strong>
                <p>
                  {joinedAt === null
                    ? "아직 참가 전"
                    : `${formatTime(joinedAt)}부터 활성화`}
                </p>
              </article>
            );
          })}
        </section>

        {session.isHost && (
          <section className="jam-control-card">
            <div>
              <p className="jam-section-label">Host Control</p>
              <h2>보컬 호스트 패널</h2>
              <p>트랙을 미리 로드한 뒤 합주를 시작할 수 있습니다.</p>
            </div>
            <div className="jam-control-actions">
              <button className="jam-secondary-button" onClick={session.preloadAudio}>
                오디오 미리 로드
              </button>
              <button className="jam-primary-button" onClick={session.startSong}>
                곡 시작
              </button>
            </div>
          </section>
        )}

        {session.isHost && session.joinUrl ? (
          <section className="jam-qr-card">
            <div>
              <p className="jam-section-label">Quick Join</p>
              <h2>QR로 바로 입장</h2>
              <p>참가자가 카메라로 QR을 스캔하면 이 방 링크로 들어와 자동 입장을 시도합니다.</p>
              <a className="jam-join-link" href={session.joinUrl}>
                {session.joinUrl}
              </a>
            </div>
            <div className="jam-qr-box">
              <img src={session.qrCodeImageUrl} alt={`Join room ${session.roomId} QR code`} />
            </div>
          </section>
        ) : null}

        {session.isParticipant && (
          <section className="jam-control-card">
            <div>
              <p className="jam-section-label">Player Control</p>
              <h2>{session.myInstrument ? `${instrumentLabels[session.myInstrument]} 파트 선택됨` : "연주 악기를 선택하세요"}</h2>
              <p>이 곡 폴더 안에 있는 악기만 표시합니다. 선택하면 이전 악기는 꺼지고 새 악기가 켜집니다.</p>
              <div className="jam-switcher">
                {session.availableInstruments.map((instrument) => {
                  const isCurrent = session.myInstrument === instrument;
                  const isBlocked = session.activeInstruments[instrument] && !isCurrent;

                  return (
                    <button
                      key={instrument}
                      type="button"
                      className={`jam-switch-chip ${isCurrent ? "current" : ""}`}
                      onClick={() => session.changeInstrument(instrument)}
                      disabled={isCurrent || isBlocked || session.isChangingInstrument}
                    >
                      {instrumentLabels[instrument]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="jam-control-actions">
              <button className="jam-secondary-button" onClick={session.manualPlay} disabled={!session.myInstrument}>
                수동 연주 요청
              </button>
              <button className="jam-primary-button" onClick={session.enableMotion} disabled={!session.myInstrument}>
                {session.motionEnabled ? "모션 감지 활성화됨" : "모션 감지 켜기"}
              </button>
            </div>
          </section>
        )}

        <section className="jam-log-card">
          <div className="jam-log-header">
            <div>
              <p className="jam-section-label">Realtime Feed</p>
              <h2>세션 로그</h2>
            </div>
            <span>{session.socketUrl}</span>
          </div>
          <div className="jam-log-list">
            {session.logs.length === 0 ? (
              <p className="jam-log-empty">아직 로그가 없습니다.</p>
            ) : (
              session.logs.map((line, idx) => <div key={`${line}-${idx}`}>{line}</div>)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
