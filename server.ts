import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import aiChatHandler from './api/ai-chat.js';
import analyzeVoiceHandler from './api/analyze-voice.js';
import generateSongHandler from './api/generate-song.js';
import optimizePromptHandler from './api/optimize-prompt.js';
import { getAdminAuth } from './api/_firebaseAdmin.js';

const PORT = 3000;
const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigin = String(process.env.APP_URL || '').trim();
const allowedOrigins = new Set([
  ...(configuredOrigin ? [configuredOrigin] : []),
  ...(!isProduction ? ['http://localhost:3000'] : []),
]);

const startServer = async () => {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (origin && allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error('Origin is not allowed.'));
      },
      methods: ['GET', 'POST'],
    },
  });

  app.disable('x-powered-by');
  app.use(express.json({ limit: '16mb', strict: true }));
  app.all('/api/optimize-prompt', optimizePromptHandler);
  app.all('/api/ai-chat', aiChatHandler);
  app.all('/api/generate-song', generateSongHandler);
  app.all('/api/analyze-voice', analyzeVoiceHandler);

  io.use(async (socket, next) => {
    const token = typeof socket.handshake.auth?.token === 'string'
      ? socket.handshake.auth.token
      : '';
    if (!token) return next(new Error('Authentication required.'));
    try {
      const user = await getAdminAuth().verifyIdToken(token, true);
      socket.data.uid = user.uid;
      return next();
    } catch {
      return next(new Error('Authentication required.'));
    }
  });

  let connectedClients = 0;
  io.on('connection', (socket) => {
    connectedClients += 1;
    io.emit('user_count', connectedClients);

    socket.on('message', (data) => {
      const text = typeof data?.text === 'string' ? data.text.trim().slice(0, 4000) : '';
      if (!text) return;
      io.emit('message', {
        userId: socket.data.uid,
        text,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      connectedClients = Math.max(connectedClients - 1, 0);
      io.emit('user_count', connectedClients);
    });
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '127.0.0.1', () => {
    console.log(`Development server listening on http://127.0.0.1:${PORT}`);
  });
};

startServer().catch(() => {
  console.error('Server failed to start.');
  process.exitCode = 1;
});
