const endpoint = document.getElementById('endpoint');
const secretKey = document.getElementById('secretKey');
const useMultipart = document.getElementById('useMultipart');
const saved = document.getElementById('saved');

(async function init() {
  const conf = await chrome.storage.sync.get({
    endpoint: 'http://127.0.0.1:36677/upload',
    useMultipart: true,
    secretKey: ''
  });
  endpoint.value = conf.endpoint;
  secretKey.value = conf.secretKey || '';
  useMultipart.checked = !!conf.useMultipart;
})();

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    endpoint: endpoint.value.trim(),
    secretKey: secretKey.value.trim(),
    useMultipart: useMultipart.checked
  });
  saved.textContent = '已保存';
  setTimeout(() => (saved.textContent = ''), 1500);
});
