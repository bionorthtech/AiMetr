'use strict';
// ── Shared provider tab renderer ────────────────────────────────────────────
// Used by every provider tab (claude, openai, deepseek, ollama, lmstudio).
// Each renders the SAME full-featured layout with its own mascot.

/* global window, document, Chart, Mascots */

const PROVIDER_META = {
  claude:   { name: 'Claude (Anthropic)', icon: '🐱', color: '#CC785C', mascot: 'clawd'  },
  openai:   { name: 'OpenAI / Codex',     icon: '🧠', color: '#10A37F', mascot: 'codex'  },
  deepseek: { name: 'DeepSeek',           icon: '🐟', color: '#536AE6', mascot: 'seeker' },
  ollama:   { name: 'Ollama (Local)',      icon: '🦙', color: '#F9A825', mascot: 'llami'  },
  lmstudio: { name: 'LM Studio (Local)',   icon: '🤖', color: '#9C27B0', mascot: 'studio' },
};

const chartInstances = {}; // canvasId → Chart

// Mascot animation per-tab
const tabMascotState = {}; // providerId → { frame, timer, state, canvas, ctx }

function getMascotState(providerState) {
  if (!providerState || !providerState.connected) return 'offline';
  const pct = providerState.session?.pct || 0;
  if (pct >= 75) return 'excited';
  if (pct >= 10) return 'thinking';
  return 'idle';
}

function startTabMascot(providerId, canvasEl, mascotState) {
  const { COLS, ROWS, SCALE, drawFrame, FRAME_RATES } = window.Mascots;
  const meta = PROVIDER_META[providerId];
  if (!meta || !canvasEl) return;

  canvasEl.width  = COLS * SCALE;
  canvasEl.height = ROWS * SCALE;
  canvasEl.style.width  = (COLS * SCALE) + 'px';
  canvasEl.style.height = (ROWS * SCALE) + 'px';

  const ctx = canvasEl.getContext('2d');
  let frame = 0;

  if (tabMascotState[providerId]?.timer) {
    clearInterval(tabMascotState[providerId].timer);
  }

  const timer = setInterval(() => {
    frame++;
    drawFrame(ctx, meta.mascot, mascotState, frame, SCALE);
  }, FRAME_RATES[mascotState] || 600);

  drawFrame(ctx, meta.mascot, mascotState, 0, SCALE);

  tabMascotState[providerId] = { frame: 0, timer, state: mascotState, canvas: canvasEl, ctx };
}

function fmtTokens(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function fmtCost(usd) {
  if (!usd && usd !== 0) return '—';
  if (usd < 0.01) return '$0.00';
  return '$' + usd.toFixed(2);
}

function fmtReset(ms) {
  if (!ms || ms <= 0) return '—';
  const diff = ms - Date.now();
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function barClass(pct) {
  if (pct >= 80) return 'red';
  if (pct >= 60) return 'orange';
  if (pct >= 40) return 'yellow';
  return 'green';
}

function renderProviderCard(providerId, state, { compact = false } = {}) {
  const meta = PROVIDER_META[providerId];
  if (!meta) return '';

  const connected = state && state.connected;
  const pct  = state?.session?.pct   || 0;
  const pct2 = state?.period?.pct    || 0;
  const used  = state?.session?.used  || 0;
  const limit = state?.session?.limit || 0;
  const cost  = state?.cost?.session  || 0;
  const reset = state?.session?.resetAt;
  const mascotSt = getMascotState(state);

  return `
  <div class="provider-card" style="border-left: 3px solid ${meta.color}">
    <div class="card-mascot">
      <canvas class="tab-mascot-canvas" data-provider="${providerId}" data-state="${mascotSt}"
        style="image-rendering:pixelated"></canvas>
    </div>

    <div class="card-header">
      <div class="card-title">
        <span class="provider-dot" style="background:${meta.color}"></span>
        ${meta.icon} ${meta.name}
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="status-badge ${connected ? 'ok' : 'error'}">
          ${connected ? 'Connected' : (state?.error ? 'Error' : 'Offline')}
        </span>
        <button class="refresh-btn" data-refresh="${providerId}">↻</button>
      </div>
    </div>

    ${connected ? `
    <div class="usage-row">
      <div class="usage-label">
        <span>Session</span>
        <span class="pct">${pct}% &nbsp;${fmtTokens(used)} / ${fmtTokens(limit)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${barClass(pct)}" style="width:${pct}%"></div>
      </div>
    </div>
    <div class="usage-row">
      <div class="usage-label">
        <span>Period</span>
        <span class="pct">${pct2}%</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${barClass(pct2)}" style="width:${pct2}%"></div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-box">
        <div class="label">Cost (session)</div>
        <div class="value">${fmtCost(cost)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Rate limit reset</div>
        <div class="value">${fmtReset(reset)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Active model</div>
        <div class="value" style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${state?.activeModel || '—'}
        </div>
      </div>
    </div>

    ${!compact && state?.models?.length > 1 ? `
    <div style="margin-top:10px">
      <select class="model-select">
        ${(state.models || []).map(m =>
          `<option ${m === state.activeModel ? 'selected' : ''}>${m}</option>`
        ).join('')}
      </select>
    </div>
    ` : ''}
    ` : `
    <div style="color:var(--text-dim);font-size:12px;margin:8px 0">
      ${state?.error || 'Not configured'}
    </div>
    <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px"
      onclick="document.getElementById('settings-overlay').removeAttribute('hidden');Settings && Settings.open('${providerId}')">
      Configure
    </button>
    `}
  </div>`;
}

function renderProviderTab(providerId, state, tasks, history) {
  const meta = PROVIDER_META[providerId];
  if (!meta) return '<div class="empty-state">Unknown provider</div>';

  const connected = state && state.connected;
  const activeTasks = (tasks || []).filter(t => t.provider === providerId || providerId === 'claude');

  return `
  <div style="max-width:900px">
    <!-- Header row with mascot -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--gap)">
      <div style="display:flex;align-items:center;gap:12px">
        <canvas class="tab-mascot-canvas"
          data-provider="${providerId}"
          data-state="${getMascotState(state)}"
          style="image-rendering:pixelated"></canvas>
        <div>
          <div style="font-size:20px;font-weight:700">${meta.icon} ${meta.name}</div>
          <div style="font-size:11px;color:var(--text-dim)">
            ${connected
              ? `Last updated: ${state?.lastFetched ? new Date(state.lastFetched).toLocaleTimeString() : '—'}`
              : (state?.error || 'Offline')}
          </div>
        </div>
      </div>
      <button class="refresh-btn" data-refresh="${providerId}" style="padding:6px 14px">↻ Refresh</button>
    </div>

    ${renderProviderCard(providerId, state)}

    <!-- Historical chart -->
    ${connected ? `
    <div class="chart-container" style="margin-top:var(--gap)">
      <div class="chart-title">Token usage — last 24h</div>
      <canvas id="chart-${providerId}-history" height="80"></canvas>
    </div>
    ` : ''}

    <!-- Active tasks -->
    <div class="tasks-section">
      <div class="section-title">Active Tasks${activeTasks.length > 0 ? ` (${activeTasks.length})` : ''}</div>
      ${renderTaskList(activeTasks)}
    </div>
  </div>`;
}

function renderTaskList(tasks) {
  if (!tasks || tasks.length === 0) {
    return `<div class="empty-state" style="padding:20px 0">
      <div class="icon" style="font-size:24px">💤</div>
      No active sessions
    </div>`;
  }

  return tasks.map(t => {
    const pct = t.tokensLimit > 0
      ? Math.min(100, Math.round(((t.tokensIn + t.tokensOut) / t.tokensLimit) * 100))
      : 0;
    const elapsed = Date.now() - (t.startedAt || Date.now());
    const mins    = Math.floor(elapsed / 60000);

    return `
    <div class="task-item">
      <div>
        <div class="task-label">
          <span class="task-status ${t.status}"></span>${t.label}
        </div>
        <div class="task-meta">
          ${fmtTokens(t.tokensIn + t.tokensOut)} tokens ·
          $${((t.tokensIn + t.tokensOut) / 1_000_000 * 3).toFixed(4)} ·
          ${mins}m ago
        </div>
        <div class="bar-track" style="margin-top:4px;height:4px">
          <div class="bar-fill ${barClass(pct)}" style="width:${pct}%"></div>
        </div>
      </div>
      <span class="task-model">${(t.model || 'unknown').split('-').slice(0,2).join('-')}</span>
    </div>`;
  }).join('');
}

function initCharts(providerId, history) {
  const canvasId = `chart-${providerId}-history`;
  const el = document.getElementById(canvasId);
  if (!el || !history) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }

  const meta = PROVIDER_META[providerId];
  const labels = (history.timestamps || []).map(ts =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const values = (history.values || []).map(v => v?.pct || 0);

  if (labels.length === 0) return;

  chartInstances[canvasId] = new Chart(el, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: meta?.color || '#7c3aed',
        backgroundColor: (meta?.color || '#7c3aed') + '22',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: {
          min: 0, max: 100,
          grid: { color: '#2a2a4a' },
          ticks: { color: '#94a3b8', font: { size: 10 } },
        },
      },
    },
  });
}

// Expose globally
window.ProviderTab = {
  renderProviderCard,
  renderProviderTab,
  renderTaskList,
  initCharts,
  startTabMascot,
  getMascotState,
  PROVIDER_META,
};
