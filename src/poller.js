'use strict';

const { EventEmitter } = require('events');
const { addSnapshot } = require('./store');

const providers = [
  require('./providers/claude'),
  require('./providers/openai'),
  require('./providers/deepseek'),
  require('./providers/ollama'),
  require('./providers/lmstudio'),
];

// Per-provider backoff state
const backoff = {};
providers.forEach(p => {
  backoff[p.id] = { failures: 0, nextAllowedAt: 0 };
});

const BACKOFF_INTERVALS = [0, 10000, 30000, 60000, 120000, 300000]; // ms

class Poller extends EventEmitter {
  constructor() {
    super();
    this._state = {};
    this._enabled = {};
    this._timer = null;
    providers.forEach(p => {
      this._state[p.id] = null;
      this._enabled[p.id] = true;
    });
  }

  setEnabled(providerId, enabled) {
    this._enabled[providerId] = enabled;
  }

  getState() {
    return Object.assign({}, this._state);
  }

  start(intervalMs = 30000) {
    this._poll();
    this._timer = setInterval(() => this._poll(), intervalMs);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  async forceRefresh() {
    // Reset all backoffs
    Object.keys(backoff).forEach(id => {
      backoff[id].failures = 0;
      backoff[id].nextAllowedAt = 0;
    });
    return this._poll();
  }

  async _poll() {
    const now = Date.now();
    const enabled = providers.filter(p => this._enabled[p.id]);

    const results = await Promise.allSettled(
      enabled.map(async p => {
        const b = backoff[p.id];
        if (now < b.nextAllowedAt) return { id: p.id, usage: this._state[p.id] }; // skip, still cooling

        try {
          const usage = await p.fetchUsage();
          b.failures = 0;
          b.nextAllowedAt = 0;
          return { id: p.id, usage };
        } catch (err) {
          b.failures = Math.min(b.failures + 1, BACKOFF_INTERVALS.length - 1);
          b.nextAllowedAt = now + BACKOFF_INTERVALS[b.failures];
          return { id: p.id, usage: { provider: p.id, connected: false, error: err.message } };
        }
      })
    );

    const snapshot = { ts: now, providers: {} };

    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        const { id, usage } = r.value;
        if (id && usage) {
          this._state[id] = usage;
          snapshot.providers[id] = {
            pct: usage.session?.pct || 0,
            cost: usage.cost?.session || 0,
          };
        }
      }
    });

    addSnapshot(snapshot);
    this.emit('usage-update', this._state);

    // Determine overall pet state based on aggregated activity
    const petState = this._computePetState(this._state);
    this.emit('pet-state', petState);
  }

  _computePetState(state) {
    const connected = Object.values(state).filter(s => s && s.connected);
    if (connected.length === 0) return { state: 'offline', provider: null };

    // Find most active provider by session pct
    let maxPct = 0;
    let mostActive = null;
    connected.forEach(s => {
      const pct = s.session?.pct || 0;
      if (pct > maxPct) { maxPct = pct; mostActive = s.provider; }
    });

    const now = Date.now();
    const recentActivity = connected.some(s => {
      return s.lastFetched && (now - s.lastFetched) < 35000 && s.session?.pct > 0;
    });

    if (!recentActivity) return { state: 'sleeping', provider: mostActive };
    if (maxPct >= 75)    return { state: 'excited',  provider: mostActive };
    if (maxPct >= 10)    return { state: 'thinking', provider: mostActive };
    return { state: 'idle', provider: mostActive };
  }
}

module.exports = new Poller();
