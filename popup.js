// popup.js - swallow lastError and call background
async function withActiveTab(fn) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await fn(tab);
}

document.getElementById('btn-visible').addEventListener('click', () => {
  withActiveTab(async (tab) => {
    // 给当前页发个 ping（可有可无），并吞掉 lastError
    chrome.tabs.sendMessage(tab.id, { ping: true }, async () => {
      void chrome.runtime.lastError; // 读取以消除 Unchecked runtime.lastError
      await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE' });
      window.close();
    });
  });
});

document.getElementById('btn-select').addEventListener('click', () => {
  withActiveTab(async (tab) => {
    chrome.tabs.sendMessage(tab.id, { ping: true }, async () => {
      void chrome.runtime.lastError;
      await chrome.runtime.sendMessage({ type: 'START_SELECTION' });
      window.close();
    });
  });
});

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
