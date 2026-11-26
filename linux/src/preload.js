// The web scene talks to its host through `window.webkit.messageHandlers.<name>.postMessage`,
// the WKWebView bridge the mac build uses. Recreate that shape on top of Electron IPC so web/
// stays untouched, as win/src/main.rs does on top of Tauri's.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const handler = channel => ({ postMessage: message => ipcRenderer.send('host-message', channel, message) });

contextBridge.exposeInMainWorld('webkit', {
  messageHandlers: { cat: handler('cat'), settings: handler('settings'), stats: handler('stats') },
});
