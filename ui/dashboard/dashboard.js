'use strict';
/* global window, document, ProviderTab, AllTab, Settings, Mascots */

// ── State ─────────────────────────────────────────────────────────────────────
let usageState = {};
let tasks      = [];
let histories  = {};
let activeTab  = 'all';

const PROVIDERS = ['claude', 'openai', 'deepseek', 'ollama', 'lmstudio'];

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // macOS traffic lights padding
  if (navigator.platform.includes('Mac')) {
    document.body.classList.add('darwin');
    document.getElementById('titlebar').removeAttribute('hidden');
  }

  // Wire tab buttons (sidebar + tab bar)
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    Settings.open();
  });

  // Load initial data
  try {
    [usageState, tasks] = await Promise.all([
      window.api.invoke('get-all-usage'),
      window.api.invoke('get-tasks'),
    ]);
  } catch (e) {
    usageState = {};
    tasks = [];
  }

  await loadHistories();
  updateSidebarDots();
  renderTab(activeTab);

  // IPC live updates
  window.api.on('usage-update', data => {
    usageState = data || {};
    updateSidebarDots();
    if (document.visibilityState !== 'hidden') renderTab(activeTab);
  });

  window.api.on('task-update', data => {
    tasks = data || [];
    if (document.visibilityState !== 'hidden' && activeTab !== 'all') renderTab(activeTab);
  });

  // Refresh tasks every 15s independently
  setInterval(async () => {
    try {
      tasks = await window.api.invoke('get-tasks') || [];
    } catch (_) {}
  }, 15000);

  // Reload histories every 5min
  setInterval(loadHistories, 5 * 60 * 1000);
}

async function loadHistories() {
  const results = await Promise.allSettled(
    PROVIDERS.map(id =>
      window.api.invoke('get-history', { providerId: id, hoursBack: 24 })
        .then(h => ({ id, h }))
    )
  );
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value) {
      histories[r.value.id] = r.value.h;
    }
  });
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tabId) {
  activeTab = tabId;

  // Update active state on both sidebar and tab bar
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  renderTab(tabId);
}

function renderTab(tabId) {
  const content = document.getElementById('content');

  if (tabId === 'all') {
    content.innerHTML = window.AllTab.renderAllTab(usageState, tasks, histories);
    window.AllTab.initAllCharts(histories);
  } else {
    content.innerHTML = window.ProviderTab.renderProviderTab(
      tabId, usageState[tabId], tasks, histories[tabId]
    );
    window.ProviderTab.initCharts(tabId, histories[tabId]);
  }

  // Start mascot animations for all canvases in the newly rendered content
  initMascotCanvases();

  // Wire refresh buttons
  content.querySelectorAll('[data-refresh]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.textContent = '⟳';
      try { await window.api.invoke('force-refresh'); } catch (_) {}
      setTimeout(() => { btn.textContent = '↻ Refresh'; }, 1000);
    });
  });
}

function initMascotCanvases() {
  document.querySelectorAll('.tab-mascot-canvas').forEach(canvas => {
    const providerId = canvas.dataset.provider;
    const state      = canvas.dataset.state || 'idle';
    window.ProviderTab.startTabMascot(providerId, canvas, state);
  });
}

// ── Sidebar status dots ───────────────────────────────────────────────────────
function updateSidebarDots() {
  PROVIDERS.forEach(id => {
    const btn = document.querySelector(`.sidebar-btn[data-tab="${id}"]`);
    if (!btn) return;
    const s = usageState[id];
    btn.classList.toggle('connected', !!(s && s.connected));
    btn.classList.toggle('error',     !!(s && !s.connected && s.error));
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
