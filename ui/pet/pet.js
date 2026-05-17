'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let currentMascot    = 'clawd';
let currentState     = 'idle';
let currentFrame     = 0;
let animTimer        = null;
let currentPct       = 0;
let lastUsageState   = {};

const PROVIDER_MASCOTS = {
  claude:   'clawd',
  openai:   'codex',
  deepseek: 'seeker',
  ollama:   'llami',
  lmstudio: 'studio',
};

const PROVIDER_NAMES = {
  claude:   'Claude',
  openai:   'OpenAI',
  deepseek: 'DeepSeek',
  ollama:   'Ollama',
  lmstudio: 'LM Studio',
};

const SPEECH_MESSAGES = {
  excited:  ['🔥 Burning tokens!', '⚡ Almost full!', '🚨 Rate limit soon!'],
  thinking: ['🤔 Processing...', '💭 On it!', '⚙️ Working…'],
  sleeping: ['💤 zzz…', '😴 Idle…', '🌙 Resting'],
  idle:     ['👀 Watching…', '✨ Ready!', '🐱 Meow'],
  offline:  ['❌ Offline', '🔌 No connection'],
};

// ── Canvas setup ─────────────────────────────────────────────────────────────
const { COLS, ROWS, SCALE, drawFrame, FRAME_RATES } = window.Mascots;

const canvas = document.getElementById('pet-canvas');
const ctx    = canvas.getContext('2d');

const W = COLS * SCALE;
const H = ROWS * SCALE;
canvas.width  = W;
canvas.height = H;
canvas.style.width  = W + 'px';
canvas.style.height = H + 'px';

// ── Animation loop ────────────────────────────────────────────────────────────
function startAnimation(state) {
  if (animTimer) clearInterval(animTimer);
  currentFrame = 0;
  animTimer = setInterval(() => {
    currentFrame++;
    render();
  }, FRAME_RATES[state] || 600);
  render();
}

function render() {
  drawFrame(ctx, currentMascot, currentState, currentFrame, SCALE);
}

// ── State transition ──────────────────────────────────────────────────────────
function setState(newState, providerId) {
  const newMascot = PROVIDER_MASCOTS[providerId] || 'clawd';

  const stateChanged   = newState !== currentState;
  const mascotChanged  = newMascot !== currentMascot;

  currentState  = newState;
  currentMascot = newMascot;

  // Update provider label
  document.getElementById('provider-label').textContent =
    PROVIDER_NAMES[providerId] || '';

  if (stateChanged || mascotChanged) {
    startAnimation(newState);
    maybeShowSpeechBubble(newState);
  }
}

function updateUsageBar(pct) {
  currentPct = pct;
  const fill = document.getElementById('mini-bar-fill');
  fill.style.width = Math.min(100, pct) + '%';
  fill.style.background =
    pct >= 80 ? '#ef4444' :
    pct >= 50 ? '#eab308' : '#22c55e';
}

// ── Speech bubble ─────────────────────────────────────────────────────────────
let bubbleTimer = null;

function maybeShowSpeechBubble(state) {
  // Only show on state transitions that are interesting
  if (!['excited', 'sleeping', 'offline'].includes(state)) return;
  const msgs = SPEECH_MESSAGES[state] || [];
  if (msgs.length === 0) return;
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  showBubble(msg, 3000);
}

function showBubble(text, duration = 2500) {
  const el = document.getElementById('speech-bubble');
  el.textContent = text;
  el.classList.add('show');
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Drag ──────────────────────────────────────────────────────────────────────
let dragging = false;
let dragStart = { x: 0, y: 0 };
let winStart  = { x: 0, y: 0 };

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  dragging  = true;
  dragStart = { x: e.screenX, y: e.screenY };
  // Get current window position via IPC (we stored it)
  winStart  = { x: window.screenX || 0, y: window.screenY || 0 };
});

window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const dx = e.screenX - dragStart.x;
  const dy = e.screenY - dragStart.y;
  window.api.send('pet-drag', {
    x: winStart.x + dx,
    y: winStart.y + dy,
  });
});

window.addEventListener('mouseup', () => {
  dragging = false;
});

// ── Right-click context menu ──────────────────────────────────────────────────
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  window.api.send('show-pet-menu');
});

// ── Hover to show stats ────────────────────────────────────────────────────────
canvas.addEventListener('mouseenter', () => {
  if (currentPct > 0) {
    showBubble(`${currentPct}% used`, 1500);
  }
});

// ── IPC listeners ─────────────────────────────────────────────────────────────
window.api.on('pet-state', petStateData => {
  if (!petStateData) return;
  setState(petStateData.state || 'idle', petStateData.provider || 'claude');
});

window.api.on('usage-update', usageData => {
  if (!usageData) return;
  lastUsageState = usageData;

  // Find most active provider by pct
  let maxPct = 0;
  let activeProv = 'claude';
  Object.entries(usageData).forEach(([id, s]) => {
    if (s && s.connected) {
      const pct = s.session?.pct || 0;
      if (pct > maxPct) { maxPct = pct; activeProv = id; }
    }
  });

  updateUsageBar(maxPct);

  // Determine state
  const newState =
    maxPct >= 75 ? 'excited' :
    maxPct >= 10 ? 'thinking' :
    maxPct > 0   ? 'idle'    : 'sleeping';

  setState(newState, activeProv);
});

// ── Init ──────────────────────────────────────────────────────────────────────
startAnimation('idle');

// Request initial data
window.api.invoke('get-all-usage').then(data => {
  if (data) window.api.on && window.dispatchEvent(
    new CustomEvent('_usage', { detail: data })
  );
});
