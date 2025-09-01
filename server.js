const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

let waiting = null;               // socket.id of waiting user
const partners = new Map();       // socket.id -> partnerId
const users = new Set();          // Track connected users

io.on("connection", (socket) => {
  users.add(socket.id);
  io.emit("userCountUpdate", { count: users.size });
  
  // Join queue
  socket.on("findPartner", () => {
    if (!waiting || waiting === socket.id) {
      waiting = socket.id;
      socket.emit("status", "Waiting for a partner…");
    } else {
      const a = waiting;
      const b = socket.id;
      waiting = null;
      partners.set(a, b);
      partners.set(b, a);
      io.to(a).emit("matched", { partnerId: b, initiator: true });
      io.to(b).emit("matched", { partnerId: a, initiator: false });
    }
  });

  // Relay WebRTC messages to partner
  socket.on("signal", (payload) => {
    const partnerId = partners.get(socket.id);
    if (partnerId) io.to(partnerId).emit("signal", payload);
  });

  // Next
  socket.on("next", () => {
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("partnerLeft");
      partners.delete(partnerId);
      partners.delete(socket.id);
    }
    socket.emit("status", "Searching for a new partner…");
    socket.emit("reset"); 
  });
  
  // Cancel search
  socket.on("cancelSearch", () => {
    if (waiting === socket.id) {
      waiting = null;
    }
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("partnerLeft");
      partners.delete(partnerId);
      partners.delete(socket.id);
    }
  });
  
  socket.on("disconnect", () => {
    users.delete(socket.id);
    io.emit("userCountUpdate", { count: users.size });
    
    const partnerId = partners.get(socket.id);
    if (waiting === socket.id) waiting = null;
    if (partnerId) {
      io.to(partnerId).emit("partnerLeft");
      partners.delete(partnerId);
      partners.delete(socket.id);
    }
  });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Signaling server on :${PORT}`));