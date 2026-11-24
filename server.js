const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const players = {};

io.on("connection", socket => {

  console.log("Player connected:", socket.id);

  players[socket.id] = {
    x: 0,
    y: 5,
    z: 8
  };

  socket.emit("players", players);

  socket.broadcast.emit("playerJoined", {
    id: socket.id,
    ...players[socket.id]
  });

  socket.on("move", position => {

    if (!players[socket.id]) return;

    players[socket.id] = {
      x: Number(position.x) || 0,
      y: Number(position.y) || 0,
      z: Number(position.z) || 0
    };

    socket.broadcast.emit("playerMoved", {
      id: socket.id,
      ...players[socket.id]
    });

  });

  socket.on("blockChange", data => {

    if (!["add", "remove"].includes(data.action)) return;

    const x = Number(data.x);
    const y = Number(data.y);
    const z = Number(data.z);

    if (![x, y, z].every(Number.isFinite)) return;

    if (Math.abs(x) > 100000 ||
        Math.abs(y) > 1000 ||
        Math.abs(z) > 100000) return;

    io.emit("blockChanged", {
      action: data.action,
      x,
      y,
      z,
      type: data.type
    });

  });

  socket.on("disconnect", () => {

    delete players[socket.id];

    io.emit("playerLeft", socket.id);

    console.log("Player disconnected:", socket.id);

  });

});

app.get("/", (req, res) => {
  res.send("BLOCKVERSE Multiplayer Server is running.");
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`BLOCKVERSE server running on port ${PORT}`);
});
