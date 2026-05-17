'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_CHANNELS = [
  'get-all-usage',
  'get-tasks',
  'get-config',
  'set-config',
  'validate-credentials',
  'toggle-pet',
  'pet-drag',
  'force-refresh',
  'get-history',
  'usage-update',
  'task-update',
  'pet-state',
  'show-pet-menu',
];

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => {
    if (!ALLOWED_CHANNELS.includes(channel)) {
      throw new Error(`Blocked IPC channel: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, callback) => {
    if (!ALLOWED_CHANNELS.includes(channel)) return;
    const wrapped = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, wrapped);
    return wrapped;
  },
  off: (channel, wrapped) => {
    if (!ALLOWED_CHANNELS.includes(channel)) return;
    ipcRenderer.removeListener(channel, wrapped);
  },
  send: (channel, ...args) => {
    if (!ALLOWED_CHANNELS.includes(channel)) return;
    ipcRenderer.send(channel, ...args);
  },
});
