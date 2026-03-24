const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

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
    room.participants[socket.id] = {
      instrument,
    };

    socket.emit("joined_room", {
      roomId,
      role: "participant",
      instrument,
      activeInstruments: room.activeInstruments,
      activatedAt: room.activatedAt,
      started: room.started,
      startedAt: room.startedAt,
    });

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

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});