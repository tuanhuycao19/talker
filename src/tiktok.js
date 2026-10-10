// Lấy video TikTok từ link chia sẻ (vt.tiktok.com/..., www.tiktok.com/@user/video/...).
//
// Trình duyệt không thể tự đọc link TikTok (bị chặn CORS), nên dùng API công khai tikwm.com
// để lấy link file video. Nếu trình duyệt vẫn bị chặn khi tải file, app sẽ đi qua proxy
// (Cloudflare Worker trong thư mục proxy/) nếu đã cấu hình.

const API = 'https://www.tikwm.com/api/';
const API_ORIGIN = 'https://www.tikwm.com';

export function isTikTokUrl(text) {
  try {
    const u = new URL(text.trim());
    return /(^|\.)tiktok\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

// Proxy: biến môi trường lúc build, hoặc ?proxy=... trên URL (lưu lại cho lần sau).
export function getProxy() {
  try {
    const fromQuery = new URLSearchParams(location.search).get('proxy');
    if (fromQuery) localStorage.setItem('talker.tiktokProxy', fromQuery);
    return fromQuery || localStorage.getItem('talker.tiktokProxy') || import.meta.env.VITE_TIKTOK_PROXY || '';
  } catch {
    return import.meta.env.VITE_TIKTOK_PROXY || '';
  }
}

const viaProxy = (proxy, url) => `${proxy.replace(/\/+$/, '')}/?url=${encodeURIComponent(url)}`;

// Thử tải trực tiếp, nếu lỗi mạng/CORS thì thử qua proxy.
async function fetchWithFallback(url, proxy, init) {
  try {
    const res = await fetch(url, init);
    if (res.ok) return res;
    if (!proxy) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (!proxy) throw err;
  }
  const res = await fetch(viaProxy(proxy, url), init);
  if (!res.ok) throw new Error(`Proxy trả về HTTP ${res.status}`);
  return res;
}

const absolute = (u) => (!u ? '' : u.startsWith('http') ? u : `${API_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`);

export async function resolveTikTok(link) {
  const proxy = getProxy();
  const api = `${API}?url=${encodeURIComponent(link.trim())}&hd=0`;
  let json;
  try {
    const res = await fetchWithFallback(api, proxy);
    json = await res.json();
  } catch (err) {
    throw new Error(`không kết nối được dịch vụ lấy video TikTok (${err.message})`);
  }
  if (json?.code !== 0 || !json.data) {
    throw new Error(json?.msg ? `TikTok: ${json.msg}` : 'không tìm thấy video từ link này');
  }
  const d = json.data;
  if (!d.play) throw new Error('link này không phải video (có thể là bài ảnh)');
  return {
    id: d.id,
    title: d.title || '',
    author: d.author?.nickname || d.author?.unique_id || '',
    cover: absolute(d.origin_cover || d.cover),
    video: absolute(d.play),
    duration: d.duration || 0,
  };
}

// Tải file video về dạng Blob để vừa làm nền vừa phân tích âm thanh.
export async function fetchTikTokVideo(info, onProgress) {
  const res = await fetchWithFallback(info.video, getProxy());
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !onProgress) return res.blob();
  const reader = res.body.getReader();
  const parts = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  return new Blob(parts, { type: res.headers.get('content-type') || 'video/mp4' });
}
