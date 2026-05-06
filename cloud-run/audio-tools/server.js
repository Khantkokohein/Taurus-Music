import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import express from 'express';

const app = express();
const PORT = Number(process.env.PORT || 8080);
const AUDIO_TOOLS_SECRET = process.env.AUDIO_TOOLS_SECRET || '';
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;
const MAX_RANGE_SECONDS = 12 * 60;
const FORMATS = new Set(['mp3', 'wav']);
const OPERATIONS = new Set(['crop', 'fade', 'split', 'export', 'selected-range-export']);

app.use(express.json({ limit: '1mb' }));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const outputCodecArgs = (format) => (
  format === 'wav'
    ? ['-c:a', 'pcm_s16le', '-ar', '44100']
    : ['-c:a', 'libmp3lame', '-b:a', '192k']
);

const outputMimeType = (format) => (format === 'wav' ? 'audio/wav' : 'audio/mpeg');

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.on('error', reject);
  child.on('close', code => {
    if (code === 0) resolve();
    else reject(new Error(`${command} failed: ${stderr.slice(-1200)}`));
  });
});

const probeDuration = async (filePath) => {
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${stderr.slice(-800)}`));
      const duration = Number(stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0) return reject(new Error('Could not read audio duration.'));
      resolve(duration);
    });
  });
};

const downloadAudio = async (audioUrl, targetPath) => {
  const url = new URL(audioUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid audio URL.');
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Audio download failed: ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_DOWNLOAD_BYTES) throw new Error('Audio file is too large for editor processing.');
  let downloaded = 0;
  const guard = new TransformStream({
    transform(chunk, controller) {
      downloaded += chunk.byteLength;
      if (downloaded > MAX_DOWNLOAD_BYTES) throw new Error('Audio file is too large for editor processing.');
      controller.enqueue(chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body.pipeThrough(guard)), fs.createWriteStream(targetPath));
};

const encodeOutput = async (filePath, label, format) => ({
  label,
  fileName: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${format}`,
  mimeType: outputMimeType(format),
  audioBase64: (await fsp.readFile(filePath)).toString('base64'),
});

const assertSecret = (req) => {
  if (!AUDIO_TOOLS_SECRET) throw new Error('AUDIO_TOOLS_SECRET is not configured.');
  const received = req.headers['x-taurus-audio-secret'];
  if (received !== AUDIO_TOOLS_SECRET) {
    const error = new Error('Unauthorized audio tools request.');
    error.statusCode = 401;
    throw error;
  }
};

const buildEditJobs = async ({ inputPath, outputDir, operation, start, end, splitAt, fadeIn, fadeOut, format }) => {
  const duration = await probeDuration(inputPath);
  const safeFormat = FORMATS.has(format) ? format : 'mp3';
  const jobs = [];

  if (operation === 'split') {
    const cut = clamp(splitAt, 1, Math.max(duration - 1, 1));
    const first = path.join(outputDir, `part-1.${safeFormat}`);
    const second = path.join(outputDir, `part-2.${safeFormat}`);
    jobs.push({ outputPath: first, label: 'Split Part 1', args: ['-y', '-ss', '0', '-i', inputPath, '-t', String(cut), '-vn', ...outputCodecArgs(safeFormat), first] });
    jobs.push({ outputPath: second, label: 'Split Part 2', args: ['-y', '-ss', String(cut), '-i', inputPath, '-t', String(Math.max(duration - cut, 0.1)), '-vn', ...outputCodecArgs(safeFormat), second] });
    return { jobs, format: safeFormat };
  }

  const outputPath = path.join(outputDir, `output.${safeFormat}`);
  if (operation === 'fade') {
    const safeFadeIn = clamp(fadeIn, 0, 20);
    const safeFadeOut = clamp(fadeOut, 0, 20);
    const fadeOutStart = Math.max(duration - safeFadeOut, 0);
    const filters = [
      safeFadeIn > 0 ? `afade=t=in:st=0:d=${safeFadeIn}` : '',
      safeFadeOut > 0 ? `afade=t=out:st=${fadeOutStart}:d=${safeFadeOut}` : '',
    ].filter(Boolean).join(',');
    jobs.push({ outputPath, label: 'Fade Export', args: ['-y', '-i', inputPath, ...(filters ? ['-af', filters] : []), '-vn', ...outputCodecArgs(safeFormat), outputPath] });
    return { jobs, format: safeFormat };
  }

  if (operation === 'crop' || operation === 'selected-range-export') {
    const safeStart = clamp(start, 0, Math.max(duration - 0.1, 0));
    const safeEnd = clamp(end, safeStart + 0.1, duration);
    const range = clamp(safeEnd - safeStart, 0.1, MAX_RANGE_SECONDS);
    jobs.push({ outputPath, label: operation === 'crop' ? 'Crop Export' : 'Selected Range', args: ['-y', '-ss', String(safeStart), '-i', inputPath, '-t', String(range), '-vn', ...outputCodecArgs(safeFormat), outputPath] });
    return { jobs, format: safeFormat };
  }

  jobs.push({ outputPath, label: `${safeFormat.toUpperCase()} Export`, args: ['-y', '-i', inputPath, '-vn', ...outputCodecArgs(safeFormat), outputPath] });
  return { jobs, format: safeFormat };
};

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'taurus-audio-tools' });
});

app.post('/process', async (req, res) => {
  let tempDir = '';
  try {
    assertSecret(req);
    const body = req.body || {};
    const operation = String(body.operation || '');
    if (!OPERATIONS.has(operation)) return res.status(400).json({ error: 'Invalid audio edit operation.' });
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), `taurus-audio-${crypto.randomUUID()}-`));
    const inputPath = path.join(tempDir, 'input.audio');
    await downloadAudio(String(body.audioUrl || ''), inputPath);

    const { jobs, format } = await buildEditJobs({
      inputPath,
      outputDir: tempDir,
      operation,
      start: toNumber(body.start),
      end: toNumber(body.end, 30),
      splitAt: toNumber(body.splitAt, 30),
      fadeIn: toNumber(body.fadeIn, 2),
      fadeOut: toNumber(body.fadeOut, 2),
      format: String(body.format || 'mp3').toLowerCase(),
    });

    for (const job of jobs) await run('ffmpeg', job.args);
    const outputs = [];
    for (const job of jobs) outputs.push(await encodeOutput(job.outputPath, job.label, format));
    res.json({ ok: true, operation, format, outputs });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message || 'Audio processing failed.' });
  } finally {
    if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`Taurus audio tools listening on ${PORT}`);
});
