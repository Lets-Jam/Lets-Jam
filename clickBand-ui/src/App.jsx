import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

const instrumentLabels = {
  vocal: "보컬",
  piano: "피아노",
  guitar: "기타",
  drums: "드럼",
};

const trackFiles = {
  vocal: "/audio/vocal.mp3",
  piano: "/audio/piano.mp3",
  guitar: "/audio/guitar.mp3",
  drums: "/audio/drums.mp3",
};

const initialActive = {
  vocal: false,
  piano: false,
  guitar: false,
  drums: false,
};

const initialActivatedAt = {
  vocal: 0,
  piano: null,
  guitar: null,
  drums: null,
};

function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function App() {
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioStateRef = useRef({
    buffers: {},
    sources: {},
    gains: {},
  });

  const [roomId, setRoomId] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [selectedInstrument, setSelectedInstrument] = useState("piano");
  const [role, setRole] = useState(null);
  const [myInstrument, setMyInstrument] = useState(null);
  const [activeInstruments, setActiveInstruments] = useState(initialActive);
  const [activatedAt, setActivatedAt] = useState(initialActivatedAt);
  const [logs, setLogs] = useState([]);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [songStarted, setSongStarted] = useState(false);
  const [playback, setPlayback] = useState({ current: 0, duration: 0 });

  const lastTriggerAtRef = useRef(0);
  const instrumentAlreadyTriggeredRef = useRef(false);
  const audioStartedRef = useRef(false);
  const songStartAtRef = useRef(null);
  const progressTimerRef = useRef(null);
  const roleRef = useRef(null);
  const serverStartedAtRef = useRef(null);
  const serverDriftMsRef = useRef(0);
  const durationLoadedRef = useRef(false);
  const playbackDurationRef = useRef(0);

  const addLog = (message) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${message}`, ...prev].slice(0, 200));
  };

  const isHost = role === "host";
  const isParticipant = role === "participant";

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  const roleText = useMemo(() => {
    if (!role) return "현재 역할: 미선택";
    return `현재 역할: ${role}${myInstrument ? ` (${myInstrument})` : ""}`;
  }, [role, myInstrument]);

  const getCurrentPlaybackSeconds = () => {
    if (!audioStartedRef.current || !audioContextRef.current || !songStartAtRef.current) {
      if (!serverStartedAtRef.current) return 0;
      return Math.max(
        0,
        (Date.now() - serverStartedAtRef.current + serverDriftMsRef.current) / 1000
      );
    }
    return Math.max(0, audioContextRef.current.currentTime - songStartAtRef.current);
  };

  const refreshPlayback = () => {
    const vocalBuffer = audioStateRef.current.buffers.vocal;
    const duration = vocalBuffer ? vocalBuffer.duration : playbackDurationRef.current || 0;
    const rawCurrent = getCurrentPlaybackSeconds();
    const current = duration > 0 ? Math.min(rawCurrent, duration) : rawCurrent;
    setPlayback({ current, duration });
  };

  const startProgressLoop = () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    refreshPlayback();
    progressTimerRef.current = setInterval(refreshPlayback, 200);
  };

  const ensureDurationLoaded = async () => {
    if (durationLoadedRef.current) return;

    try {
      const duration = await new Promise((resolve, reject) => {
        const audio = new Audio(trackFiles.vocal);
        audio.preload = "metadata";
        audio.onloadedmetadata = () => resolve(audio.duration || 0);
        audio.onerror = () => reject(new Error("오디오 길이 정보를 읽지 못했습니다."));
      });

      durationLoadedRef.current = true;
      playbackDurationRef.current = duration;
      setPlayback((prev) => ({ ...prev, duration: prev.duration || duration }));
    } catch {
      // 진행 시간 표시 자체는 startedAt으로 가능하므로 조용히 무시
    }
  };

  const syncPlaybackState = ({ startedAt, elapsedSec, serverNow }) => {
    if (!startedAt) return;

    setSongStarted(true);
    serverStartedAtRef.current = startedAt;

    if (serverNow && typeof elapsedSec === "number") {
      const localElapsedMs = Date.now() - startedAt;
      const serverElapsedMs = elapsedSec * 1000 + (Date.now() - serverNow);
      serverDriftMsRef.current = serverElapsedMs - localElapsedMs;
    }

    ensureDurationLoaded();
    startProgressLoop();
  };

  const initAudio = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    const entries = Object.entries(trackFiles);
    for (const [instrument, url] of entries) {
      if (audioStateRef.current.buffers[instrument]) continue;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${instrument} 파일 로드 실패: ${url}`);
      const arr = await response.arrayBuffer();
      const buffer = await audioContextRef.current.decodeAudioData(arr);
      audioStateRef.current.buffers[instrument] = buffer;
    }

    refreshPlayback();
    playbackDurationRef.current = audioStateRef.current.buffers.vocal?.duration || playbackDurationRef.current;
    addLog("모든 오디오 파일 로드 완료");
  };

  const createTrackSource = (instrument, initialGain) => {
    const ctx = audioContextRef.current;
    const source = ctx.createBufferSource();
    source.buffer = audioStateRef.current.buffers[instrument];
    source.loop = false;

    const gain = ctx.createGain();
    gain.gain.value = initialGain;

    source.connect(gain);
    gain.connect(ctx.destination);

    audioStateRef.current.sources[instrument] = source;
    audioStateRef.current.gains[instrument] = gain;
  };

  const startAllTracks = () => {
    if (!audioContextRef.current) {
      alert("먼저 오디오를 초기화해주세요.");
      return;
    }
    if (audioStartedRef.current) {
      addLog("이미 곡이 시작되었습니다.");
      return;
    }

    createTrackSource("vocal", 1);
    createTrackSource("piano", 0);
    createTrackSource("guitar", 0);
    createTrackSource("drums", 0);

    songStartAtRef.current = audioContextRef.current.currentTime + 0.15;
    Object.values(audioStateRef.current.sources).forEach((source) => {
      source.start(songStartAtRef.current);
    });

    audioStartedRef.current = true;
    setSongStarted(true);
    startProgressLoop();
    addLog("모든 트랙 동시 시작, 현재는 보컬만 재생");
  };

  const setLocalInstrumentGain = (instrument, target) => {
    if (!audioStartedRef.current || !audioContextRef.current) return;
    const gainNode = audioStateRef.current.gains[instrument];
    if (!gainNode) return;
    const current = gainNode.gain.value;
    if (target === 1 && current >= 1) return;
    if (target === 0 && current <= 0) return;

    const t = audioContextRef.current.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(current, t);
    gainNode.gain.linearRampToValueAtTime(target, t + 0.25);
  };

  const activateLocalInstrument = (instrument) => {
    setLocalInstrumentGain(instrument, 1);
    addLog(`${instrument} 트랙 활성화`);
  };

  const deactivateLocalInstrument = (instrument) => {
    setLocalInstrumentGain(instrument, 0);
    addLog(`${instrument} 트랙 비활성화`);
  };

  useEffect(() => {
    ensureDurationLoaded();

    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("room_created", ({ roomId: newRoomId, role: newRole, activeInstruments, activatedAt }) => {
      setRoomId(newRoomId);
      setRole(newRole);
      setMyInstrument("vocal");
      setActiveInstruments(activeInstruments || initialActive);
      setActivatedAt(activatedAt || initialActivatedAt);
      addLog(`방 생성 완료: ${newRoomId}`);
    });

    socket.on(
      "joined_room",
      ({
        roomId: joinedRoomId,
        role: joinedRole,
        instrument,
        activeInstruments,
        activatedAt,
        started,
        startedAt,
      }) => {
        setRoomId(joinedRoomId);
        setRole(joinedRole);
        setMyInstrument(instrument);
        setActiveInstruments(activeInstruments || initialActive);
        setActivatedAt(activatedAt || initialActivatedAt);
        if (started) {
          syncPlaybackState({ startedAt: startedAt || Date.now() });
          addLog("이미 시작된 방입니다. 현재 상태만 확인 가능합니다.");
        }
        addLog(`방 참가 완료: ${joinedRoomId}, 악기: ${instrument}`);
      }
    );

    socket.on("join_error", (message) => alert(message));

    socket.on("song_started", ({ activeInstruments, activatedAt, startedAt }) => {
      serverDriftMsRef.current = 0;
      setActiveInstruments(activeInstruments || initialActive);
      setActivatedAt(activatedAt || initialActivatedAt);
      if (roleRef.current !== "host") addLog("보컬이 곡을 시작했습니다.");
      syncPlaybackState({ startedAt: startedAt || Date.now() });
    });

    socket.on("instrument_activated", ({ instrument, activeInstruments, activatedAt }) => {
      setActiveInstruments(activeInstruments || initialActive);
      setActivatedAt(activatedAt || initialActivatedAt);
      if (roleRef.current === "host") activateLocalInstrument(instrument);
      addLog(`${instrument} 악기가 활성화되었습니다.`);
    });

    socket.on("instrument_deactivated", ({ instrument, activeInstruments, activatedAt }) => {
      setActiveInstruments(activeInstruments || initialActive);
      setActivatedAt(activatedAt || initialActivatedAt);
      if (roleRef.current === "host") deactivateLocalInstrument(instrument);
      addLog(`${instrument} 악기가 비활성화되었습니다.`);
    });

    socket.on("user_joined", ({ instrument }) => addLog(`${instrument} 참가자가 입장했습니다.`));
    socket.on("user_left", ({ instrument }) => addLog(`${instrument} 참가자가 퇴장했습니다.`));

    socket.on("room_state", (room) => {
      if (!room?.activeInstruments) return;
      setActiveInstruments(room.activeInstruments);
      setActivatedAt(room.activatedAt || initialActivatedAt);

      if (room.started && room.startedAt) {
        syncPlaybackState({ startedAt: room.startedAt });
      }
    });

    socket.on("playback_sync", ({ startedAt, elapsedSec, serverNow }) => {
      syncPlaybackState({ startedAt, elapsedSec, serverNow });
    });

    socket.on("host_left", () => {
      alert("보컬 호스트가 방을 종료했습니다.");
      window.location.reload();
    });

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleMotion = (event) => {
      if (!motionEnabled || !isParticipant || !roomId || !myInstrument) return;
      if (instrumentAlreadyTriggeredRef.current) return;

      const now = Date.now();
      if (now - lastTriggerAtRef.current < 1500) return;

      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const magnitude = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);
      if (magnitude <= 35) return;

      lastTriggerAtRef.current = now;
      instrumentAlreadyTriggeredRef.current = true;
      socketRef.current?.emit("activate_instrument", { roomId, instrument: myInstrument });
      addLog(`모션 감지 성공 -> ${myInstrument} 활성화 요청`);
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [isParticipant, motionEnabled, roomId, myInstrument]);

  const onCreateRoom = () => socketRef.current?.emit("create_room");

  const onJoinRoom = () => {
    const normalized = roomInput.trim().toUpperCase();
    if (!normalized) {
      alert("방 코드를 입력해주세요.");
      return;
    }
    setMyInstrument(selectedInstrument);
    socketRef.current?.emit("join_room", {
      roomId: normalized,
      instrument: selectedInstrument,
    });
  };

  const onStartSong = async () => {
    try {
      await initAudio();
      startAllTracks();
      setActivatedAt(initialActivatedAt);
      setActiveInstruments({ vocal: true, piano: false, guitar: false, drums: false });
      socketRef.current?.emit("start_song", { roomId });
    } catch (error) {
      alert(error.message);
    }
  };

  const onInitAudio = async () => {
    try {
      await initAudio();
    } catch (error) {
      alert(error.message);
    }
  };

  const onManualPlay = () => {
    if (!isParticipant) return alert("참가자만 사용할 수 있습니다.");
    if (!roomId || !myInstrument) return alert("먼저 방에 참가해주세요.");
    socketRef.current?.emit("activate_instrument", { roomId, instrument: myInstrument });
    addLog(`수동 연주 요청 전송 -> ${myInstrument}`);
  };

  const onEnableMotion = async () => {
    try {
      if (
        typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function"
      ) {
        const result = await DeviceMotionEvent.requestPermission();
        if (result !== "granted") throw new Error("모션 권한이 거부되었습니다.");
      }
      setMotionEnabled(true);
      addLog("모션 감지가 활성화되었습니다.");
    } catch (error) {
      alert(error.message);
    }
  };

  const progress = playback.duration
    ? Math.min((playback.current / playback.duration) * 100, 100)
    : 0;

  return (
    <main className="container">
      <section className="card">
        <h1>Motion Band (React)</h1>
        <p className="small">서버: {SOCKET_URL}</p>
        <p>{roomId ? `방 코드: ${roomId}` : "방 코드: 없음"}</p>
        <p>{roleText}</p>
        <div className="badgeList">
          {Object.entries(activeInstruments).map(([key, value]) => (
            <span key={key} className={`badge ${value ? "on" : ""}`}>
              {instrumentLabels[key]} {value ? "ON" : "OFF"}
            </span>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>재생 현황</h2>
        <p>
          {formatTime(playback.current)} / {formatTime(playback.duration)}
          {songStarted ? "" : " (미시작)"}
        </p>
        <div className="progress">
          <div className="progressBar" style={{ width: `${progress}%` }} />
        </div>
        <div className="parts">
          {Object.keys(instrumentLabels).map((instrument) => (
            <div key={instrument} className="partItem">
              <strong>{instrumentLabels[instrument]}</strong>
              <span>{activeInstruments[instrument] ? "재생 중" : "대기 중"}</span>
              <span className="small">
                {activatedAt[instrument] === null
                  ? "아직 합류하지 않음"
                  : `${formatTime(activatedAt[instrument])} 시점부터 활성화`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>입장</h2>
        <button onClick={onCreateRoom}>방 만들기 (보컬)</button>
        <div className="row">
          <input
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            placeholder="방 코드 입력"
          />
          <select value={selectedInstrument} onChange={(e) => setSelectedInstrument(e.target.value)}>
            <option value="piano">피아노</option>
            <option value="guitar">기타</option>
            <option value="drums">드럼</option>
          </select>
        </div>
        <button className="secondary" onClick={onJoinRoom}>
          방 참가 (연주자)
        </button>
      </section>

      {isHost && (
        <section className="card">
          <h2>보컬 패널</h2>
          <button className="secondary" onClick={onInitAudio}>
            오디오 파일 미리 로드
          </button>
          <button className="success" onClick={onStartSong} disabled={!roomId}>
            곡 시작
          </button>
          <p className="small">
            Vercel 배포 시 `public/audio/`에 `vocal.mp3`, `piano.mp3`, `guitar.mp3`, `drums.mp3`를 넣어주세요.
          </p>
        </section>
      )}

      {isParticipant && (
        <section className="card">
          <h2>연주자 패널</h2>
          <button className="warning" onClick={onManualPlay}>
            수동으로 연주 요청 보내기
          </button>
          <button className="success" onClick={onEnableMotion}>
            핸드폰 모션 감지 활성화
          </button>
        </section>
      )}

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
