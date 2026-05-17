'use strict';
/* global window, Chart, ProviderTab */

let allChartInstance = null;

function renderAllTab(usageState, tasks, histories) {
  const providers = ['claude', 'openai', 'deepseek', 'ollama', 'lmstudio'];
  const meta = window.ProviderTab.PROVIDER_META;

  // Aggregate totals
  let totalCost = 0;
  let connectedCount = 0;
  providers.forEach(id => {
    const s = usageState[id];
    if (s && s.connected) {
      connectedCount++;
      totalCost += s.cost?.session || 0;
    }
  });

  const cards = providers.map(id =>
    window.ProviderTab.renderProviderCard(id, usageState[id], { compact: true })
  ).join('');

  // All-mascots row
  const mascotsRow = providers.map(id => {
    const m = meta[id];
    const st = window.ProviderTab.getMascotState(usageState[id]);
    return `
    <div style="text-align:center">
      <canvas class="tab-mascot-canvas" data-provider="${id}" data-state="${st}"
        style="image-rendering:pixelated;display:block;margin:0 auto"></canvas>
      <div style="font-size:9px;color:var(--text-dim);margin-top:2px">${m?.icon} ${m?.name?.split(' ')[0]}</div>
    </div>`;
  }).join('');

  return `
  <div>
    <!-- All mascots banner -->
    <div style="display:flex;justify-content:center;gap:20px;margin-bottom:var(--gap);
                background:var(--surface);border:1px solid var(--border);
                border-radius:var(--radius);padding:16px">
      ${mascotsRow}
    </div>

    <!-- Aggregate stats -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--gap);margin-bottom:var(--gap)">
      <div class="stat-box">
        <div class="label">Active providers</div>
        <div class="value">${connectedCount} / ${providers.length}</div>
      </div>
      <div class="stat-box">
        <div class="label">Total cost today</div>
        <div class="value">$${totalCost.toFixed(4)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Active tasks</div>
        <div class="value">${(tasks || []).filter(t => t.status === 'active').length}</div>
      </div>
    </div>

    <!-- Combined chart -->
    <div class="chart-container" style="margin-bottom:var(--gap)">
      <div class="chart-title">All providers — usage % (last 24h)</div>
      <canvas id="chart-all-combined" height="100"></canvas>
    </div>

    <!-- Provider cards grid -->
    <div class="cards-grid">${cards}</div>

    <!-- Recent tasks -->
    <div class="tasks-section" style="margin-top:var(--gap)">
      <div class="section-title">All active tasks</div>
      ${window.ProviderTab.renderTaskList(tasks)}
    </div>
  </div>`;
}

function initAllCharts(histories) {
  const el = document.getElementById('chart-all-combined');
  if (!el) return;

  if (allChartInstance) { allChartInstance.destroy(); allChartInstance = null; }

  const providers = ['claude', 'openai', 'deepseek', 'ollama', 'lmstudio'];
  const meta = window.ProviderTab.PROVIDER_META;

  // Find a common set of timestamps using the first provider that has data
  let labels = [];
  const firstWithData = providers.find(id => histories[id]?.timestamps?.length > 0);
  if (firstWithData) {
    labels = (histories[firstWithData].timestamps || []).map(ts =>
      new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  }
  if (labels.length === 0) return;

  const datasets = providers
    .filter(id => histories[id]?.values?.length > 0)
    .map(id => ({
      label: meta[id]?.name?.split(' ')[0] || id,
      data: histories[id].values.map(v => v?.pct || 0),
      borderColor: meta[id]?.color || '#888',
      backgroundColor: 'transparent',
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 2,
    }));

  if (datasets.length === 0) return;

  allChartInstance = new Chart(el, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 12 },
        },
      },
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

window.AllTab = { renderAllTab, initAllCharts };
