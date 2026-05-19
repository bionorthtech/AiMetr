'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;

const tasks = new Map();
let watcher = null;

function startOfLocalDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function start() {
  if (!fs.existsSync(PROJECTS_DIR)) return;
  _scanAll();
  try {
    watcher = fs.watch(PROJECTS_DIR, { recursive: true }, (_event, filename) => {
      if (filename && filename.endsWith('.jsonl')) _scanAll();
    });
  } catch (_) {}
}

function stop() {
  if (watcher) { watcher.close(); watcher = null; }
}

function getTasks() {
  const now = Date.now();
  return Array.from(tasks.values())
    .filter(t => (now - t.lastActivity) < ACTIVE_THRESHOLD_MS * 6)
    .sort((a, b) => b.lastActivity - a.lastActivity);
}

function _scanAll() {
  if (!fs.existsSync(PROJECTS_DIR)) return;

  let dirs;
  try { dirs = fs.readdirSync(PROJECTS_DIR); } catch (_) { return; }

  for (const dir of dirs) {
    const dirPath = path.join(PROJECTS_DIR, dir);
    let stat;
    try { stat = fs.statSync(dirPath); } catch (_) { continue; }
    if (!stat.isDirectory()) continue;

    let files;
    try { files = fs.readdirSync(dirPath); } catch (_) { continue; }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      _parseSession(path.join(dirPath, file), dir);
    }
  }
}

function _lineTimestamp(msg) {
  if (!msg.timestamp) return 0;
  const ts = new Date(msg.timestamp).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function _collectUsageFromMessage(msg, sinceMs, entries) {
  const ts = _lineTimestamp(msg);

  if (msg.role === 'assistant' && msg.usage) {
    if (!sinceMs || !ts || ts >= sinceMs) {
      entries.push({
        tokensIn: msg.usage.input_tokens || 0,
        tokensOut: msg.usage.output_tokens || 0,
        model: msg.model || 'claude',
        ts,
      });
    }
  }

  if (msg.type === 'assistant' && msg.message?.usage) {
    if (!sinceMs || !ts || ts >= sinceMs) {
      entries.push({
        tokensIn: msg.message.usage.input_tokens || 0,
        tokensOut: msg.message.usage.output_tokens || 0,
        model: msg.message.model || 'claude',
        ts,
      });
    }
  }
}

function _parseSession(filePath, projectDir) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch (_) { return; }

  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return;

  let tokensIn = 0, tokensOut = 0, lastActivity = 0;
  let model = 'claude';
  let label = '';
  const sessionId = path.basename(filePath, '.jsonl');

  for (const line of lines) {
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }

    if (msg.type === 'message' || msg.role) {
      const ts = _lineTimestamp(msg);
      if (ts > lastActivity) lastActivity = ts;

      if (!label && msg.role === 'human') {
        const text = Array.isArray(msg.content)
          ? msg.content.find(c => c.type === 'text')?.text || ''
          : (msg.content || '');
        label = String(text).slice(0, 60).replace(/\n/g, ' ');
      }

      if (msg.role === 'assistant' && msg.usage) {
        tokensIn  += msg.usage.input_tokens  || 0;
        tokensOut += msg.usage.output_tokens || 0;
        if (msg.model) model = msg.model;
      }

      if (msg.message?.usage) {
        tokensIn  += msg.message.usage.input_tokens  || 0;
        tokensOut += msg.message.usage.output_tokens || 0;
        if (msg.message.model) model = msg.message.model;
      }
    }

    if (msg.type === 'human' && !label) {
      const content = msg.message?.content || '';
      const text = Array.isArray(content)
        ? content.find(c => c.type === 'text')?.text || ''
        : content;
      label = String(text).slice(0, 60).replace(/\n/g, ' ');
    }
  }

  if (lastActivity === 0) {
    try { lastActivity = fs.statSync(filePath).mtimeMs; } catch (_) { lastActivity = Date.now(); }
  }

  const now = Date.now();
  tasks.set(sessionId, {
    id: sessionId,
    provider: 'claude',
    model,
    tokensIn,
    tokensOut,
    tokensLimit: 200000,
    startedAt: lastActivity - (lines.length * 2000),
    lastActivity,
    status: (now - lastActivity) < ACTIVE_THRESHOLD_MS ? 'active' : 'idle',
    label: label || `Session ${sessionId.slice(0, 8)}`,
    projectDir,
  });
}

function _aggregateUsageSince(sinceMs) {
  const entries = [];
  if (!fs.existsSync(PROJECTS_DIR)) return entries;

  let dirs;
  try { dirs = fs.readdirSync(PROJECTS_DIR); } catch (_) { return entries; }

  for (const dir of dirs) {
    const dirPath = path.join(PROJECTS_DIR, dir);
    let stat;
    try { stat = fs.statSync(dirPath); } catch (_) { continue; }
    if (!stat.isDirectory()) continue;

    let files;
    try { files = fs.readdirSync(dirPath); } catch (_) { continue; }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      let content;
      try { content = fs.readFileSync(path.join(dirPath, file), 'utf8'); } catch (_) { continue; }

      for (const line of content.trim().split('\n').filter(Boolean)) {
        let msg;
        try { msg = JSON.parse(line); } catch (_) { continue; }
        _collectUsageFromMessage(msg, sinceMs, entries);
      }
    }
  }

  return entries;
}

/**
 * Token usage for cost estimation.
 * session — active/recent Claude Code tasks; period — all usage since local midnight.
 */
function getClaudeUsageSummary() {
  _scanAll();
  const recentTasks = getTasks();

  let sessionIn = 0;
  let sessionOut = 0;
  let sessionModel = 'claude';
  recentTasks.forEach(t => {
    sessionIn  += t.tokensIn;
    sessionOut += t.tokensOut;
    if (t.tokensIn + t.tokensOut > 0) sessionModel = t.model;
  });

  const periodEntries = _aggregateUsageSince(startOfLocalDay());
  let periodIn = 0;
  let periodOut = 0;
  periodEntries.forEach(e => {
    periodIn  += e.tokensIn;
    periodOut += e.tokensOut;
  });

  return {
    session: { tokensIn: sessionIn, tokensOut: sessionOut, model: sessionModel, entries: recentTasks },
    period:  { tokensIn: periodIn, tokensOut: periodOut, entries: periodEntries },
  };
}

module.exports = {
  start,
  stop,
  getTasks,
  getClaudeUsageSummary,
  startOfLocalDay,
};
