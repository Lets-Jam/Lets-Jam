const express = require("express");
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const defaultSslKeyPath = path.resolve(__dirname, "../certs/localhost-key.pem");
const defaultSslCertPath = path.resolve(__dirname, "../certs/localhost.pem");
const sslKeyPath = process.env.SSL_KEY_PATH || defaultSslKeyPath;
const sslCertPath = process.env.SSL_CERT_PATH || defaultSslCertPath;
const httpsEnabled = process.env.ENABLE_HTTPS === "true";
const useHttps =
  httpsEnabled &&
  Boolean(sslKeyPath) &&
  Boolean(sslCertPath) &&
  fs.existsSync(sslKeyPath) &&
  fs.existsSync(sslCertPath);

const server = useHttps
  ? https.createServer(
      {
        key: fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCertPath),
      },
      app
    )
  : http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN
      ? process.env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim())
      : "*",
    methods: ["GET", "POST"],
  },
});

const rooms = {};
const roomSyncIntervals = {};
const AUDIO_ROOT = path.resolve(__dirname, "../clickBand-ui/public/audio");
const VOCAL_TRACK = "vocal";

function resetRoomForSong(room, song) {
  room.songId = song.id;
  room.songTitle = song.title;
  room.availableInstruments = song.tracks;
  room.started = false;
  room.startedAt = null;
  room.activeInstruments = createActiveState(song);
  room.activatedAt = createActivatedAtState(song);

  Object.values(room.participants).forEach((participant) => {
    if (participant.instrument && !room.availableInstruments.includes(participant.instrument)) {
      participant.instrument = null;
    }
  });
}

function restartRoomPlayback(room) {
  const hostInstrument = room.participants?.[room.host]?.instrument || null;
  room.started = true;
  room.startedAt = Date.now();
  room.activeInstruments = Object.fromEntries(
    Object.keys(room.activeInstruments).map((key) => [key, key === hostInstrument])
  );
  room.activatedAt = Object.fromEntries(
    Object.keys(room.activatedAt).map((key) => [key, key === hostInstrument ? 0 : null])
  );
}

function listSongDirectories() {
  if (!fs.existsSync(AUDIO_ROOT)) return [];

  return fs
    .readdirSync(AUDIO_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const songDir = path.join(AUDIO_ROOT, entry.name);
      const trackFiles = fs
        .readdirSync(songDir, { withFileTypes: true })
        .filter((file) => file.isFile() && file.name.endsWith(".mp3"))
        .map((file) => path.parse(file.name).name)
        .sort();

      return {
        id: entry.name,
        title: entry.name,
        tracks: trackFiles,
        availableInstruments: trackFiles,
      };
    })
    .filter((song) => song.tracks.includes(VOCAL_TRACK));
}

function getSongById(songId) {
  return listSongDirectories().find((song) => song.id === songId) || null;
}

function createActiveState(song) {
  return Object.fromEntries(song.tracks.map((track) => [track, false]));
}

function createActivatedAtState(song) {
  return Object.fromEntries(song.tracks.map((track) => [track, null]));
}

function getElapsedSec(room) {
  if (!room?.startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - room.startedAt) / 1000));
}

function stopRoomSync(roomId) {
  if (!roomSyncIntervals[roomId]) return;
  clearInterval(roomSyncIntervals[roomId]);
  delete roomSyncIntervals[roomId];
}

function startRoomSync(roomId) {
  const room = rooms[roomId];
  if (!room || !room.started || !room.startedAt) return;

  stopRoomSync(roomId);
  roomSyncIntervals[roomId] = setInterval(() => {
    const liveRoom = rooms[roomId];
    if (!liveRoom || !liveRoom.started || !liveRoom.startedAt) {
      stopRoomSync(roomId);
      return;
    }

    io.to(roomId).emit("playback_sync", {
      startedAt: liveRoom.startedAt,
      elapsedSec: getElapsedSec(liveRoom),
      serverNow: Date.now(),
    });
  }, 1000);
}

function getParticipantRoom(room, socketId) {
  if (!room?.participants?.[socketId]) return null;
  return room.participants[socketId];
}

function getElapsedActivationSec(room) {
  const elapsedMs = room.startedAt ? Date.now() - room.startedAt : 0;
  return Math.max(0, Math.floor(elapsedMs / 1000));
}

function deactivateInstrument(room, instrument) {
  if (!instrument) return false;
  if (!room.activeInstruments[instrument]) return false;

  room.activeInstruments[instrument] = false;
  room.activatedAt[instrument] = null;
  return true;
}

function activateInstrument(room, instrument) {
  if (!room.availableInstruments.includes(instrument)) return false;
  if (room.activeInstruments[instrument]) return false;

  room.activeInstruments[instrument] = true;
  room.activatedAt[instrument] = getElapsedActivationSec(room);
  return true;
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/songs", (_req, res) => {
  res.status(200).json({ songs: listSongDirectories() });
});

io.on("connection", (socket) => {
  socket.on("get_songs", () => {
    socket.emit("songs_list", { songs: listSongDirectories() });
  });

  socket.on("create_room", ({ songId }) => {
    const song = getSongById(songId);
    if (!song) {
      socket.emit("join_error", "선택한 곡을 찾을 수 없습니다.");
      return;
    }

    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    rooms[roomId] = {
      host: socket.id,
      songId: "",
      songTitle: "",
      availableInstruments: [],
      started: false,
      startedAt: null,
      activeInstruments: {},
      activatedAt: {},
      participants: {
        [socket.id]: { instrument: null },
      },
    };
    resetRoomForSong(rooms[roomId], song);

    socket.join(roomId);

    socket.emit("room_created", {
      roomId,
      role: "host",
      instrument: rooms[roomId].participants[socket.id].instrument,
      songId: song.id,
      songTitle: song.title,
      availableInstruments: song.availableInstruments,
      activeInstruments: rooms[roomId].activeInstruments,
      activatedAt: rooms[roomId].activatedAt,
    });

    io.to(roomId).emit("room_state", rooms[roomId]);
  });

  socket.on("join_room", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("join_error", "존재하지 않는 방입니다.");
      return;
    }

    socket.join(roomId);
    room.participants[socket.id] = { instrument: null };

    socket.emit("joined_room", {
      roomId,
      role: "participant",
      instrument: null,
      songId: room.songId,
      songTitle: room.songTitle,
      availableInstruments: room.availableInstruments,
      activeInstruments: room.activeInstruments,
      activatedAt: room.activatedAt,
      started: room.started,
      startedAt: room.startedAt,
    });

    if (room.started && room.startedAt) {
      socket.emit("playback_sync", {
        startedAt: room.startedAt,
        elapsedSec: getElapsedSec(room),
        serverNow: Date.now(),
      });
    }

    io.to(roomId).emit("room_state", room);
    io.to(roomId).emit("user_joined", { instrument: null });
  });

  socket.on("change_instrument", ({ roomId, instrument }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("join_error", "존재하지 않는 방입니다.");
      return;
    }
    if (!room.availableInstruments.includes(instrument)) {
      socket.emit("join_error", "선택할 수 없는 악기입니다.");
      return;
    }

    const participant = getParticipantRoom(room, socket.id);
    if (!participant) {
      socket.emit("join_error", "먼저 방에 참가해주세요.");
      return;
    }

    const previousInstrument = participant.instrument;
    if (previousInstrument === instrument) {
      socket.emit("instrument_changed", {
        instrument,
        previousInstrument,
        activeInstruments: room.activeInstruments,
        activatedAt: room.activatedAt,
      });
      return;
    }

    if (room.activeInstruments[instrument]) {
      socket.emit("join_error", "이미 재생 중인 악기로는 변경할 수 없습니다.");
      return;
    }

    const previousWasActive = deactivateInstrument(room, previousInstrument);
    participant.instrument = instrument;

    if (previousWasActive) {
      io.to(roomId).emit("instrument_deactivated", {
        instrument: previousInstrument,
        activeInstruments: room.activeInstruments,
        activatedAt: room.activatedAt,
      });
    }

    io.to(roomId).emit("instrument_changed", {
      socketId: socket.id,
      previousInstrument,
      instrument,
      activeInstruments: room.activeInstruments,
      activatedAt: room.activatedAt,
    });
    io.to(roomId).emit("room_state", room);
  });

  socket.on("change_song", ({ roomId, songId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return;

    const song = getSongById(songId);
    if (!song) {
      socket.emit("join_error", "선택한 곡을 찾을 수 없습니다.");
      return;
    }

    stopRoomSync(roomId);
    resetRoomForSong(room, song);
    io.to(roomId).emit("room_state", room);
  });

  socket.on("start_song", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return;

    restartRoomPlayback(room);

    io.to(roomId).emit("song_started", {
      activeInstruments: room.activeInstruments,
      activatedAt: room.activatedAt,
      startedAt: room.startedAt,
    });
    io.to(roomId).emit("playback_sync", {
      startedAt: room.startedAt,
      elapsedSec: 0,
      serverNow: Date.now(),
    });
    startRoomSync(roomId);

    io.to(roomId).emit("room_state", room);
  });

  socket.on("restart_song", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return;

    restartRoomPlayback(room);
    startRoomSync(roomId);

    io.to(roomId).emit("song_started", {
      activeInstruments: room.activeInstruments,
      activatedAt: room.activatedAt,
      startedAt: room.startedAt,
    });
    io.to(roomId).emit("playback_sync", {
      startedAt: room.startedAt,
      elapsedSec: 0,
      serverNow: Date.now(),
    });
    io.to(roomId).emit("room_state", room);
  });

  socket.on("activate_instrument", ({ roomId, instrument }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (!room.availableInstruments.includes(instrument)) return;

    if (activateInstrument(room, instrument)) {
      io.to(roomId).emit("instrument_activated", {
        instrument,
        activeInstruments: room.activeInstruments,
        activatedAt: room.activatedAt,
      });
      io.to(roomId).emit("room_state", room);
    }
  });

  socket.on("deactivate_instrument", ({ roomId, instrument }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (!room.availableInstruments.includes(instrument)) return;

    if (deactivateInstrument(room, instrument)) {
      io.to(roomId).emit("instrument_deactivated", {
        instrument,
        activeInstruments: room.activeInstruments,
        activatedAt: room.activatedAt,
      });
      io.to(roomId).emit("room_state", room);
    }
  });

  socket.on("disconnect", () => {
    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];

      if (room.host === socket.id) {
        stopRoomSync(roomId);
        io.to(roomId).emit("host_left");
        delete rooms[roomId];
        continue;
      }

      if (room.participants[socket.id]) {
        const leavingInstrument = room.participants[socket.id].instrument;
        delete room.participants[socket.id];

        if (deactivateInstrument(room, leavingInstrument)) {
          io.to(roomId).emit("instrument_deactivated", {
            instrument: leavingInstrument,
            activeInstruments: room.activeInstruments,
            activatedAt: room.activatedAt,
          });
        }

        io.to(roomId).emit("user_left", { instrument: leavingInstrument });
        io.to(roomId).emit("room_state", room);
      }
    }
  });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
  const protocol = useHttps ? "https" : "http";
  console.log(`Server running on ${protocol}://localhost:${PORT}`);
  if (HOST === "0.0.0.0") {
    console.log(`Server is exposed on your local network at ${protocol}://<your-ip>:${PORT}`);
  }
  if (!useHttps && sslKeyPath && sslCertPath) {
    console.warn("SSL_KEY_PATH/SSL_CERT_PATH가 설정되었지만 파일을 찾지 못해 HTTP로 실행했습니다.");
  }
});
