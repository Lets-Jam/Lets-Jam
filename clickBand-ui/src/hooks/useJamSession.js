import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

export const SOCKET_EVENTS = {
  CREATE_ROOM: "create_room",
  JOIN_ROOM: "join_room",
  CHANGE_INSTRUMENT: "change_instrument",
  START_SONG: "start_song",
  ACTIVATE_INSTRUMENT: "activate_instrument",
  ROOM_CREATED: "room_created",
  JOINED_ROOM: "joined_room",
  INSTRUMENT_CHANGED: "instrument_changed",
  JOIN_ERROR: "join_error",
  SONG_STARTED: "song_started",
  INSTRUMENT_ACTIVATED: "instrument_activated",
  INSTRUMENT_DEACTIVATED: "instrument_deactivated",
  USER_JOINED: "user_joined",
  USER_LEFT: "user_left",
  ROOM_STATE: "room_state",
  PLAYBACK_SYNC: "playback_sync",
  HOST_LEFT: "host_left",
};

export const instrumentLabels = {
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

function createDefaultAudioState() {
  return {
    buffers: {},
    sources: {},
    gains: {},
  };
}

export function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function useJamSession() {
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioStateRef = useRef(createDefaultAudioState());
  const progressTimerRef = useRef(null);
  const roleRef = useRef(null);
  const myInstrumentRef = useRef(null);
  const lastTriggerAtRef = useRef(0);
  const instrumentAlreadyTriggeredRef = useRef(false);
  const audioStartedRef = useRef(false);
  const songStartAtRef = useRef(null);
  const serverStartedAtRef = useRef(null);
  const serverDriftMsRef = useRef(0);
  const durationLoadedRef = useRef(false);
  const playbackDurationRef = useRef(0);

  const [roomId, setRoomId] = useState("");
  const [role, setRole] = useState(null);
  const [myInstrument, setMyInstrument] = useState(null);
  const [activeInstruments, setActiveInstruments] = useState(initialActive);
  const [activatedAt, setActivatedAt] = useState(initialActivatedAt);
  const [logs, setLogs] = useState([]);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [songStarted, setSongStarted] = useState(false);
  const [playback, setPlayback] = useState({ current: 0, duration: 0 });
  const [isBusy, setIsBusy] = useState(false);
  const [connectionReady, setConnectionReady] = useState(false);
  const [isChangingInstrument, setIsChangingInstrument] = useState(false);

  const addLog = (message) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${message}`, ...prev].slice(0, 200));
  };

  const resetLocalState = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    Object.values(audioStateRef.current.sources).forEach((source) => {
      try {
        source.stop();
      } catch {}
    });

    audioStateRef.current = createDefaultAudioState();
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;

    audioStartedRef.current = false;
    songStartAtRef.current = null;
    serverStartedAtRef.current = null;
    serverDriftMsRef.current = 0;
    durationLoadedRef.current = false;
    playbackDurationRef.current = 0;
    instrumentAlreadyTriggeredRef.current = false;
    lastTriggerAtRef.current = 0;

    setRoomId("");
    setRole(null);
    setMyInstrument(null);
    setActiveInstruments(initialActive);
    setActivatedAt(initialActivatedAt);
    setLogs([]);
    setMotionEnabled(false);
    setSongStarted(false);
    setPlayback({ current: 0, duration: 0 });
    setIsBusy(false);
    setIsChangingInstrument(false);
  };

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
    } catch {}
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

    for (const [instrument, url] of Object.entries(trackFiles)) {
      if (audioStateRef.current.buffers[instrument]) continue;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${instrument} 파일 로드 실패: ${url}`);
      const arr = await response.arrayBuffer();
      const buffer = await audioContextRef.current.decodeAudioData(arr);
      audioStateRef.current.buffers[instrument] = buffer;
    }

    refreshPlayback();
    playbackDurationRef.current =
      audioStateRef.current.buffers.vocal?.duration || playbackDurationRef.current;
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
      throw new Error("먼저 오디오를 초기화해주세요.");
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

  const attachSocketListeners = (socket) => {
    socket.on("connect", () => {
      setConnectionReady(true);
      addLog("서버에 연결되었습니다.");
    });

    socket.on("disconnect", () => {
      setConnectionReady(false);
      addLog("서버 연결이 종료되었습니다.");
    });

    socket.on(
      SOCKET_EVENTS.ROOM_CREATED,
      ({ roomId: newRoomId, role: newRole, activeInstruments, activatedAt }) => {
        setIsBusy(false);
        setRoomId(newRoomId);
        setRole(newRole);
        setMyInstrument("vocal");
        setActiveInstruments(activeInstruments || initialActive);
        setActivatedAt(activatedAt || initialActivatedAt);
        addLog(`방 생성 완료: ${newRoomId}`);
      }
    );

    socket.on(
      SOCKET_EVENTS.JOINED_ROOM,
      ({
        roomId: joinedRoomId,
        role: joinedRole,
        instrument,
        activeInstruments,
        activatedAt,
        started,
        startedAt,
      }) => {
        setIsBusy(false);
        setRoomId(joinedRoomId);
        setRole(joinedRole);
        setMyInstrument(instrument);
        setActiveInstruments(activeInstruments || initialActive);
        setActivatedAt(activatedAt || initialActivatedAt);
        if (started) {
          syncPlaybackState({ startedAt: startedAt || Date.now() });
          addLog("이미 시작된 방입니다. 현재 상태만 확인 가능합니다.");
        }
        addLog(`방 참가 완료: ${joinedRoomId}, 악기: ${instrumentLabels[instrument] || instrument}`);
      }
    );

    socket.on(SOCKET_EVENTS.JOIN_ERROR, (message) => {
      setIsBusy(false);
      setIsChangingInstrument(false);
      alert(message);
    });

    socket.on(
      SOCKET_EVENTS.INSTRUMENT_CHANGED,
      ({ instrument, previousInstrument, socketId, activeInstruments, activatedAt }) => {
        setIsChangingInstrument(false);
        setActiveInstruments(activeInstruments || initialActive);
        setActivatedAt(activatedAt || initialActivatedAt);

        const isMe = socketId ? socketId === socket.id : instrument === myInstrumentRef.current;
        if (isMe) {
          setMyInstrument(instrument);
          instrumentAlreadyTriggeredRef.current = false;
          addLog(
            `내 악기 변경: ${instrumentLabels[previousInstrument] || previousInstrument} -> ${instrumentLabels[instrument] || instrument}`
          );
          return;
        }

        addLog(
          `참가자 악기 변경: ${instrumentLabels[previousInstrument] || previousInstrument} -> ${instrumentLabels[instrument] || instrument}`
        );
      }
    );

    socket.on(SOCKET_EVENTS.SONG_STARTED, ({ activeInstruments, activatedAt, startedAt }) => {
      serverDriftMsRef.current = 0;
      setActiveInstruments(activeInstruments || initialActive);
      setActivatedAt(activatedAt || initialActivatedAt);
      if (roleRef.current !== "host") addLog("보컬이 곡을 시작했습니다.");
      syncPlaybackState({ startedAt: startedAt || Date.now() });
    });

    socket.on(SOCKET_EVENTS.INSTRUMENT_ACTIVATED, ({ instrument, activeInstruments, activatedAt }) => {
      setActiveInstruments(activeInstruments || initialActive);
      setActivatedAt(activatedAt || initialActivatedAt);
      if (roleRef.current === "host") activateLocalInstrument(instrument);
      addLog(`${instrumentLabels[instrument] || instrument} 악기가 활성화되었습니다.`);
    });

    socket.on(
      SOCKET_EVENTS.INSTRUMENT_DEACTIVATED,
      ({ instrument, activeInstruments, activatedAt }) => {
        setActiveInstruments(activeInstruments || initialActive);
        setActivatedAt(activatedAt || initialActivatedAt);
        if (roleRef.current === "host") deactivateLocalInstrument(instrument);
        addLog(`${instrumentLabels[instrument] || instrument} 악기가 비활성화되었습니다.`);
      }
    );

    socket.on(SOCKET_EVENTS.USER_JOINED, ({ instrument }) => {
      addLog(`${instrumentLabels[instrument] || instrument} 참가자가 입장했습니다.`);
    });

    socket.on(SOCKET_EVENTS.USER_LEFT, ({ instrument }) => {
      addLog(`${instrumentLabels[instrument] || instrument} 참가자가 퇴장했습니다.`);
    });

    socket.on(SOCKET_EVENTS.ROOM_STATE, (room) => {
      if (!room?.activeInstruments) return;
      setActiveInstruments(room.activeInstruments);
      setActivatedAt(room.activatedAt || initialActivatedAt);

      if (room.started && room.startedAt) {
        syncPlaybackState({ startedAt: room.startedAt });
      }
    });

    socket.on(SOCKET_EVENTS.PLAYBACK_SYNC, ({ startedAt, elapsedSec, serverNow }) => {
      syncPlaybackState({ startedAt, elapsedSec, serverNow });
    });

    socket.on(SOCKET_EVENTS.HOST_LEFT, () => {
      alert("보컬 호스트가 방을 종료했습니다.");
      resetSession();
    });
  };

  const connectSocket = () => {
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;
    attachSocketListeners(socket);
  };

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    myInstrumentRef.current = myInstrument;
  }, [myInstrument]);

  useEffect(() => {
    ensureDurationLoaded();
    connectSocket();

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (socketRef.current) socketRef.current.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const handleMotion = (event) => {
      if (!motionEnabled || role !== "participant" || !roomId || !myInstrument) return;
      if (instrumentAlreadyTriggeredRef.current) return;

      const now = Date.now();
      if (now - lastTriggerAtRef.current < 1500) return;

      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const magnitude = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);
      if (magnitude <= 35) return;

      lastTriggerAtRef.current = now;
      instrumentAlreadyTriggeredRef.current = true;
      socketRef.current?.emit(SOCKET_EVENTS.ACTIVATE_INSTRUMENT, { roomId, instrument: myInstrument });
      addLog(`모션 감지 성공 -> ${instrumentLabels[myInstrument] || myInstrument} 활성화 요청`);
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [motionEnabled, role, roomId, myInstrument]);

  const createRoom = () => {
    if (!connectionReady) {
      alert("서버 연결이 아직 준비되지 않았습니다.");
      return;
    }

    setIsBusy(true);
    socketRef.current?.emit(SOCKET_EVENTS.CREATE_ROOM);
  };

  const joinRoom = ({ roomCode, instrument }) => {
    const normalized = roomCode.trim().toUpperCase();
    if (!normalized) {
      alert("방 코드를 입력해주세요.");
      return;
    }
    if (!instrument || instrument === "vocal") {
      alert("참여 악기를 선택해주세요.");
      return;
    }
    if (!connectionReady) {
      alert("서버 연결이 아직 준비되지 않았습니다.");
      return;
    }

    setIsBusy(true);
    setMyInstrument(instrument);
    socketRef.current?.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomId: normalized,
      instrument,
    });
  };

  const startSong = async () => {
    if (role !== "host" || !roomId) return;

    try {
      await initAudio();
      startAllTracks();
      setActivatedAt(initialActivatedAt);
      setActiveInstruments({ vocal: true, piano: false, guitar: false, drums: false });
      socketRef.current?.emit(SOCKET_EVENTS.START_SONG, { roomId });
    } catch (error) {
      alert(error.message);
    }
  };

  const preloadAudio = async () => {
    try {
      await initAudio();
    } catch (error) {
      alert(error.message);
    }
  };

  const manualPlay = () => {
    if (role !== "participant") {
      alert("참가자만 사용할 수 있습니다.");
      return;
    }
    if (!roomId || !myInstrument) {
      alert("먼저 방에 참가해주세요.");
      return;
    }

    instrumentAlreadyTriggeredRef.current = true;
    socketRef.current?.emit(SOCKET_EVENTS.ACTIVATE_INSTRUMENT, { roomId, instrument: myInstrument });
    addLog(`수동 연주 요청 전송 -> ${instrumentLabels[myInstrument] || myInstrument}`);
  };

  const changeInstrument = (instrument) => {
    if (role !== "participant") {
      alert("연주자만 악기를 변경할 수 있습니다.");
      return;
    }
    if (!roomId) {
      alert("먼저 방에 참가해주세요.");
      return;
    }
    if (!instrument || instrument === myInstrument) {
      return;
    }
    if (activeInstruments[instrument]) {
      alert("이미 재생 중인 악기로는 변경할 수 없습니다.");
      return;
    }

    setIsChangingInstrument(true);
    socketRef.current?.emit(SOCKET_EVENTS.CHANGE_INSTRUMENT, { roomId, instrument });
  };

  const enableMotion = async () => {
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

  const resetSession = () => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }
    setConnectionReady(false);
    resetLocalState();
    connectSocket();
  };

  const roleText = useMemo(() => {
    if (!role) return "현재 역할 미선택";
    return `${role === "host" ? "호스트" : "연주자"}${myInstrument ? ` · ${instrumentLabels[myInstrument]}` : ""}`;
  }, [role, myInstrument]);

  return {
    socketUrl: SOCKET_URL,
    roomId,
    role,
    roleText,
    myInstrument,
    activeInstruments,
    activatedAt,
    logs,
    motionEnabled,
    songStarted,
    playback,
    isBusy,
    isChangingInstrument,
    connectionReady,
    isHost: role === "host",
    isParticipant: role === "participant",
    inRoom: Boolean(role && roomId),
    createRoom,
    joinRoom,
    startSong,
    preloadAudio,
    manualPlay,
    changeInstrument,
    enableMotion,
    resetSession,
  };
}
