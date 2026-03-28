import React, { useState, useEffect } from "react";

const FUNNY_STATUS_MESSAGES = [
  "Coldplay 기타 연결중...",
  "SPYAIR 공연 준비중...",
  "Oasis 재결합 설득중...",
  "Queen 드럼 세팅중...",
  "비틀즈 횡단보도 건너는중...",
  "실리카겔 기타 이펙터 밟는중...",
  "데이식스 악보 챙기는중...",
  "레드핫칠리페퍼스 베이스 튜닝중...",
  "메탈리카 앰프 예열중...",
  "악틱몽키즈 마이크 테스트중...",
  "너바나 드럼 스틱 깎는중..."
];

const MainPage = ({ onGoToDevPage, session }) => {
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setJoinModalOpen] = useState(false);
  const [jamCode, setJamCode] = useState("");
  const [songSearch, setSongSearch] = useState("");
  const filteredSongs = session.songs.filter((song) =>
    song.title.toLowerCase().includes(songSearch.trim().toLowerCase())
  );
  const [funnyMessage, setFunnyMessage] = useState("");

  useEffect(() => {
    let lastIndex = Math.floor(Math.random() * FUNNY_STATUS_MESSAGES.length);
    setFunnyMessage(FUNNY_STATUS_MESSAGES[lastIndex]);
    
    const interval = setInterval(() => {
      let nextIndex;
      do {
        nextIndex = Math.floor(Math.random() * FUNNY_STATUS_MESSAGES.length);
      } while (nextIndex === lastIndex); // 같은 문구가 연속으로 나오지 않도록 처리
      lastIndex = nextIndex;
      setFunnyMessage(FUNNY_STATUS_MESSAGES[nextIndex]);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

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
              Create
            </button>
            <button className="cosmos-button" onClick={openJoinModal} disabled={session.isBusy || !session.connectionReady}>
              Join
            </button>
          </div>

          <p className="connection-status">
            {session.pendingRoomCode
              ? `${session.pendingRoomCode} 방으로 자동 입장 준비 중`
              : funnyMessage}
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
              <h2 className="modal-title">Let's Jam</h2>
              
              <div className="join-options-container">
                <div className="jam-code-input-wrapper">
                  <input 
                    type="text" 
                    className="jam-code-input" 
                    placeholder="Jam Code를 입력하세요" 
                    maxLength={6}
                    value={jamCode}
                    onChange={handleCodeChange}
                  />
                </div>
                <label className="join-option-button qr-scan-button">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                    <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                    <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                    <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                    <rect x="7" y="7" width="10" height="10" rx="1" ry="1"></rect>
                  </svg>
                  QR코드로 입장
                  <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleImageCapture} />
                </label>
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
