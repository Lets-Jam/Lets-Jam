import { useEffect, useMemo, useRef, useState } from "react";
import { instrumentLabels } from "../hooks/useJamSession";

const allInstruments = ["vocal", "piano", "guitar", "drums"];

function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function DevPage({ onGoBack, session }) {
  const audioContextRef = useRef(null);
  const audioStateRef = useRef({
    buffers: {},
    sources: {},
    gains: {},
  });
  const startedRef = useRef(false);
  const startedAtRef = useRef(null);
  const progressTimerRef = useRef(null);

  const [selectedSongId, setSelectedSongId] = useState(session.songs[0]?.id || "");
  const [selectedInstruments, setSelectedInstruments] = useState(["vocal"]);
  const [playback, setPlayback] = useState({ current: 0, duration: 0 });
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const selectedSong = useMemo(
    () => session.songs.find((song) => song.id === selectedSongId) || null,
    [session.songs, selectedSongId]
  );

  const availableTracks = useMemo(() => {
    if (!selectedSong) return [];
    return selectedSong.tracks.filter((track) => allInstruments.includes(track));
  }, [selectedSong]);

  const addLog = (message) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${message}`, ...prev].slice(0, 100));
  };

  const getTrackFiles = () => {
    if (!selectedSongId || !selectedSong) return {};
    return availableTracks.reduce((acc, track) => {
      acc[track] = `/audio/${selectedSongId}/${track}.mp3`;
      return acc;
    }, {});
  };

  const stopProgressLoop = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const refreshPlayback = () => {
    const vocalBuffer = audioStateRef.current.buffers.vocal;
    const duration = vocalBuffer?.duration || 0;
    const current =
      startedRef.current && audioContextRef.current && startedAtRef.current !== null
        ? Math.max(0, Math.min(audioContextRef.current.currentTime - startedAtRef.current, duration))
        : 0;

    setPlayback({ current, duration });
  };

  const syncSelectedGains = () => {
    if (!audioContextRef.current || !startedRef.current) return;
    const now = audioContextRef.current.currentTime;

    Object.entries(audioStateRef.current.gains).forEach(([instrument, gainNode]) => {
      const shouldPlay = selectedInstruments.includes(instrument);
      const target = shouldPlay ? 1 : 0;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(target, now + 0.2);
    });
  };

  const resetAudioSession = async () => {
    stopProgressLoop();

    Object.values(audioStateRef.current.sources).forEach((source) => {
      try {
        source.stop();
      } catch {}
    });

    audioStateRef.current = { buffers: {}, sources: {}, gains: {} };
    startedRef.current = false;
    startedAtRef.current = null;
    setIsPlaying(false);
    setPlayback({ current: 0, duration: 0 });

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      await audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
  };

  const initAudio = async () => {
    const trackFiles = getTrackFiles();
    if (!trackFiles.vocal) {
      throw new Error("선택한 곡에 보컬 트랙이 없습니다.");
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    for (const [instrument, url] of Object.entries(trackFiles)) {
      if (audioStateRef.current.buffers[instrument]) continue;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${instrument} 파일 로드 실패: ${url}`);
      const arr = await response.arrayBuffer();
      const buffer = await audioContextRef.current.decodeAudioData(arr);
      audioStateRef.current.buffers[instrument] = buffer;
    }

    setPlayback((prev) => ({
      ...prev,
      duration: audioStateRef.current.buffers.vocal?.duration || prev.duration,
    }));
    addLog(`관리자 모드 오디오 로드 완료: ${selectedSong?.title || selectedSongId}`);
  };

  const startPlayback = async () => {
    if (!audioContextRef.current) {
      throw new Error("먼저 오디오를 로드해주세요.");
    }
    if (startedRef.current) {
      addLog("이미 재생 중입니다.");
      return;
    }

    Object.keys(audioStateRef.current.buffers).forEach((instrument) => {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioStateRef.current.buffers[instrument];
      source.loop = false;

      const gain = audioContextRef.current.createGain();
      gain.gain.value = selectedInstruments.includes(instrument) ? 1 : 0;

      source.connect(gain);
      gain.connect(audioContextRef.current.destination);

      audioStateRef.current.sources[instrument] = source;
      audioStateRef.current.gains[instrument] = gain;
    });

    startedAtRef.current = audioContextRef.current.currentTime + 0.12;
    Object.values(audioStateRef.current.sources).forEach((source) => {
      source.start(startedAtRef.current);
    });

    startedRef.current = true;
    setIsPlaying(true);
    refreshPlayback();
    progressTimerRef.current = setInterval(refreshPlayback, 200);
    addLog(`관리자 재생 시작: ${selectedSong?.title || selectedSongId}`);
  };

  const toggleInstrument = (instrument) => {
    if (instrument === "vocal") return;

    setSelectedInstruments((prev) => {
      const next = prev.includes(instrument)
        ? prev.filter((item) => item !== instrument)
        : [...prev, instrument];
      return next.includes("vocal") ? next : ["vocal", ...next];
    });
  };

  useEffect(() => {
    if (!selectedSong && session.songs[0]?.id) {
      setSelectedSongId(session.songs[0].id);
    }
  }, [selectedSong, session.songs]);

  useEffect(() => {
    if (!availableTracks.length) {
      setSelectedInstruments(["vocal"]);
      return;
    }

    setSelectedInstruments((prev) => {
      const next = prev.filter((instrument) => availableTracks.includes(instrument));
      return next.includes("vocal") ? next : ["vocal", ...next];
    });
  }, [availableTracks]);

  useEffect(() => {
    syncSelectedGains();
  }, [selectedInstruments]);

  useEffect(() => {
    resetAudioSession().catch(() => {});
  }, [selectedSongId]);

  useEffect(() => {
    return () => {
      resetAudioSession().catch(() => {});
    };
  }, []);

  const progress = playback.duration
    ? Math.min((playback.current / playback.duration) * 100, 100)
    : 0;

  return (
    <main className="container">
      <button className="secondary" onClick={onGoBack} style={{ marginBottom: "16px", width: "max-content" }}>
        ← 메인으로 돌아가기
      </button>

      <section className="card">
        <h1>Admin Mode</h1>
        <p className="small">사용자 없이도 곡 선택, 악기 다중 선택, 즉시 재생 테스트를 할 수 있습니다.</p>
        <p>{selectedSong ? `선택된 곡: ${selectedSong.title}` : "선택된 곡: 없음"}</p>
        <p>{isPlaying ? "상태: 재생 중" : "상태: 대기 중"}</p>
      </section>

      <section className="card">
        <h2>노래 선택</h2>
        {session.songsLoading ? <p className="small">곡 목록을 불러오는 중입니다.</p> : null}
        {session.songsError ? (
          <>
            <p className="small">{session.songsError}</p>
            <button className="secondary" onClick={() => session.fetchSongs()}>
              다시 불러오기
            </button>
          </>
        ) : null}
        {!session.songsLoading && !session.songsError ? (
          <div className="song-selector">
            {session.songs.map((song) => (
              <button
                key={song.id}
                type="button"
                className={`song-card ${selectedSongId === song.id ? "selected" : ""}`}
                onClick={() => setSelectedSongId(song.id)}
              >
                <span className="song-card-label">Song</span>
                <strong>{song.title}</strong>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>재생 현황</h2>
        <p>
          {formatTime(playback.current)} / {formatTime(playback.duration)}
          {isPlaying ? "" : " (미재생)"}
        </p>
        <div className="progress">
          <div className="progressBar" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="card">
        <h2>관리자 악기 선택</h2>
        <p className="small">보컬은 항상 켜져 있고, 나머지 악기는 여러 개를 동시에 선택할 수 있습니다.</p>
        <div className="badgeList">
          {availableTracks.map((instrument) => {
            const selected = selectedInstruments.includes(instrument);
            const isFixed = instrument === "vocal";

            return (
              <button
                key={instrument}
                type="button"
                className={`admin-toggle ${selected ? "selected" : ""}`}
                onClick={() => toggleInstrument(instrument)}
                disabled={isFixed}
              >
                {instrumentLabels[instrument]}
                {selected ? " ON" : " OFF"}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>관리자 제어</h2>
        <div className="badgeList">
          <button
            className="secondary"
            onClick={async () => {
              try {
                setIsLoading(true);
                await initAudio();
              } catch (error) {
                alert(error.message);
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={!selectedSongId || isLoading}
          >
            {isLoading ? "로딩 중..." : "오디오 로드"}
          </button>
          <button
            className="success"
            onClick={async () => {
              try {
                await initAudio();
                await startPlayback();
              } catch (error) {
                alert(error.message);
              }
            }}
            disabled={!selectedSongId}
          >
            재생 시작
          </button>
          <button
            className="warning"
            onClick={async () => {
              await resetAudioSession();
              addLog("관리자 재생 세션을 초기화했습니다.");
            }}
          >
            정지 및 초기화
          </button>
        </div>
      </section>

      <section className="card">
        <h2>로그</h2>
        <div className="log">
          {logs.length === 0 ? <p className="small">아직 로그가 없습니다.</p> : null}
          {logs.map((line, idx) => (
            <div key={`${line}-${idx}`}>{line}</div>
          ))}
        </div>
      </section>
    </main>
  );
}
