import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { resolveSocketUrl } from "../lib/socketUrl";

const SOCKET_URL = resolveSocketUrl();
export const SOCKET_EVENTS = {
  GET_SONGS: "get_songs",
  SONGS_LIST: "songs_list",
  CREATE_ROOM: "create_room",
  JOIN_ROOM: "join_room",
  CHANGE_INSTRUMENT: "change_instrument",
  CHANGE_SONG: "change_song",
  RESTART_SONG: "restart_song",
  START_SONG: "start_song",
  ACTIVATE_INSTRUMENT: "activate_instrument",
  DEACTIVATE_INSTRUMENT: "deactivate_instrument",
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

// 악기 음악 정류 및 정의 추가
export const instrumentLabels = {
  vocal: "보컬",
  piano: "피아노",
  guitar: "기타",
  bass: "베이스",
  drums: "드럼",
  orchestra: "오케스트라",
  edm: "EDM",
};

export function getInstrumentLabel(instrument) {
  if (!instrument) return "악기 미선택";

  if (instrumentLabels[instrument]) {
    return instrumentLabels[instrument];
  }

  return instrument
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const initialActive = {};

const initialActivatedAt = {};

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
  const micStreamRef = useRef(null);
  const micSourceRef = useRef(null);
  const micGainRef = useRef(null);
  const progressTimerRef = useRef(null);
  const roleRef = useRef(null);
  const roomIdRef = useRef("");
  const myInstrumentRef = useRef(null);
  const activeInstrumentsRef = useRef(initialActive);
  const lastTriggerAtRef = useRef(0);
  const instrumentAlreadyTriggeredRef = useRef(false);
  const audioStartedRef = useRef(false);
  const songStartAtRef = useRef(null);
  const serverStartedAtRef = useRef(null);
  const serverDriftMsRef = useRef(0);
  const durationLoadedRef = useRef(false);
  const playbackDurationRef = useRef(0);
  const autoJoinAttemptedRef = useRef(false);
  const motionStopTimerRef = useRef(null);
  const previousSongIdRef = useRef("");
  const pendingActivateInstrumentRef = useRef(null);

  const [roomId, setRoomId] = useState("");
  const [role, setRole] = useState(null);
  const [myInstrument, setMyInstrument] = useState(null);
  const [activeInstruments, setActiveInstruments] = useState(initialActive);
  const [activatedAt, setActivatedAt] = useState(initialActivatedAt);
  const [logs, setLogs] = useState([]);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionThreshold, setMotionThreshold] = useState(24);
  const [songStarted, setSongStarted] = useState(false);
  const [playback, setPlayback] = useState({ current: 0, duration: 0 });
  const [isBusy, setIsBusy] = useState(false);
  const [connectionReady, setConnectionReady] = useState(false);
  const [isChangingInstrument, setIsChangingInstrument] = useState(false);
  const [songs, setSongs] = useState([]);
  const [songsLoading, setSongsLoading] = useState(false);
  const [songsError, setSongsError] = useState("");
  const [selectedSongId, setSelectedSongId] = useState("");
  const [selectedSongTitle, setSelectedSongTitle] = useState("");
  const [availableInstruments, setAvailableInstruments] = useState([]);
  const [pendingRoomCode, setPendingRoomCode] = useState("");
  const [hostSongSearch, setHostSongSearch] = useState("");
  const [vocalMode, setVocalMode] = useState("track");
  const [liveVocalEnabled, setLiveVocalEnabled] = useState(false);
  const selectedSong = useMemo(
    () => songs.find((song) => song.id === selectedSongId) || null,
    [songs, selectedSongId]
  );
  const joinUrl = useMemo(() => {
    if (typeof window === "undefined" || !roomId) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomId);
    return url.toString();
  }, [roomId]);
  const qrCodeImageUrl = useMemo(() => {
    if (!joinUrl) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(joinUrl)}`;
  }, [joinUrl]);
  const canUseMotion = useMemo(() => Boolean(myInstrument && myInstrument !== "vocal"), [myInstrument]);

  const addLog = (message) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${message}`, ...prev].slice(0, 200));
  };

  const stopLiveVocal = () => {
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {}
      micSourceRef.current = null;
    }

    if (micGainRef.current) {
      try {
        micGainRef.current.disconnect();
      } catch {}
      micGainRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    setLiveVocalEnabled(false);
  };

  const stopLocalPlayback = async () => {
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
    audioStartedRef.current = false;
    songStartAtRef.current = null;
    serverStartedAtRef.current = null;
    serverDriftMsRef.current = 0;
    durationLoadedRef.current = false;
    playbackDurationRef.current = 0;
    instrumentAlreadyTriggeredRef.current = false;
    lastTriggerAtRef.current = 0;
    setSongStarted(false);
    setPlayback({ current: 0, duration: 0 });
    stopLiveVocal();

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      await audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
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
    setMotionThreshold(24);
    setSongStarted(false);
    setPlayback({ current: 0, duration: 0 });
    setIsBusy(false);
    setIsChangingInstrument(false);
    setSongsError("");
    setSelectedSongTitle("");
    setAvailableInstruments([]);
    setPendingRoomCode("");
    setHostSongSearch("");
    setVocalMode("track");
    setLiveVocalEnabled(false);
    autoJoinAttemptedRef.current = false;
    previousSongIdRef.current = "";
    stopLiveVocal();
  };

  const getTrackFiles = () => {
    if (!selectedSongId || !selectedSong) return {};

    return selectedSong.tracks.reduce((acc, track) => {
      acc[track] = `/audio/${selectedSongId}/${track}.mp3`;
      return acc;
    }, {});
  };

  const fetchSongs = async () => {
    setSongsLoading(true);
    setSongsError("");
    socketRef.current?.emit(SOCKET_EVENTS.GET_SONGS);
  };

  const syncRoomQuery = (nextRoomCode) => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (nextRoomCode) {
      url.searchParams.set("room", nextRoomCode);
    } else {
      url.searchParams.delete("room");
    }

    window.history.replaceState({}, "", url.toString());
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
        const trackFiles = getTrackFiles();
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

    if (!audioStartedRef.current) {
      const computedElapsed =
        serverNow && typeof elapsedSec === "number"
          ? Math.max(0, elapsedSec + (Date.now() - serverNow) / 1000)
          : Math.max(0, (Date.now() - startedAt) / 1000);

      initAudio()
        .then(() => {
          if (!audioStartedRef.current) {
            startAllTracks(computedElapsed);
          }
        })
        .catch(() => {});
    }
  };

  const initAudio = async () => {
    const trackFiles = getTrackFiles();
    if (!trackFiles.vocal) {
      throw new Error("먼저 곡을 선택해주세요.");
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    for (const [instrument, url] of Object.entries(trackFiles)) {
      if (!url) continue;
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

  const startAllTracks = (startOffsetSec = 0) => {
    if (!audioContextRef.current) {
      throw new Error("먼저 오디오를 초기화해주세요.");
    }
    if (audioStartedRef.current) {
      addLog("이미 곡이 시작되었습니다.");
      return;
    }

    Object.keys(audioStateRef.current.buffers).forEach((instrument) => {
      if (instrument === "vocal" && vocalMode === "live") {
        return;
      }
      const shouldStartAudible =
        roleRef.current === "host"
          ? Boolean(activeInstrumentsRef.current?.[instrument])
          : instrument === myInstrumentRef.current && Boolean(activeInstrumentsRef.current?.[instrument]);
      createTrackSource(instrument, shouldStartAudible ? 1 : 0);
    });

    const startDelay = 0.15;
    songStartAtRef.current = audioContextRef.current.currentTime + startDelay - startOffsetSec;
    Object.values(audioStateRef.current.sources).forEach((source) => {
      source.start(audioContextRef.current.currentTime + startDelay, startOffsetSec);
    });

    audioStartedRef.current = true;
    setSongStarted(true);
    startProgressLoop();
    addLog(
      vocalMode === "live"
        ? "반주 트랙 시작, 보컬은 직접 부르기 모드"
        : "모든 트랙 동시 시작, 현재는 보컬만 재생"
    );
  };

  const toggleLiveVocal = async () => {
    if (!roomId) {
      alert("먼저 방에 참가해주세요.");
      return;
    }

    if (myInstrumentRef.current !== "vocal") {
      alert("직접 부르기는 현재 파트가 보컬일 때만 사용할 수 있습니다.");
      return;
    }

    if (liveVocalEnabled) {
      stopLiveVocal();
      setVocalMode("track");
      if (audioStartedRef.current && activeInstruments.vocal) {
        setLocalInstrumentGain("vocal", 1);
      }
      addLog("직접 부르기 모니터링 종료");
      return;
    }

    try {
      setVocalMode("live");
      if (audioStartedRef.current) {
        setLocalInstrumentGain("vocal", 0);
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("이 브라우저에서는 마이크를 지원하지 않습니다.");
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      } else if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const gain = audioContextRef.current.createGain();
      gain.gain.value = 1;

      source.connect(gain);
      gain.connect(audioContextRef.current.destination);

      micStreamRef.current = stream;
      micSourceRef.current = source;
      micGainRef.current = gain;
      setLiveVocalEnabled(true);
      addLog("직접 부르기 모니터링 시작");
    } catch (error) {
      stopLiveVocal();
      alert(error.message || "마이크를 사용할 수 없습니다.");
    }
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
    gainNode.gain.linearRampToValueAtTime(target, t + 0.45);
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
      socket.emit(SOCKET_EVENTS.GET_SONGS);
    });

    socket.on("disconnect", () => {
      setConnectionReady(false);
      addLog("서버 연결이 종료되었습니다.");
    });

    socket.on(SOCKET_EVENTS.SONGS_LIST, ({ songs }) => {
      const nextSongs = Array.isArray(songs) ? songs : [];
      setSongs(nextSongs);
      setSongsLoading(false);
      setSongsError(nextSongs.length === 0 ? "선택할 수 있는 곡이 없습니다." : "");

      if (!selectedSongId && nextSongs[0]?.id) {
        setSelectedSongId(nextSongs[0].id);
      }
    });

    socket.on(
      SOCKET_EVENTS.ROOM_CREATED,
      ({
        roomId: newRoomId,
        role: newRole,
        instrument,
        songId,
        songTitle,
        availableInstruments,
        activeInstruments,
        activatedAt,
      }) => {
        setIsBusy(false);
        setRoomId(newRoomId);
        setRole(newRole);
        setMyInstrument(instrument || null);
        setSelectedSongId(songId || "");
        setSelectedSongTitle(songTitle || "");
        setAvailableInstruments(availableInstruments || []);
        previousSongIdRef.current = songId || "";
        setActiveInstruments(activeInstruments || initialActive);
        setActivatedAt(activatedAt || initialActivatedAt);
        syncRoomQuery(newRoomId);
        addLog(`방 생성 완료: ${newRoomId}`);
      }
    );

    socket.on(
      SOCKET_EVENTS.JOINED_ROOM,
      ({
        roomId: joinedRoomId,
        role: joinedRole,
        instrument,
        songId,
        songTitle,
        availableInstruments,
        activeInstruments,
        activatedAt,
        started,
        startedAt,
      }) => {
        setIsBusy(false);
        setRoomId(joinedRoomId);
        setRole(joinedRole);
        setMyInstrument(instrument);
        setSelectedSongId(songId || "");
        setSelectedSongTitle(songTitle || "");
        setAvailableInstruments(availableInstruments || []);
        previousSongIdRef.current = songId || "";
        setActiveInstruments(activeInstruments || initialActive);
        setActivatedAt(activatedAt || initialActivatedAt);
        syncRoomQuery(joinedRoomId);
        if (started) {
          syncPlaybackState({ startedAt: startedAt || Date.now() });
          addLog("이미 시작된 방입니다. 현재 상태만 확인 가능합니다.");
        }
        addLog(`방 참가 완료: ${joinedRoomId}${instrument ? `, 악기: ${instrumentLabels[instrument] || instrument}` : ""}`);
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
      if (roleRef.current !== "host") addLog("방장이 곡을 시작했습니다.");
      syncPlaybackState({ startedAt: startedAt || Date.now() });
    });

    socket.on(SOCKET_EVENTS.INSTRUMENT_ACTIVATED, ({ instrument, activeInstruments, activatedAt }) => {
      setActiveInstruments(activeInstruments || initialActive);
      setActivatedAt(activatedAt || initialActivatedAt);
      if (roleRef.current === "host" || instrument === myInstrumentRef.current) {
        activateLocalInstrument(instrument);
      }
      addLog(`${instrumentLabels[instrument] || instrument} 악기가 활성화되었습니다.`);
    });

    socket.on(
      SOCKET_EVENTS.INSTRUMENT_DEACTIVATED,
      ({ instrument, activeInstruments, activatedAt }) => {
        setActiveInstruments(activeInstruments || initialActive);
        setActivatedAt(activatedAt || initialActivatedAt);
        if (roleRef.current === "host" || instrument === myInstrumentRef.current) {
          deactivateLocalInstrument(instrument);
        }
        addLog(`${instrumentLabels[instrument] || instrument} 악기가 비활성화되었습니다.`);
      }
    );

    socket.on(SOCKET_EVENTS.USER_JOINED, ({ instrument }) => {
      addLog(instrument ? `${instrumentLabels[instrument] || instrument} 참가자가 입장했습니다.` : "새 참가자가 입장했습니다.");
    });

    socket.on(SOCKET_EVENTS.USER_LEFT, ({ instrument }) => {
      addLog(instrument ? `${instrumentLabels[instrument] || instrument} 참가자가 퇴장했습니다.` : "참가자가 퇴장했습니다.");
    });

    socket.on(SOCKET_EVENTS.ROOM_STATE, (room) => {
      if (!room?.activeInstruments) return;
      const nextSongId = room.songId || "";
      const songChanged = previousSongIdRef.current && previousSongIdRef.current !== nextSongId;

      if (songChanged) {
        stopLocalPlayback().catch(() => {});
        addLog(`곡 변경됨 -> ${room.songTitle || nextSongId}`);
      }

      previousSongIdRef.current = nextSongId;
      setSelectedSongId(room.songId || "");
      setSelectedSongTitle(room.songTitle || "");
      setAvailableInstruments(room.availableInstruments || []);
      setActiveInstruments(room.activeInstruments);
      setActivatedAt(room.activatedAt || initialActivatedAt);

      setMyInstrument((current) =>
        current && room.availableInstruments?.includes(current) ? current : null
      );

      if (room.started && room.startedAt) {
        syncPlaybackState({ startedAt: room.startedAt });
      } else {
        setSongStarted(false);
        setPlayback((prev) => ({ ...prev, current: 0 }));
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
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    myInstrumentRef.current = myInstrument;
  }, [myInstrument]);

  useEffect(() => {
    activeInstrumentsRef.current = activeInstruments;
  }, [activeInstruments]);

  useEffect(() => {
    if (!songStarted || !myInstrument || pendingActivateInstrumentRef.current !== myInstrument) {
      return;
    }

    pendingActivateInstrumentRef.current = null;
    socketRef.current?.emit(SOCKET_EVENTS.ACTIVATE_INSTRUMENT, {
      roomId: roomIdRef.current,
      instrument: myInstrument,
    });
  }, [myInstrument, songStarted]);

  useEffect(() => {
    if (vocalMode !== "live") {
      stopLiveVocal();
    }
  }, [vocalMode]);

  useEffect(() => {
    if (myInstrument !== "vocal" && liveVocalEnabled) {
      stopLiveVocal();
      setVocalMode("track");
    }
  }, [myInstrument, liveVocalEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const roomFromQuery = new URL(window.location.href).searchParams.get("room");
    if (roomFromQuery) {
      setPendingRoomCode(roomFromQuery.toUpperCase());
    }
  }, []);

  useEffect(() => {
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
    if (!connectionReady || !pendingRoomCode || roomId || isBusy || autoJoinAttemptedRef.current) {
      return;
    }

    autoJoinAttemptedRef.current = true;
    setIsBusy(true);
    socketRef.current?.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomId: pendingRoomCode,
    });
  }, [connectionReady, pendingRoomCode, roomId, isBusy]);

  useEffect(() => {
    const handleMotion = (event) => {
      if (!motionEnabled || !roomId || !myInstrument || myInstrument === "vocal") return;

      const now = Date.now();

      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const magnitude = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);
      if (magnitude > motionThreshold) {
        if (!instrumentAlreadyTriggeredRef.current) {
          if (now - lastTriggerAtRef.current >= 250) {
            lastTriggerAtRef.current = now;
            instrumentAlreadyTriggeredRef.current = true;
            socketRef.current?.emit(SOCKET_EVENTS.ACTIVATE_INSTRUMENT, { roomId, instrument: myInstrument });
            addLog(`모션 감지 시작 -> ${instrumentLabels[myInstrument] || myInstrument} 활성화 요청`);
          }
        }

        if (motionStopTimerRef.current) clearTimeout(motionStopTimerRef.current);
        motionStopTimerRef.current = setTimeout(() => {
          instrumentAlreadyTriggeredRef.current = false;
          socketRef.current?.emit(SOCKET_EVENTS.DEACTIVATE_INSTRUMENT, { roomId, instrument: myInstrument });
          addLog(`모션 감지 종료 -> ${instrumentLabels[myInstrument] || myInstrument} 비활성화 요청`);
        }, 500);
      }
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      if (motionStopTimerRef.current) clearTimeout(motionStopTimerRef.current);
    };
  }, [motionEnabled, role, roomId, myInstrument, motionThreshold]);

  const createRoom = (songId) => {
    if (!connectionReady) {
      alert("서버 연결이 아직 준비되지 않았습니다.");
      return;
    }
    if (!songId) {
      alert("생성할 곡을 선택해주세요.");
      return;
    }

    setIsBusy(true);
    setSelectedSongId(songId);
    setSelectedSongTitle(songs.find((song) => song.id === songId)?.title || "");
    setAvailableInstruments(
      songs.find((song) => song.id === songId)?.tracks || []
    );
    socketRef.current?.emit(SOCKET_EVENTS.CREATE_ROOM, { songId });
  };

  const joinRoom = ({ roomCode }) => {
    const normalized = roomCode.trim().toUpperCase();
    if (!normalized) {
      alert("방 코드를 입력해주세요.");
      return;
    }
    if (!connectionReady) {
      alert("서버 연결이 아직 준비되지 않았습니다.");
      return;
    }

    setIsBusy(true);
    setPendingRoomCode(normalized);
    socketRef.current?.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomId: normalized,
    });
  };

  const startSong = async () => {
    if (role !== "host" || !roomId) return;

    try {
      await stopLocalPlayback();
      await initAudio();
      startAllTracks();
      socketRef.current?.emit(SOCKET_EVENTS.START_SONG, { roomId });
    } catch (error) {
      alert(error.message);
    }
  };

  const preloadAudio = async () => {
    try {
      if (audioStartedRef.current) {
        await stopLocalPlayback();
      }
      await initAudio();
    } catch (error) {
      alert(error.message);
    }
  };

  const manualPlay = () => {
    if (!roomId || !myInstrument) {
      alert("먼저 방에 참가해주세요.");
      return;
    }

    const isActive = activeInstruments[myInstrument];
    socketRef.current?.emit(
      isActive ? SOCKET_EVENTS.DEACTIVATE_INSTRUMENT : SOCKET_EVENTS.ACTIVATE_INSTRUMENT,
      { roomId, instrument: myInstrument }
    );
    addLog(
      `${isActive ? "수동 정지" : "수동 재생"} 요청 전송 -> ${instrumentLabels[myInstrument] || myInstrument}`
    );
  };

  const selectPart = (instrument) => {
    if (!roomId) {
      alert("먼저 방에 참가해주세요.");
      return;
    }
    if (!instrument) return;

    if (instrument === myInstrument) {
      manualPlay();
      return;
    }

    if (activeInstruments[instrument]) {
      alert("이미 재생 중인 파트는 선택할 수 없습니다.");
      return;
    }

    pendingActivateInstrumentRef.current = songStarted && !motionEnabled ? instrument : null;
    changeInstrument(instrument);
  };

  const changeInstrument = (instrument) => {
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

  const toggleMotion = async () => {
    if (motionEnabled) {
      setMotionEnabled(false);
      addLog("모션 감지가 비활성화되었습니다.");
      return;
    }

    if (roomIdRef.current && myInstrumentRef.current && activeInstrumentsRef.current?.[myInstrumentRef.current]) {
      socketRef.current?.emit(SOCKET_EVENTS.DEACTIVATE_INSTRUMENT, {
        roomId: roomIdRef.current,
        instrument: myInstrumentRef.current,
      });
    }

    await enableMotion();
  };

  const changeSong = async (songId) => {
    if (role !== "host" || !roomId || !songId || songId === selectedSongId) return;

    await stopLocalPlayback();
    setSelectedSongId(songId);
    setSelectedSongTitle(songs.find((song) => song.id === songId)?.title || "");
    socketRef.current?.emit(SOCKET_EVENTS.CHANGE_SONG, { roomId, songId });
  };

  const restartSong = async () => {
    if (role !== "host" || !roomId) return;

    try {
      await stopLocalPlayback();
      await initAudio();
      startAllTracks();
      socketRef.current?.emit(SOCKET_EVENTS.RESTART_SONG, { roomId });
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
    syncRoomQuery("");
    resetLocalState();
    connectSocket();
  };

  const roleText = useMemo(() => {
    if (!role) return "현재 역할 미선택";
    return `${role === "host" ? "호스트" : "연주자"}${myInstrument ? ` · ${instrumentLabels[myInstrument]}` : " · 파트 미선택"}`;
  }, [role, myInstrument]);

  return {
    socketUrl: SOCKET_URL,
    songs,
    songsLoading,
    songsError,
    selectedSongId,
    selectedSongTitle,
    availableInstruments,
    pendingRoomCode,
    hostSongSearch,
    vocalMode,
    liveVocalEnabled,
    joinUrl,
    qrCodeImageUrl,
    roomId,
    role,
    roleText,
    myInstrument,
    activeInstruments,
    activatedAt,
    logs,
    motionEnabled,
    motionThreshold,
    songStarted,
    playback,
    isBusy,
    isChangingInstrument,
    connectionReady,
    canUseMotion,
    isHost: role === "host",
    isParticipant: role === "participant",
    inRoom: Boolean(role && roomId),
    setSelectedSongId,
    setHostSongSearch,
    setVocalMode,
    fetchSongs,
    createRoom,
    joinRoom,
    startSong,
    preloadAudio,
    toggleLiveVocal,
    manualPlay,
    selectPart,
    changeInstrument,
    enableMotion,
    toggleMotion,
    setMotionThreshold,
    changeSong,
    restartSong,
    resetSession,
  };
}
