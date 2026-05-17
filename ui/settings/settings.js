'use strict';
/* global window, document */

const PROVIDER_FIELDS = {
  claude:   { apiKey:  { label: 'API Key',  type: 'password', placeholder: 'sk-ant-api03-...' } },
  openai:   { apiKey:  { label: 'API Key',  type: 'password', placeholder: 'sk-proj-...' } },
  deepseek: { apiKey:  { label: 'API Key',  type: 'password', placeholder: 'sk-...' } },
  ollama:   { baseUrl: { label: 'Base URL', type: 'text',     placeholder: 'http://localhost:11434' } },
  lmstudio: { baseUrl: { label: 'Base URL', type: 'text',     placeholder: 'http://localhost:1234' } },
};

const PROVIDER_LABELS = {
  claude:   '🐱 Claude (Anthropic)',
  openai:   '🧠 OpenAI / Codex',
  deepseek: '🐟 DeepSeek',
  ollama:   '🦙 Ollama (Local)',
  lmstudio: '🤖 LM Studio (Local)',
};

let currentConfig = {};
let focusProvider = null;

function open(providerId) {
  focusProvider = providerId || null;
  _render();
  document.getElementById('settings-overlay').removeAttribute('hidden');
}

function close() {
  document.getElementById('settings-overlay').setAttribute('hidden', '');
  focusProvider = null;
}

async function _render() {
  const panel = document.getElementById('settings-panel-content');

  try {
    currentConfig = await window.api.invoke('get-config');
  } catch (_) {
    currentConfig = {};
  }

  const providers = Object.keys(PROVIDER_FIELDS);

  panel.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div class="settings-title">⚙️ Settings</div>
    <button class="btn btn-secondary" id="settings-close-btn" style="padding:4px 12px">✕</button>
  </div>

  ${providers.map(id => {
    const cfg    = currentConfig.providers?.[id] || {};
    const fields = PROVIDER_FIELDS[id];
    const enabled = cfg.enabled !== false;

    return `
    <div class="settings-section" id="settings-sec-${id}">
      <div class="settings-section-title">
        ${PROVIDER_LABELS[id]}
        <label style="margin-left:auto;display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" data-provider="${id}" data-field="enabled"
            ${enabled ? 'checked' : ''} style="cursor:pointer">
          <span style="font-size:11px;text-transform:none;letter-spacing:0">Enabled</span>
        </label>
      </div>

      ${Object.entries(fields).map(([key, def]) => `
      <div class="form-row">
        <div class="form-label">${def.label}</div>
        <input class="form-input" type="${def.type}"
          id="input-${id}-${key}"
          placeholder="${def.placeholder}"
          value="${def.type === 'password' ? '' : (cfg[key] || '')}">
      </div>
      `).join('')}

      <div class="btn-row">
        <button class="btn btn-test" data-test="${id}">Test connection</button>
        ${id === 'claude' ? `<button class="btn btn-secondary" data-autodetect="claude">Auto-detect</button>` : ''}
      </div>
      <div class="test-result" id="test-result-${id}"></div>
    </div>`;
  }).join('')}

  <!-- Pet settings -->
  <div class="settings-section">
    <div class="settings-section-title">🐾 Desktop Pet</div>
    <div class="toggle-row">
      <span class="toggle-label">Enable pet overlay</span>
      <input type="checkbox" id="pet-enabled"
        ${(currentConfig.pet?.enabled !== false) ? 'checked' : ''}>
    </div>
  </div>

  <div class="btn-row" style="margin-top:16px">
    <button class="btn btn-primary" id="settings-save-btn">Save</button>
    <button class="btn btn-secondary" id="settings-cancel-btn">Cancel</button>
  </div>`;

  // Wire events
  document.getElementById('settings-close-btn').onclick  = close;
  document.getElementById('settings-cancel-btn').onclick = close;
  document.getElementById('settings-save-btn').onclick   = _save;

  // Test buttons
  panel.querySelectorAll('[data-test]').forEach(btn => {
    btn.onclick = () => _testProvider(btn.dataset.test);
  });

  // Auto-detect Claude
  const autoBtn = panel.querySelector('[data-autodetect="claude"]');
  if (autoBtn) autoBtn.onclick = _autoDetectClaude;

  // Close on overlay click
  document.getElementById('settings-overlay').onclick = e => {
    if (e.target === document.getElementById('settings-overlay')) close();
  };

  // Scroll to focused provider
  if (focusProvider) {
    setTimeout(() => {
      const el = document.getElementById(`settings-sec-${focusProvider}`);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }
}

async function _save() {
  const patch = { providers: {}, pet: {} };

  const providers = Object.keys(PROVIDER_FIELDS);
  for (const id of providers) {
    const enabled = document.querySelector(`[data-provider="${id}"][data-field="enabled"]`)?.checked;
    const fields  = PROVIDER_FIELDS[id];
    const provData = { enabled: enabled !== false };

    for (const [key, def] of Object.entries(fields)) {
      const input = document.getElementById(`input-${id}-${key}`);
      if (input && input.value) {
        provData[key] = input.value;
      }
    }
    patch.providers[id] = provData;
  }

  const petEnabled = document.getElementById('pet-enabled')?.checked;
  patch.pet.enabled = petEnabled !== false;

  try {
    await window.api.invoke('set-config', patch);
    await window.api.invoke('force-refresh');
    close();
  } catch (err) {
    console.error('Settings save error', err);
  }
}

async function _testProvider(providerId) {
  const resultEl = document.getElementById(`test-result-${providerId}`);
  if (!resultEl) return;

  resultEl.className = 'test-result';
  resultEl.textContent = 'Testing…';

  const fields = PROVIDER_FIELDS[providerId];
  const creds  = {};
  for (const [key, def] of Object.entries(fields)) {
    const input = document.getElementById(`input-${providerId}-${key}`);
    if (input) creds[key] = input.value;
  }

  try {
    const ok = await window.api.invoke('validate-credentials', {
      providerId,
      creds,
    });
    resultEl.className = `test-result ${ok ? 'ok' : 'error'}`;
    resultEl.textContent = ok ? '✓ Connected!' : '✗ Connection failed';
  } catch (err) {
    resultEl.className = 'test-result error';
    resultEl.textContent = '✗ ' + err.message;
  }
}

async function _autoDetectClaude() {
  const resultEl = document.getElementById('test-result-claude');
  if (resultEl) { resultEl.className = 'test-result'; resultEl.textContent = 'Detecting…'; }

  try {
    const ok = await window.api.invoke('validate-credentials', {
      providerId: 'claude',
      creds: {},
    });
    if (resultEl) {
      resultEl.className = `test-result ${ok ? 'ok' : 'error'}`;
      resultEl.textContent = ok ? '✓ Credentials found automatically!' : '✗ Could not auto-detect';
    }
  } catch (err) {
    if (resultEl) {
      resultEl.className = 'test-result error';
      resultEl.textContent = '✗ ' + err.message;
    }
  }
}

window.Settings = { open, close };
