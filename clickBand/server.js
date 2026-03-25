const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
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

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

io.on("connection", (socket) => {
  socket.on("create_room", () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    rooms[roomId] = {
      host: socket.id,
      started: false,
      startedAt: null,
      activeInstruments: {
        vocal: true,
        piano: false,
        guitar: false,
        drums: false,
      },
      activatedAt: {
        vocal: 0,
        piano: null,
        guitar: null,
        drums: null,
      },
      participants: {},
    };

    socket.join(roomId);

    socket.emit("room_created", {
      roomId,
      role: "host",
      activeInstruments: rooms[roomId].activeInstruments,
      activatedAt: rooms[roomId].activatedAt,
    });

    io.to(roomId).emit("room_state", rooms[roomId]);
  });

  socket.on("join_room", ({ roomId, instrument }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("join_error", "존재하지 않는 방입니다.");
      return;
    }

    socket.join(roomId);
    room.participants[socket.id] = { instrument };

    socket.emit("joined_room", {
      roomId,
      role: "participant",
      instrument,
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
    io.to(roomId).emit("user_joined", { instrument });
  });

  socket.on("start_song", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return;

    room.started = true;
    room.startedAt = Date.now();
    room.activatedAt.vocal = 0;

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

  socket.on("activate_instrument", ({ roomId, instrument }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (!["piano", "guitar", "drums"].includes(instrument)) return;

    if (!room.activeInstruments[instrument]) {
      room.activeInstruments[instrument] = true;
      const elapsedMs = room.startedAt ? Date.now() - room.startedAt : 0;
      room.activatedAt[instrument] = Math.max(0, Math.floor(elapsedMs / 1000));

      io.to(roomId).emit("instrument_activated", {
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

        if (["piano", "guitar", "drums"].includes(leavingInstrument)) {
          if (room.activeInstruments[leavingInstrument]) {
            room.activeInstruments[leavingInstrument] = false;
            room.activatedAt[leavingInstrument] = null;

            io.to(roomId).emit("instrument_deactivated", {
              instrument: leavingInstrument,
              activeInstruments: room.activeInstruments,
              activatedAt: room.activatedAt,
            });
          }
        }

        io.to(roomId).emit("user_left", { instrument: leavingInstrument });
        io.to(roomId).emit("room_state", room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
