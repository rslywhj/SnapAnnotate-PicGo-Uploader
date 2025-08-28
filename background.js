// background.js - MV3 Service Worker (fixed)
const TEMP_STORE_KEY = 'SNAP_ANNOTATE_LATEST';

// 16x16 占位图标（通知用）
const ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAALElEQVQoka3QsQkAMAwDwVv//5mIglrGQ2oNQmCk9Q5m2r0nyxwqz3w0y2j1d3kqQkO7v2Bq5d6Y7gAAAABJRU5ErkJggg==';

async function openAnnotator(data) {
  await chrome.storage.session.set({ [TEMP_STORE_KEY]: data });
  await chrome.tabs.create({ url: chrome.runtime.getURL('annotator.html') });
}

// 兜底获取当前激活的标签
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // 1) 可视区域截图（来自 popup）
    if (msg?.type === 'CAPTURE_VISIBLE') {
      const tab = await getActiveTab();
      const winId = tab?.windowId; // 可能为 undefined，API 会取当前窗口
      const imageUri = await chrome.tabs.captureVisibleTab(winId, { format: 'png' });
      await openAnnotator({ imageUri });
      sendResponse({ ok: true });
      return;
    }

    // 2) 开始选择区域（来自 popup）
    if (msg?.type === 'START_SELECTION') {
      const tab = await getActiveTab();
      if (!tab?.id) {
        sendResponse({ ok: false, error: 'No active tab' });
        return;
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['contentScript.js']
      });
      sendResponse({ ok: true });
      return;
    }

    // 3) 选择完成（来自 contentScript，有 sender.tab）
    if (msg?.type === 'SELECTION_DONE') {
      const { viewportRect, dpr } = msg.payload || {};
      const tab = sender?.tab || (await getActiveTab());
      const winId = tab?.windowId;
      const imageUri = await chrome.tabs.captureVisibleTab(winId, { format: 'png' });
      await openAnnotator({ imageUri, viewportRect, dpr });
      sendResponse({ ok: true });
      return;
    }

    // 4) 标注页取最近一次截图数据
    if (msg?.type === 'FETCH_LATEST_CAPTURE') {
      const data = (await chrome.storage.session.get(TEMP_STORE_KEY))[TEMP_STORE_KEY];
      sendResponse({ data });
      await chrome.storage.session.remove(TEMP_STORE_KEY);
      return;
    }

    // 5) 通知并关闭（上传成功后）
    if (msg?.type === 'NOTIFY_AND_CLOSE') {
      const url = msg.url || '';
      await chrome.notifications.create({
        type: 'basic',
        title: '上传成功',
        message: url,
        iconUrl: ICON_DATA_URL,
        priority: 2
      });
      if (sender?.tab?.id) {
        try { await chrome.tabs.remove(sender.tab.id); } catch (_) {}
      }
      sendResponse({ ok: true });
      return;
    }
  })();

  return true; // 异步响应
});
