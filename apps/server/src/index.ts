import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { setSocketServer } from './socket';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    credentials: true
  }
});
setSocketServer(io);

app.use(cors({ origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:3000'], credentials: true }));
app.use(express.json({ limit: '5mb' }));

import routes from './routes';
app.use('/', routes);

io.on('connection', (socket) => {
  socket.on('join', (userId: string) => {
    if (userId) {
      socket.data.userId = userId;
      socket.join(userId);
    }
  });

  socket.on('typing', (payload: { toUserId: string; conversationId: string }) => {
    if (!socket.data.userId) return;
    io.to(payload.toUserId).emit('typing', { fromUserId: socket.data.userId, conversationId: payload.conversationId });
  });

  socket.on('disconnect', () => {});
});

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => {
  console.log(`server listening on :${PORT}`);
});

