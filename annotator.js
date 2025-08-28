// annotator.js
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const $ = s => document.querySelector(s);
const toolSel = $('#tool');
const colorSel = $('#stroke');
const widthSel = $('#width');
const undoBtn = $('#undo');
const redoBtn = $('#redo');
const saveBtn = $('#saveUpload');
const statusSpan = $('#status');

let bgImage = new Image();
let drawing = false;
let startX = 0, startY = 0;
let ops = [];       // 绘制操作栈
let redoStack = []; // 重做
let textInput = null;

// 拉取截图数据
(async function init() {
  const { data } = await chrome.runtime.sendMessage({ type: 'FETCH_LATEST_CAPTURE' });
  if (!data?.imageUri) {
    status('未获取到截图数据');
    return;
  }
  bgImage.onload = () => {
    // 如果带选择框，先按 DPR 裁剪
    if (data.viewportRect && data.dpr) {
      cropToSelectionAndSet(bgImage, data.viewportRect, data.dpr);
    } else {
      setCanvasSize(bgImage.width, bgImage.height);
      ctx.drawImage(bgImage, 0, 0);
    }
  };
  bgImage.src = data.imageUri;

  bindEvents();
  status('就绪');
})();

function cropToSelectionAndSet(img, rect, dpr) {
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.round(rect.width * dpr);
  const sh = Math.round(rect.height * dpr);
  const tmp = document.createElement('canvas');
  tmp.width = sw; tmp.height = sh;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const cropped = new Image();
  cropped.onload = () => {
    setCanvasSize(sw, sh);
    ctx.drawImage(cropped, 0, 0);
    bgImage = cropped;
  };
  cropped.src = tmp.toDataURL('image/png');
}

function setCanvasSize(w, h) {
  const scale = Math.min((window.innerWidth - 40) / w, (window.innerHeight - 100) / h, 1);
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  canvas.style.width = Math.round(w * scale) + 'px';
  canvas.style.height = Math.round(h * scale) + 'px';
}

function bindEvents() {
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onUp);
  canvas.addEventListener('mouseleave', onUp);
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  saveBtn.addEventListener('click', saveAndUpload);
}

function status(t) { statusSpan.textContent = t || ''; }

function getStyle() {
  return { color: colorSel.value, width: parseInt(widthSel.value, 10) || 2 };
}

function onDown(e) {
  const { x, y } = fromEvent(e);
  if (toolSel.value === 'text') {
    showTextInput(x, y);
    return;
  }
  drawing = true; startX = x; startY = y;
}

function onMove(e) {
  if (!drawing) return;
  redraw(); // 背景+历史
  const { x, y } = fromEvent(e);
  previewShape(toolSel.value, startX, startY, x, y, getStyle());
}

function onUp(e) {
  if (!drawing) return;
  drawing = false;
  const { x, y } = fromEvent(e);
  commitShape(toolSel.value, startX, startY, x, y, getStyle());
  redoStack = []; // 清空重做栈
}

function fromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bgImage, 0, 0);
  for (const op of ops) drawOp(op);
}

function previewShape(type, x1, y1, x2, y2, style) {
  drawShape(type, x1, y1, x2, y2, style, true);
}
function commitShape(type, x1, y1, x2, y2, style) {
  const op = { type, x1, y1, x2, y2, style, text: null };
  ops.push(op);
  redraw();
}

function showTextInput(x, y) {
  if (textInput) { textInput.remove(); textInput = null; }
  textInput = document.createElement('input');
  Object.assign(textInput.style, {
    position: 'fixed', left: '20px', top: '70px', zIndex: 10, padding: '6px 8px',
    border: '1px solid #ddd', borderRadius: '8px', width: '260px'
  });
  textInput.placeholder = '输入文本后回车';
  document.body.appendChild(textInput);
  textInput.focus();
  textInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = x, cy = y;
      const style = getStyle();
      const op = { type: 'text', x1: cx, y1: cy, x2: cx, y2: cy, style, text: textInput.value };
      ops.push(op);
      textInput.remove(); textInput = null;
      redraw();
    } else if (ev.key === 'Escape') {
      textInput.remove(); textInput = null;
    }
  });
}

function drawOp(op) {
  if (op.type === 'text') {
    drawText(op.text, op.x1, op.y1, op.style);
  } else {
    drawShape(op.type, op.x1, op.y1, op.x2, op.y2, op.style, false);
  }
}

function drawText(text, x, y, style) {
  ctx.save();
  ctx.fillStyle = style.color;
  ctx.font = `${Math.max(14, 12 + style.width * 2)}px ui-sans-serif, system-ui`;
  ctx.textBaseline = 'top';
  wrapText(text, x, y, Math.min(canvas.width - x - 10, 480));
  ctx.restore();
}

function wrapText(text, x, y, maxW) {
  const words = text.split('');
  let line = '', yy = y;
  for (const ch of words) {
    const w = ctx.measureText(line + ch).width;
    if (w > maxW) {
      ctx.fillText(line, x, yy); yy += 20;
      line = ch;
    } else line += ch;
  }
  if (line) ctx.fillText(line, x, yy);
}

function drawShape(type, x1, y1, x2, y2, style, dashed) {
  ctx.save();
  ctx.strokeStyle = style.color; ctx.lineWidth = style.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (dashed) ctx.setLineDash([6, 6]);

  if (type === 'rect') {
    ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
  } else if (type === 'circle') {
    const rx = (x2 - x1) / 2, ry = (y2 - y1) / 2;
    const cx = x1 + rx, cy = y1 + ry;
    ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2); ctx.stroke();
  } else if (type === 'line') {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  } else if (type === 'arrow') {
    drawArrow(x1, y1, x2, y2, style.width);
  }
  ctx.restore();
}

function drawArrow(x1, y1, x2, y2, w) {
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.max(8, 4 * w);
  const a1 = angle - Math.PI / 7;
  const a2 = angle + Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(a1), y2 - len * Math.sin(a1));
  ctx.lineTo(x2 - len * Math.cos(a2), y2 - len * Math.sin(a2));
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function undo() {
  if (!ops.length) return;
  redoStack.push(ops.pop());
  redraw();
}
function redo() {
  if (!redoStack.length) return;
  ops.push(redoStack.pop());
  redraw();
}

async function saveAndUpload() {
  status('导出图片…');
  // 导出 PNG Blob
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 1));
  if (!blob) return status('导出失败');

  // 读设置
  const { endpoint, useMultipart, secretKey } = await chrome.storage.sync.get({
    endpoint: 'http://127.0.0.1:36677/upload',
    useMultipart: true,  // 先尝试 multipart（PicList）
    secretKey: ''        // PicList 支持 ?key=
  });

  // 拼 URL
  const url = new URL(endpoint);
  if (secretKey) url.searchParams.set('key', secretKey);

  // 1) multipart/form-data（PicList 支持）
  if (useMultipart) {
    try {
      const fd = new FormData();
      fd.append('image', blob, `snap-${Date.now()}.png`);
      status('上传中（multipart）…');
      const r = await fetch(url.toString(), { method: 'POST', body: fd });
      const j = await r.json();
      if (j?.success && Array.isArray(j.result)) {
        status('上传成功'); showResult(j.result);
        return;
      }
      throw new Error('multipart 返回非 success');
    } catch (e) {
      console.warn('multipart 失败，回退到剪贴板模式', e);
    }
  }

  // 2) 退化方案：把图片写入剪贴板 -> POST {} 让 PicGo 读取剪贴板上传
  try {
    status('写入剪贴板…');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    status('上传中（clipboard）…');
    const r = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}' // PicGo: 空 JSON 触发“上传剪贴板图片”
    });
    const j = await r.json();
    if (j?.success && Array.isArray(j.result)) {
      status('上传成功'); showResult(j.result);
      return;
    }
    throw new Error('clipboard 返回非 success');
  } catch (e) {
    status('上传失败：' + e.message);
  }
}

function showResult(urls) {
  const link = urls[0];
  if (!link) {
    status('上传成功，但未返回 URL');
    return;
  }
  // 也保留复制 URL 的便捷体验
  navigator.clipboard.writeText(link).catch(()=>{});
  // 通知后台：弹系统通知 & 关闭当前标注标签页
  chrome.runtime.sendMessage({ type: 'NOTIFY_AND_CLOSE', url: link });
}
