const { ipcRenderer } = require('electron');

window.electronAPI = {
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },
};
