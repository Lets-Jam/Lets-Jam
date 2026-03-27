import React, { useState } from "react";

const MainPage = ({ onGoToDevPage, session }) => {
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setJoinModalOpen] = useState(false);
  const [jamCode, setJamCode] = useState("");
  const [songSearch, setSongSearch] = useState("");
  const filteredSongs = session.songs.filter((song) =>
    song.title.toLowerCase().includes(songSearch.trim().toLowerCase())
  );

  const openCreateModal = () => {
    setCreateModalOpen(true);
    setSongSearch("");
  };
  const closeCreateModal = () => setCreateModalOpen(false);

  const openJoinModal = () => {
    setJoinModalOpen(true);
    setJamCode("");
  };
  const closeJoinModal = () => setJoinModalOpen(false);

  const handleCodeChange = (e) => {
    const formatted = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setJamCode(formatted);
  };

  const handleJoinSubmit = () => {
    if (jamCode.length < 6) {
      return alert("6자리 코드를 정확히 입력해주세요.");
    }

    session.joinRoom({ roomCode: jamCode });
  };

  const handleCreateSubmit = () => {
    if (!session.selectedSongId) {
      return alert("생성할 곡을 선택해주세요.");
    }

    session.createRoom(session.selectedSongId);
  };

  const handleImageCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      alert("사진 촬영이 완료되었습니다. 실제 운영 시에는 여기서 사진 속 QR을 분석합니다.");
      // 향후 여기에 jsQR 등의 라이브러리를 활용해 사진 속 코드를 읽는 로직을 추가합니다.
    }
  };

  return (
    <div className="main-page-root">
      <div className="bg-cosmos-container">
        <video autoPlay loop muted playsInline className="bg-cosmos-video">
          <source src="/video/pgM_bg.mp4" type="video/mp4" />
        </video>
        <div className="bg-cosmos-overlay"></div>
      </div>

      <div className="screen active-screen">
        <header className="main-header">
          <div className="header-logo">Let's Jam</div>
          <div className="header-right">DDALGGAKTON</div>
        </header>

        <main className="main-content">
          <div className="main-center-content">
            <p className="welcome-text">
              Welcome to Let's Jam!<br className="mobile-break" /> 즉석 연주로 새로운 인연을 만들어 보세요.
            </p>
          </div>

          <div className="action-buttons">
            <button
              className="cosmos-button"
              onClick={openCreateModal}
              disabled={session.isBusy || !session.connectionReady}
            >
              생성하기
            </button>
            <button className="cosmos-button" onClick={openJoinModal} disabled={session.isBusy || !session.connectionReady}>
              참여하기
            </button>
          </div>

          <p className="connection-status">
            {session.connectionReady
              ? session.pendingRoomCode
                ? `${session.pendingRoomCode} 방으로 자동 입장 준비 중`
                : "서버 연결 완료"
              : "서버 연결 준비 중"}
          </p>
        </main>

        <footer className="main-footer">
          <div className="footer-left">
            <span>Team Members</span>
            <span className="separator"></span>
            <span>신국현 | 김장현</span>
          </div>
          <div className="footer-right">Ver 1.0.0</div>
        </footer>
      </div>

      <button className="admin-mode-button" onClick={onGoToDevPage}>
        dev
      </button>

      {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-backdrop" onClick={closeCreateModal}></div>
          <div className="modal-scroll-wrapper">
            <div className="modal-content song-modal-content">
              <h2 className="modal-title">Song Select</h2>

              <div className="join-options-container">
                {session.songsLoading ? (
                  <p className="modal-helper-text">곡 목록을 불러오는 중입니다.</p>
                ) : null}

                {session.songsError ? (
                  <div className="modal-message-block">
                    <p className="modal-helper-text">{session.songsError}</p>
                    <button type="button" className="jam-secondary-button" onClick={() => session.fetchSongs()}>
                      다시 불러오기
                    </button>
                  </div>
                ) : null}

                {!session.songsLoading && !session.songsError ? (
                  <>
                    <div className="song-search-wrap">
                      <input
                        type="text"
                        className="song-search-input"
                        placeholder="노래 검색"
                        value={songSearch}
                        onChange={(e) => setSongSearch(e.target.value)}
                      />
                    </div>
                    <div className="song-selector song-selector-scroll">
                    {filteredSongs.map((song) => (
                      <button
                        key={song.id}
                        type="button"
                        className={`song-card ${session.selectedSongId === song.id ? "selected" : ""}`}
                        onClick={() => session.setSelectedSongId(song.id)}
                      >
                        <span className="song-card-label">Song</span>
                        <strong>{song.title}</strong>
                      </button>
                    ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={closeCreateModal} className="modal-close-button">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
              <button
                type="button"
                className={`modal-submit-button ${session.selectedSongId ? "show" : ""}`}
                onClick={handleCreateSubmit}
                disabled={session.isBusy || session.songsLoading || !session.selectedSongId}
              >
                {session.isBusy ? "생성 중" : "이 곡으로 방 만들기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isJoinModalOpen && (
        <div className="modal-overlay">
          <div className="modal-backdrop" onClick={closeJoinModal}></div>
          <div className="modal-scroll-wrapper">
            <div className="modal-content">
              <h2 className="modal-title">Jam Code</h2>
              
              <div className="join-options-container">
                <div className="jam-code-input-wrapper">
                  <input 
                    type="text" 
                    className="jam-code-input" 
                    placeholder="ex: A1B2C3" 
                    maxLength={6}
                    value={jamCode}
                    onChange={handleCodeChange}
                  />
                </div>
                <div className="join-option-button qr-scan-button">
                  QR 스캔으로 접속하면 이 화면을 거치지 않고 바로 방 입장을 시도합니다.
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={closeJoinModal} className="modal-close-button">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
              <button type="button" className={`modal-submit-button ${jamCode.length > 0 ? "show" : ""}`} onClick={handleJoinSubmit} disabled={session.isBusy}>
                입장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainPage;
