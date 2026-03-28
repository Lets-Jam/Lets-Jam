import React, { useMemo, useState } from "react";
import { formatTime, getInstrumentLabel } from "../hooks/useJamSession";
import { getActiveLyricIndex, getTimedLyrics } from "../lib/lyrics";
import { getSongMeta } from "../lib/songMeta";

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M18 11.5a6 6 0 0 1-12 0M12 17.5V21M9 21h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6.5v11l9-5.5-9-5.5Z" fill="currentColor" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6v5h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 11a8 8 0 1 1-2.35-5.65L20 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChangeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4 10.5-10.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function JamPage({ onLeave, session }) {
  const [copied, setCopied] = useState(false);
  const [songPickerOpen, setSongPickerOpen] = useState(false);
  const [stagedSongId, setStagedSongId] = useState("");
  const lyrics = useMemo(() => getTimedLyrics(session.selectedSongId), [session.selectedSongId]);
  const activeLyricIndex = useMemo(
    () => getActiveLyricIndex(lyrics, session.playback.current),
    [lyrics, session.playback.current]
  );
  const currentLyric =
    activeLyricIndex >= 0 ? lyrics[activeLyricIndex]?.text : lyrics[0]?.text || "가사가 준비되지 않았습니다.";
  const nextLyric =
    activeLyricIndex >= 0 ? lyrics[activeLyricIndex + 1]?.text || "..." : lyrics[1]?.text || "...";
  const progress = session.playback.duration
    ? Math.min((session.playback.current / session.playback.duration) * 100, 100)
    : 0;
  const visibleInstruments = session.availableInstruments;
  const songMeta = getSongMeta(session.selectedSongId);
  const filteredHostSongs = session.songs.filter((song) =>
    song.title.toLowerCase().includes(session.hostSongSearch.trim().toLowerCase())
  );
  const ambientPulse = session.songStarted ? Math.min(0.1 + session.musicPulse * 0.46, 0.44) : 0;
  const crowdAccentCount = Math.min(session.participantCount || 0, 3);

  const handleCopyRoomCode = async () => {
    if (!session.roomId) return;

    try {
      await navigator.clipboard.writeText(session.roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("방 코드를 복사하지 못했습니다.");
    }
  };

  return (
    <div
      className={`jam-room-page ${session.songStarted ? "is-playing" : ""}`}
      style={{
        "--jam-pulse": ambientPulse.toFixed(3),
      }}
    >
      <div className="jam-crowd-accents" aria-hidden="true">
        <span className={`jam-crowd-accent jam-crowd-accent-left ${crowdAccentCount >= 1 ? "active" : ""}`} />
        <span className={`jam-crowd-accent jam-crowd-accent-bottom ${crowdAccentCount >= 2 ? "active" : ""}`} />
        <span className={`jam-crowd-accent jam-crowd-accent-right ${crowdAccentCount >= 3 ? "active" : ""}`} />
      </div>

      <button className="jam-back-button" type="button" onClick={onLeave} aria-label="뒤로 가기">
        <BackIcon />
      </button>

      <div className="jam-room-shell jam-room-shell-redesign">
        <section className="jam-panel jam-top-panel">
          <div className="jam-top-left">
            <p className="jam-live-label">
              Live
              <span />
            </p>

            <div className="jam-song-meta-card">
              <button
                type="button"
                className="jam-song-picker-trigger"
                onClick={() => {
                  if (session.isHost) {
                    setStagedSongId(session.selectedSongId);
                    setSongPickerOpen(true);
                  }
                }}
                disabled={!session.isHost}
              >
                <div className="jam-song-picker-title-row">
                  <h1>{songMeta.title}</h1>
                  {session.isHost ? (
                    <span className="jam-change-icon" aria-hidden="true">
                      <ChangeIcon />
                    </span>
                  ) : null}
                </div>
              </button>
              <p>{songMeta.artist}</p>
            </div>

            <div className="jam-mini-pills">
              {visibleInstruments.map((instrument) => {
                const isCurrent = session.myInstrument === instrument;
                const isActive = session.activeInstruments[instrument];

                return (
                  <span key={instrument} className={`jam-mini-pill ${isCurrent ? "current" : ""}`}>
                    {getInstrumentLabel(instrument)}
                    {isActive ? <i /> : null}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="jam-qr-panel">
            <div className="jam-qr-box">
              <img src={session.qrCodeImageUrl} alt={`Join room ${session.roomId} QR code`} />
            </div>
            <button type="button" className="jam-room-copy" onClick={handleCopyRoomCode}>
              <span>{copied ? "COPIED" : session.roomId}</span>
              <CopyIcon />
            </button>
          </div>
        </section>

        <section className="jam-panel jam-session-panel">
          <div className="jam-panel-header">
            <div>
              <p className="jam-section-label">Select Session</p>
              <h2>{session.myInstrument ? `${getInstrumentLabel(session.myInstrument)} 선택됨` : "파트를 선택하세요"}</h2>
            </div>
            <button
              type="button"
              className={`jam-motion-toggle ${session.motionEnabled ? "active" : ""}`}
              onClick={session.toggleMotion}
              disabled={!session.canUseMotion}
              aria-label="모션 감지 토글"
            >
              <span className="jam-motion-icon">〰</span>
              <span className="jam-motion-switch">
                <i />
              </span>
            </button>
          </div>

          <div className="jam-session-actions">
            {visibleInstruments.map((instrument) => {
              const isCurrent = session.myInstrument === instrument;
              const isActive = session.activeInstruments[instrument];
              const isBlocked = session.activeInstruments[instrument] && !isCurrent;

              return (
                <button
                  key={instrument}
                  type="button"
                  className={`jam-session-chip ${isCurrent ? "current" : ""} ${isActive ? "active" : ""}`}
                  onClick={() => session.selectPart(instrument)}
                  disabled={isBlocked || session.isChangingInstrument}
                >
                  {getInstrumentLabel(instrument)}
                </button>
              );
            })}

            <button
              type="button"
              className={`jam-session-chip jam-mic-chip ${session.liveVocalEnabled ? "active" : ""}`}
              onClick={session.toggleLiveVocal}
              disabled={session.myInstrument !== "vocal"}
              aria-label="마이크 토글"
            >
              <MicIcon />
            </button>
          </div>
        </section>

        <section className="jam-panel jam-player-panel">
          <div className="jam-lyric-focus">
            <p className="jam-lyric-current">{currentLyric}</p>
            <p className="jam-lyric-next">{nextLyric}</p>
          </div>

          <div className="jam-player-progress-row">
            <span>{formatTime(session.playback.current)}</span>
            <div className="jam-progress-track redesigned">
              <div className="jam-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <span>{formatTime(session.playback.duration)}</span>
          </div>

          <div className="jam-player-controls">
            <button
              type="button"
              className="jam-icon-button"
              onClick={session.startSong}
              disabled={!session.isHost}
              aria-label="곡 시작"
            >
              <PlayIcon />
            </button>
            <button
              type="button"
              className="jam-icon-button"
              onClick={session.restartSong}
              disabled={!session.isHost}
              aria-label="곡 재시작"
            >
              <RestartIcon />
            </button>
          </div>
        </section>
      </div>

      {session.isHost && songPickerOpen && (
        <div className="modal-overlay">
          <div className="modal-backdrop"></div>
          <div className="modal-scroll-wrapper">
            <div className="modal-content song-modal-content">
              <h2 className="modal-title">Change Track</h2>

              <div className="join-options-container">
                <div className="song-search-wrap" style={{ position: "relative" }}>
                  <input
                    type="text"
                    className="song-search-input"
                    placeholder="노래 검색"
                    value={session.hostSongSearch}
                    onChange={(e) => session.setHostSongSearch(e.target.value)}
                    style={{ paddingRight: "40px" }}
                  />
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", color: "rgba(255, 255, 255, 0.5)", pointerEvents: "none" }}>
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </div>
                <div className="song-selector song-selector-scroll">
                  {filteredHostSongs.map((song) => (
                    <button
                      key={song.id}
                      type="button"
                      className={`song-card ${stagedSongId === song.id ? "selected" : ""}`}
                      onClick={() => setStagedSongId(stagedSongId === song.id ? "" : song.id)}
                    >
                      <span className="song-card-label">Song</span>
                      <strong>{getSongMeta(song.id).title}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setSongPickerOpen(false)} className="modal-close-button">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
              <button
                type="button"
                className={`modal-submit-button ${stagedSongId && stagedSongId !== session.selectedSongId ? "show" : ""}`}
                onClick={() => {
                  if (stagedSongId && stagedSongId !== session.selectedSongId) {
                    session.changeSong(stagedSongId);
                    setSongPickerOpen(false);
                  }
                }}
                disabled={!stagedSongId || stagedSongId === session.selectedSongId}
              >
                Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
