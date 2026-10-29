const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

// Set once by initSocket() at server startup. Controllers import emitToUser
// rather than the io instance directly so there's one obvious entry point
// for "push this event to a user if they're connected right now."
let io = null;

// Mirrors middleware/auth.js's authToken, but for the socket handshake
// instead of an HTTP header — same JWT, same secret, same "no token = no
// connection" rule.
const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("No token provided"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
};

// Called once from index.js with the underlying http.Server. Rooms are keyed
// by user id so any controller can reach a specific user from anywhere in
// the app without holding a reference to their individual socket.
const initSocket = (server, corsOptions) => {
  io = new Server(server, { cors: corsOptions });

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    socket.join(`user:${socket.userId}`);

    // Pure relay, nothing persisted — just lets the other participant's
    // client show a "typing..." indicator while this one is composing.
    // recipientId comes from the client and isn't verified against a real
    // conversation; worst case of spoofing it is a bogus typing indicator,
    // not a data leak, so that check isn't worth paying for on every keystroke.
    socket.on("chat:typing", ({ recipientId } = {}) => {
      if (!recipientId) return;
      io.to(`user:${recipientId}`).emit("chat:typing", { senderId: socket.userId });
    });
  });

  return io;
};

const emitToUser = (userId, event, payload) => {
  if (io) io.to(`user:${userId}`).emit(event, payload);
};

module.exports = { initSocket, emitToUser };
