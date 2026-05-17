'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

const tasks = new Map(); // sessionId → TaskResult
let watcher = null;

function start() {
  if (!fs.existsSync(PROJECTS_DIR)) return;
  _scanAll();
  try {
    watcher = fs.watch(PROJECTS_DIR, { recursive: true }, (_event, filename) => {
      if (filename && filename.endsWith('.jsonl')) {
        _scanAll();
      }
    });
  } catch (_) {}
}

function stop() {
  if (watcher) { watcher.close(); watcher = null; }
}

function getTasks() {
  const now = Date.now();
  return Array.from(tasks.values())
    .filter(t => (now - t.lastActivity) < ACTIVE_THRESHOLD_MS * 6) // show last 30 min
    .sort((a, b) => b.lastActivity - a.lastActivity);
}

function _scanAll() {
  if (!fs.existsSync(PROJECTS_DIR)) return;

  let dirs;
  try {
    dirs = fs.readdirSync(PROJECTS_DIR);
  } catch (_) { return; }

  for (const dir of dirs) {
    const dirPath = path.join(PROJECTS_DIR, dir);
    let stat;
    try { stat = fs.statSync(dirPath); } catch (_) { continue; }
    if (!stat.isDirectory()) continue;

    let files;
    try { files = fs.readdirSync(dirPath); } catch (_) { continue; }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(dirPath, file);
      _parseSession(filePath, dir);
    }
  }
}

function _parseSession(filePath, projectDir) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_) { return; }

  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return;

  let tokensIn = 0, tokensOut = 0, lastActivity = 0;
  let model = 'claude';
  let label = '';
  let sessionId = path.basename(filePath, '.jsonl');

  for (const line of lines) {
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }

    if (msg.type === 'message' || msg.role) {
      const ts = msg.timestamp ? new Date(msg.timestamp).getTime() : 0;
      if (ts > lastActivity) lastActivity = ts;

      // Extract label from first human message
      if (!label && msg.role === 'human') {
        const content = Array.isArray(msg.content)
          ? msg.content.find(c => c.type === 'text')?.text || ''
          : (msg.content || '');
        label = String(content).slice(0, 60).replace(/\n/g, ' ');
      }

      // Accumulate usage from assistant messages
      if (msg.role === 'assistant' && msg.usage) {
        tokensIn  += msg.usage.input_tokens  || 0;
        tokensOut += msg.usage.output_tokens || 0;
        if (msg.model) model = msg.model;
      }

      // Handle wrapped message format
      if (msg.message && msg.message.usage) {
        tokensIn  += msg.message.usage.input_tokens  || 0;
        tokensOut += msg.message.usage.output_tokens || 0;
        if (msg.message.model) model = msg.message.model;
      }
    }
  }

  if (lastActivity === 0) {
    try {
      lastActivity = fs.statSync(filePath).mtimeMs;
    } catch (_) { lastActivity = Date.now(); }
  }

  const now = Date.now();
  const status = (now - lastActivity) < ACTIVE_THRESHOLD_MS ? 'active' : 'idle';

  tasks.set(sessionId, {
    id: sessionId,
    provider: 'claude',
    model,
    tokensIn,
    tokensOut,
    tokensLimit: 100000,
    startedAt: lastActivity - (lines.length * 2000),
    lastActivity,
    status,
    label: label || `Session ${sessionId.slice(0, 8)}`,
    projectDir,
  });
}

module.exports = { start, stop, getTasks };
