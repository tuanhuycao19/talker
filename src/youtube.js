// Link YouTube -> file video/âm thanh có CORS để phân tích giọng.
//
// YouTube không cho trình duyệt tải trực tiếp, nên thử lần lượt các máy chủ mã nguồn mở
// Piped và Invidious (chúng proxy luồng video kèm header CORS). Các máy chủ công cộng này
// hay thay đổi; có thể chỉ định máy chủ riêng bằng ?ytapi=<địa chỉ API Piped> hoặc VITE_YT_API.

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.r4fo.com',
];
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.privacyredirect.com',
];

export function parseYouTubeId(text) {
  let u;
  try {
    u = new URL(text.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v');
    const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
    if (!id && m) id = m[2];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

function customApi() {
  try {
    const q = new URLSearchParams(location.search).get('ytapi');
    if (q) localStorage.setItem('talker.ytApi', q);
    return q || localStorage.getItem('talker.ytApi') || import.meta.env.VITE_YT_API || '';
  } catch {
    return import.meta.env.VITE_YT_API || '';
  }
}

async function getJson(url, ms = 9000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const height = (q) => parseInt(String(q || '').replace(/\D/g, ''), 10) || 0;

async function fromPiped(api, id) {
  const j = await getJson(`${api.replace(/\/+$/, '')}/streams/${id}`);
  if (j.error) throw new Error(j.error);
  // video có sẵn tiếng (muxed), ưu tiên chất lượng thấp-vừa cho nhẹ
  const muxed = (j.videoStreams || [])
    .filter((s) => !s.videoOnly && /mp4/.test(s.mimeType || s.format || ''))
    .sort((a, b) => height(a.quality) - height(b.quality));
  const audio = (j.audioStreams || [])
    .filter((s) => /mp4|m4a/.test(s.mimeType || s.format || ''))
    .sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
  return {
    title: j.title || '',
    author: j.uploader || '',
    video: muxed.find((s) => height(s.quality) >= 360)?.url || muxed[0]?.url || null,
    audio: audio[0]?.url || null,
  };
}

async function fromInvidious(inst, id) {
  const base = inst.replace(/\/+$/, '');
  const j = await getJson(`${base}/api/v1/videos/${id}?local=true&fields=title,author,formatStreams,adaptiveFormats`);
  const abs = (u) => (u && !u.startsWith('http') ? `${base}${u}` : u);
  const muxed = (j.formatStreams || []).filter((s) => /mp4/.test(s.type || s.container || ''));
  const audio = (j.adaptiveFormats || [])
    .filter((s) => /^audio\/mp4/.test(s.type || ''))
    .sort((a, b) => Number(a.bitrate || 0) - Number(b.bitrate || 0));
  return {
    title: j.title || '',
    author: j.author || '',
    video: abs(muxed[0]?.url) || null,
    audio: abs(audio[0]?.url) || null,
  };
}

// Trả về { title, author, video, audio, thumbnail } – video/audio có thể null nếu mọi máy chủ đều lỗi.
export async function resolveYouTube(id, onTry) {
  const custom = customApi();
  const tries = [
    ...(custom ? [['Piped', custom, fromPiped]] : []),
    ...PIPED.map((a) => ['Piped', a, fromPiped]),
    ...INVIDIOUS.map((a) => ['Invidious', a, fromInvidious]),
  ];
  const errors = [];
  for (const [kind, base, fn] of tries) {
    onTry?.(kind, new URL(base).hostname);
    try {
      const r = await fn(base, id);
      if (r.video || r.audio) return { ...r, thumbnail: thumbnailUrl(id), source: new URL(base).hostname };
      errors.push(`${base}: không có luồng phù hợp`);
    } catch (err) {
      errors.push(`${base}: ${err.message}`);
    }
  }
  console.warn('YouTube: mọi máy chủ đều lỗi', errors);
  return { title: '', author: '', video: null, audio: null, thumbnail: thumbnailUrl(id), source: null };
}

export const thumbnailUrl = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export async function fetchBlob(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) return res.blob();
  const reader = res.body.getReader();
  const parts = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  return new Blob(parts, { type: res.headers.get('content-type') || 'video/mp4' });
}

// ---------- Trình phát YouTube chính thức (làm nền khi không tải được file) ----------

let apiPromise = null;
function loadIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => reject(new Error('không tải được trình phát YouTube'));
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

export async function createYouTubePlayer(host, id) {
  const YT = await loadIframeApi();
  host.innerHTML = '<div></div>';
  return new Promise((resolve) => {
    const player = new YT.Player(host.firstChild, {
      videoId: id,
      playerVars: {
        autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: id,
        playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1, iv_load_policy: 3,
      },
      events: { onReady: () => resolve(player) },
    });
  });
}
