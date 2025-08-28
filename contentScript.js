// contentScript.js
(function () {
  if (window.__snapAnnotateSelecting) return;
  window.__snapAnnotateSelecting = true;

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: 2147483647,
    background: 'rgba(0,0,0,0.1)', cursor: 'crosshair'
  });
  document.body.appendChild(overlay);

  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', border: '2px solid #3b82f6', background: 'rgba(59,130,246,0.15)', pointerEvents: 'none'
  });
  overlay.appendChild(box);

  let startX, startY, moving = false;

  function onDown(e) {
    moving = true;
    startX = e.clientX;
    startY = e.clientY;
    updateBox(startX, startY, 0, 0);
  }
  function onMove(e) {
    if (!moving) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    updateBox(x, y, w, h);
  }
  function onUp(e) {
    moving = false;
    const rect = box.getBoundingClientRect();
    cleanup();
    chrome.runtime.sendMessage({
      type: 'SELECTION_DONE',
      payload: {
        viewportRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        dpr: window.devicePixelRatio || 1
      }
    });
  }
  function updateBox(x, y, w, h) {
    Object.assign(box.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  }
  function onEsc(e) {
    if (e.key === 'Escape') cleanup();
  }
  function cleanup() {
    overlay.removeEventListener('mousedown', onDown);
    overlay.removeEventListener('mousemove', onMove);
    overlay.removeEventListener('mouseup', onUp);
    document.removeEventListener('keydown', onEsc);
    overlay.remove();
    window.__snapAnnotateSelecting = false;
  }

  overlay.addEventListener('mousedown', onDown);
  overlay.addEventListener('mousemove', onMove);
  overlay.addEventListener('mouseup', onUp);
  document.addEventListener('keydown', onEsc);
})();
