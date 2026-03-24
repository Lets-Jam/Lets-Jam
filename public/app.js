const socket = io();

let currentRoomId = null;
let myRole = null;
let myInstrument = null;
let audioContext = null;
let audioStarted = false;
let songStartAt = null;
let activatedAtState = {
  vocal: 0,
  piano: null,
  guitar: null,
  drums: null,
};
let progressTimer = null;

const trackFiles = {
  vocal: "/audio/vocal.mp3",
  piano: "/audio/piano.mp3",
  guitar: "/audio/guitar.mp3",
  drums: "/audio/drums.mp3",
};

const audioState = {
  buffers: {},
  sources: {},
  gains: {},
};

const instrumentLabels = {
  vocal: "보컬",
  piano: "피아노",
  guitar: "기타",
  drums: "드럼",
};

const roomCodeEl = document.getElementById("roomCode");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomInputEl = document.getElementById("roomInput");
const instrumentSelectEl = document.getElementById("instrumentSelect");

const hostPanelEl = document.getElementById("hostPanel");
const participantPanelEl = document.getElementById("participantPanel");
const roleTextEl = document.getElementById("roleText");
const stateBadgesEl = document.getElementById("stateBadges");
const logEl = document.getElementById("log");

const initAudioBtn = document.getElementById("initAudioBtn");
const startSongBtn = document.getElementById("startSongBtn");
const manualPlayBtn = document.getElementById("manualPlayBtn");
const motionEnableBtn = document.getElementById("motionEnableBtn");

const playbackTimeEl = document.getElementById("playbackTime");
const progressBarEl = document.getElementById("progressBar");
const partStatusListEl = document.getElementById("partStatusList");

let motionEnabled = false;
let lastTriggerAt = 0;
let instrumentAlreadyTriggered = false;

function log(message) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent = `[${time}] ${message}\n` + logEl.textContent;
}

function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = String(Math.floor(sec / 60)).padStart(2, "0");
  const seconds = String(sec % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getDuration() {
  return audioState.buffers.vocal ? audioState.buffers.vocal.duration : 0;
}

function getCurrentPlaybackSeconds() {
  if (!audioStarted || !songStartAt || !audioContext) return 0;
  return Math.max(0, audioContext.currentTime - songStartAt);
}

function renderRole() {
  roleTextEl.textContent = myRole
    ? `현재 역할: ${myRole}${myInstrument ? ` (${myInstrument})` : ""}`
    : "현재 역할: 미선택";
}

function renderRoomCode() {
  roomCodeEl.textContent = currentRoomId ? `방 코드: ${currentRoomId}` : "방 코드: 없음";
}

function renderActiveInstruments(activeInstruments) {
  const labels = [
    { key: "vocal", name: "보컬" },
    { key: "piano", name: "피아노" },
    { key: "guitar", name: "기타" },
    { key: "drums", name: "드럼" },
  ];

  stateBadgesEl.innerHTML = "";

  labels.forEach(({ key, name }) => {
    const div = document.createElement("div");
    div.className = `badge ${activeInstruments[key] ? "on" : ""}`;
    div.textContent = `${name} ${activeInstruments[key] ? "ON" : "OFF"}`;
    stateBadgesEl.appendChild(div);
  });
}

function renderPartStatus(activeInstruments = {}) {
  partStatusListEl.innerHTML = "";

  ["vocal", "piano", "guitar", "drums"].forEach((instrument) => {
    const active = !!activeInstruments[instrument];
    const activatedAt = activatedAtState[instrument];

    const item = document.createElement("div");
    item.className = "part-status-item";

    const left = document.createElement("div");
    left.className = "part-status-left";

    const name = document.createElement("div");
    name.className = "part-name";
    name.textContent = instrumentLabels[instrument];

    const meta = document.createElement("div");
    meta.className = "part-meta";

    if (activatedAt === null) {
      meta.textContent = "아직 합류하지 않음";
    } else {
      meta.textContent = `${formatTime(activatedAt)} 시점부터 활성화`;
    }

    left.appendChild(name);
    left.appendChild(meta);

    const state = document.createElement("div");
    state.className = `part-state ${active ? "on" : ""}`;
    state.textContent = active ? "재생 중" : "대기 중";

    item.appendChild(left);
    item.appendChild(state);

    partStatusListEl.appendChild(item);
  });
}

function updatePlaybackUI() {
  const duration = getDuration();
  const current = getCurrentPlaybackSeconds();
  const safeCurrent = duration > 0 ? Math.min(current, duration) : 0;
  const percent = duration > 0 ? (safeCurrent / duration) * 100 : 0;

  playbackTimeEl.textContent = `${formatTime(safeCurrent)} / ${formatTime(duration)}`;
  progressBarEl.style.width = `${percent}%`;
}

function startProgressLoop(activeInstruments) {
  if (progressTimer) {
    clearInterval(progressTimer);
  }

  renderPartStatus(activeInstruments);
  updatePlaybackUI();

  progressTimer = setInterval(() => {
    updatePlaybackUI();
  }, 200);
}

async function initAudio() {
  if (audioContext) {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    log("오디오 컨텍스트는 이미 준비되어 있습니다.");
    return;
  }

  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  const entries = Object.entries(trackFiles);

  for (const [instrument, url] of entries) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${instrument} 파일 로드 실패: ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    audioState.buffers[instrument] = audioBuffer;
  }

  updatePlaybackUI();
  log("모든 오디오 파일 로드 완료");
}

function createTrackSource(instrument, initialGain) {
  const source = audioContext.createBufferSource();
  source.buffer = audioState.buffers[instrument];
  source.loop = false;

  const gainNode = audioContext.createGain();
  gainNode.gain.value = initialGain;

  source.connect(gainNode);
  gainNode.connect(audioContext.destination);

  audioState.sources[instrument] = source;
  audioState.gains[instrument] = gainNode;
}

function startAllTracks() {
  if (!audioContext) {
    alert("먼저 오디오 초기화를 해주세요.");
    return;
  }

  if (audioStarted) {
    log("이미 곡이 시작되었습니다.");
    return;
  }

  createTrackSource("vocal", 1);
  createTrackSource("piano", 0);
  createTrackSource("guitar", 0);
  createTrackSource("drums", 0);

  songStartAt = audioContext.currentTime + 0.15;

  Object.values(audioState.sources).forEach((source) => {
    source.start(songStartAt);
  });

  audioStarted = true;
  updatePlaybackUI();
  log("모든 트랙 동시 시작, 현재는 보컬만 재생");
}

function activateLocalInstrument(instrument) {
  if (!audioStarted) {
    log("아직 곡이 시작되지 않았습니다.");
    return;
  }

  const gainNode = audioState.gains[instrument];
  if (!gainNode) return;

  const currentValue = gainNode.gain.value;
  if (currentValue >= 1) return;

  const t = audioContext.currentTime;
  gainNode.gain.cancelScheduledValues(t);
  gainNode.gain.setValueAtTime(currentValue, t);
  gainNode.gain.linearRampToValueAtTime(1, t + 0.25);

  log(`${instrument} 트랙 활성화`);
}

function deactivateLocalInstrument(instrument) {
  if (!audioStarted) {
    return;
  }

  const gainNode = audioState.gains[instrument];
  if (!gainNode) return;

  const currentValue = gainNode.gain.value;
  if (currentValue <= 0) return;

  const t = audioContext.currentTime;
  gainNode.gain.cancelScheduledValues(t);
  gainNode.gain.setValueAtTime(currentValue, t);
  gainNode.gain.linearRampToValueAtTime(0, t + 0.25);

  log(`${instrument} 트랙 비활성화`);
}

async function requestMotionPermissionIfNeeded() {
  if (
    typeof DeviceMotionEvent !== "undefined" &&
    typeof DeviceMotionEvent.requestPermission === "function"
  ) {
    const result = await DeviceMotionEvent.requestPermission();
    if (result !== "granted") {
      throw new Error("모션 권한이 거부되었습니다.");
    }
  }
}

function handleMotion(event) {
  if (!motionEnabled) return;
  if (myRole !== "participant") return;
  if (!currentRoomId) return;
  if (!myInstrument) return;
  if (instrumentAlreadyTriggered) return;

  const now = Date.now();
  if (now - lastTriggerAt < 1500) return;

  const acc = event.accelerationIncludingGravity;
  if (!acc) return;

  const x = Math.abs(acc.x || 0);
  const y = Math.abs(acc.y || 0);
  const z = Math.abs(acc.z || 0);
  const magnitude = x + y + z;

  if (magnitude > 35) {
    lastTriggerAt = now;
    instrumentAlreadyTriggered = true;

    socket.emit("activate_instrument", {
      roomId: currentRoomId,
      instrument: myInstrument,
    });

    log(`모션 감지 성공 → ${myInstrument} 활성화 요청`);
  }
}

window.addEventListener("devicemotion", handleMotion);

createRoomBtn.addEventListener("click", () => {
  socket.emit("create_room");
});

joinRoomBtn.addEventListener("click", () => {
  const roomId = roomInputEl.value.trim().toUpperCase();
  const instrument = instrumentSelectEl.value;

  if (!roomId) {
    alert("방 코드를 입력해주세요.");
    return;
  }

  myInstrument = instrument;

  socket.emit("join_room", {
    roomId,
    instrument,
  });
});

initAudioBtn.addEventListener("click", async () => {
  try {
    await initAudio();
    log("오디오 초기화 완료");
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

startSongBtn.addEventListener("click", async () => {
  try {
    await initAudio();
    startAllTracks();

    activatedAtState = {
      vocal: 0,
      piano: null,
      guitar: null,
      drums: null,
    };

    socket.emit("start_song", { roomId: currentRoomId });
    startProgressLoop({
      vocal: true,
      piano: false,
      guitar: false,
      drums: false,
    });
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

manualPlayBtn.addEventListener("click", () => {
  if (myRole !== "participant") {
    alert("참가자만 사용할 수 있습니다.");
    return;
  }

  if (!currentRoomId || !myInstrument) {
    alert("먼저 방에 참가해주세요.");
    return;
  }

  socket.emit("activate_instrument", {
    roomId: currentRoomId,
    instrument: myInstrument,
  });

  log(`수동 연주 요청 전송 → ${myInstrument}`);
});

motionEnableBtn.addEventListener("click", async () => {
  try {
    await requestMotionPermissionIfNeeded();
    motionEnabled = true;
    log("모션 감지가 활성화되었습니다. 이제 핸드폰을 흔들어보세요.");
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

socket.on("room_created", ({ roomId, role, activeInstruments, activatedAt }) => {
  currentRoomId = roomId;
  myRole = role;
  myInstrument = "vocal";
  activatedAtState = activatedAt || activatedAtState;

  renderRole();
  renderRoomCode();
  renderActiveInstruments(activeInstruments);
  renderPartStatus(activeInstruments);

  hostPanelEl.classList.remove("hidden");
  participantPanelEl.classList.add("hidden");

  log(`방 생성 완료: ${roomId}`);
});

socket.on("joined_room", ({ roomId, role, instrument, activeInstruments, activatedAt, started }) => {
  currentRoomId = roomId;
  myRole = role;
  myInstrument = instrument;
  activatedAtState = activatedAt || activatedAtState;

  renderRole();
  renderRoomCode();
  renderActiveInstruments(activeInstruments);
  renderPartStatus(activeInstruments);

  hostPanelEl.classList.add("hidden");
  participantPanelEl.classList.remove("hidden");

  if (started) {
    log(`이미 곡이 시작된 방입니다. 현재 진행 현황만 확인 가능합니다.`);
  }

  log(`방 참가 완료: ${roomId}, 악기: ${instrument}`);
});

socket.on("join_error", (message) => {
  alert(message);
});

socket.on("song_started", ({ activeInstruments, activatedAt }) => {
  activatedAtState = activatedAt || activatedAtState;

  renderActiveInstruments(activeInstruments);
  renderPartStatus(activeInstruments);

  if (myRole !== "host") {
    log("보컬이 곡을 시작했습니다. 이제 연주 제스처를 보낼 수 있습니다.");
  }
});

socket.on("instrument_activated", ({ instrument, activeInstruments, activatedAt }) => {
  activatedAtState = activatedAt || activatedAtState;

  renderActiveInstruments(activeInstruments);
  renderPartStatus(activeInstruments);

  if (myRole === "host") {
    activateLocalInstrument(instrument);
  }

  if (myRole === "participant" && myInstrument === instrument) {
    log(`내 악기 ${instrument} 가 활성화되었습니다.`);
  } else {
    log(`${instrument} 악기가 활성화되었습니다.`);
  }
});

socket.on("instrument_deactivated", ({ instrument, activeInstruments, activatedAt }) => {
  activatedAtState = activatedAt || activatedAtState;

  renderActiveInstruments(activeInstruments);
  renderPartStatus(activeInstruments);

  if (myRole === "host") {
    deactivateLocalInstrument(instrument);
  }

  if (myRole === "participant" && myInstrument === instrument) {
    log(`내 악기 ${instrument} 가 방 이탈로 비활성화되었습니다.`);
  } else {
    log(`${instrument} 악기가 비활성화되었습니다.`);
  }
});

socket.on("user_joined", ({ instrument }) => {
  log(`${instrument} 참가자가 방에 입장했습니다.`);
});

socket.on("room_state", (room) => {
  if (room?.activeInstruments) {
    renderActiveInstruments(room.activeInstruments);
    activatedAtState = room.activatedAt || activatedAtState;
    renderPartStatus(room.activeInstruments);
  }
});

socket.on("user_left", ({ instrument }) => {
  log(`${instrument} 참가자가 방에서 나갔습니다.`);
});

socket.on("host_left", () => {
  alert("보컬 호스트가 방을 종료했습니다.");
  location.reload();
});

renderRole();
renderRoomCode();
updatePlaybackUI();
renderPartStatus({
  vocal: false,
  piano: false,
  guitar: false,
  drums: false,
});