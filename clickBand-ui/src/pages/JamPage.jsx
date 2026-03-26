import React from "react";
import { formatTime, getInstrumentLabel } from "../hooks/useJamSession";

export default function JamPage({ onLeave, session }) {
  const progress = session.playback.duration
    ? Math.min((session.playback.current / session.playback.duration) * 100, 100)
    : 0;
  const visibleInstruments = ["vocal", ...session.availableInstruments];
  const filteredHostSongs = session.songs.filter((song) =>
    song.title.toLowerCase().includes(session.hostSongSearch.trim().toLowerCase())
  );

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
                <h3>{getInstrumentLabel(instrument)}</h3>
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
              <p>트랙을 미리 로드하고, 방 안에서도 곡 변경과 재시작을 할 수 있습니다.</p>
              <div className="song-search-wrap host-song-search">
                <input
                  type="text"
                  className="song-search-input"
                  placeholder="노래 검색"
                  value={session.hostSongSearch}
                  onChange={(e) => session.setHostSongSearch(e.target.value)}
                />
              </div>
              <div className="song-selector song-selector-scroll host-song-list">
                {filteredHostSongs.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    className={`song-card ${session.selectedSongId === song.id ? "selected" : ""}`}
                    onClick={() => session.changeSong(song.id)}
                  >
                    <span className="song-card-label">Song</span>
                    <strong>{song.title}</strong>
                  </button>
                ))}
              </div>
            </div>
            <div className="jam-control-actions">
              <button className="jam-secondary-button" onClick={session.preloadAudio}>
                오디오 미리 로드
              </button>
              <button className="jam-primary-button" onClick={session.startSong}>
                곡 시작
              </button>
              <button className="jam-secondary-button" onClick={session.restartSong}>
                재시작
              </button>
            </div>
          </section>
        )}

        {session.isHost && session.joinUrl ? (
          <section className="jam-qr-card">
            <div>
              {/* <p className="jam-section-label">Quick Join</p> */}
              <h2>QR로 바로 입장</h2>
              <p>참가자가 카메라로 QR을 스캔하면 이 방 링크로 들어와 자동 입장을 시도합니다.</p>
              {/* <a className="jam-join-link" href={session.joinUrl}>
                {session.joinUrl}
              </a> */}
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
              <h2>{session.myInstrument ? `${getInstrumentLabel(session.myInstrument)} 파트 선택됨` : "연주 악기를 선택하세요"}</h2>
              <p>악기 선택은 파트만 고릅니다. 실제 재생은 아래 수동 버튼이나 모션 감지로 시작됩니다.</p>
              <div className="jam-sensitivity">
                <label htmlFor="motion-threshold">모션 민감도</label>
                <input
                  id="motion-threshold"
                  type="range"
                  min="12"
                  max="40"
                  step="1"
                  value={session.motionThreshold}
                  onChange={(e) => session.setMotionThreshold(Number(e.target.value))}
                />
                <span>{session.motionThreshold}</span>
              </div>
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
                      {getInstrumentLabel(instrument)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="jam-control-actions">
              <button className="jam-secondary-button" onClick={session.manualPlay} disabled={!session.myInstrument}>
                {session.myInstrument && session.activeInstruments[session.myInstrument] ? "수동으로 멈추기" : "수동으로 재생하기"}
              </button>
              <button className="jam-primary-button" onClick={session.enableMotion} disabled={!session.myInstrument}>
                {session.motionEnabled ? "모션 감지 활성화됨" : "모션 감지 켜기"}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
