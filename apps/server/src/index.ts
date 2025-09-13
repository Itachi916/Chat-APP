import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { setSocketServer, setupSocketHandlers } from './socket';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    credentials: true
  }
});
setSocketServer(io);
setupSocketHandlers(io);

app.use(cors({ origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:3000'], credentials: true }));
app.use(express.json({ limit: '5mb' }));

// Import routes
import healthRoutes from './routes/health';
import userRoutes from './routes/users';
import conversationRoutes from './routes/conversations';
import messageRoutes from './routes/messages';
import mediaRoutes from './routes/media';

// Use routes
app.use('/health', healthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/media', mediaRoutes);

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => {
  console.log(`server listening on :${PORT}`);
});

