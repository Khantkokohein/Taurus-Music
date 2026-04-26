import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { generateChatReply, generateSongAudio, optimizeMusicPrompt } from './src/lib/gemini';
import { requireFirebaseAuth } from './src/lib/serverAuth';

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  // Socket.io logic
  let connectedClients = 0;

  app.use(express.json({ limit: '1mb' }));

  app.post('/api/optimize-prompt', async (req, res) => {
    try {
      await requireFirebaseAuth(req);
      const { idea } = req.body || {};
      if (!idea || typeof idea !== 'string') {
        return res.status(400).json({ error: 'Idea is required.' });
      }

      const prompt = await optimizeMusicPrompt(idea.slice(0, 1000));
      return res.json({ prompt });
    } catch (error: any) {
      console.error('Optimize prompt API error:', error);
      return res.status(500).json({ error: error?.message || 'Failed to enhance prompt.' });
    }
  });

  app.post('/api/ai-chat', async (req, res) => {
    try {
      await requireFirebaseAuth(req);
      const { sourceText, userName, languageHint, recentContext } = req.body || {};
      if (!sourceText || typeof sourceText !== 'string') {
        return res.status(400).json({ error: 'Message is required.' });
      }

      const reply = await generateChatReply({
        sourceText: sourceText.slice(0, 500),
        userName: typeof userName === 'string' && userName ? userName.slice(0, 80) : 'friend',
        languageHint: typeof languageHint === 'string' ? languageHint.slice(0, 40) : 'English',
        recentContext: typeof recentContext === 'string' ? recentContext.slice(0, 2000) : '',
      });
      return res.json({ reply });
    } catch (error: any) {
      console.error('AI chat API error:', error);
      return res.status(500).json({ error: error?.message || 'Failed to generate chat reply.' });
    }
  });

  app.post('/api/generate-song', async (req, res) => {
    try {
      await requireFirebaseAuth(req);
      const { prompt, genreDescription, voice } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required.' });
      }

      const result = await generateSongAudio({
        prompt: prompt.slice(0, 1200),
        genreDescription: typeof genreDescription === 'string' ? genreDescription.slice(0, 240) : 'modern pop',
        voice: typeof voice === 'string' ? voice.slice(0, 120) : 'Duet/Pair',
      });
      return res.json(result);
    } catch (error: any) {
      console.error('Generate song API error:', error);
      return res.status(500).json({ error: error?.message || 'Failed to generate song.' });
    }
  });

  io.on('connection', (socket) => {
    connectedClients++;
    console.log('A user connected:', socket.id, 'Total:', connectedClients);
    io.emit('user_count', connectedClients);
    
    socket.on('message', (data) => {
      console.log('Message received:', data);
      io.emit('message', {
        ...data,
        timestamp: new Date().toISOString(),
        id: Math.random().toString(36).substr(2, 9)
      });
    });

    socket.on('disconnect', () => {
      connectedClients--;
      console.log('User disconnected:', socket.id, 'Total:', connectedClients);
      io.emit('user_count', connectedClients);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Express 5 catch-all
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
