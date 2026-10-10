// Cloudflare Worker: proxy nhỏ cho phép trang Talker tải video TikTok (thêm header CORS).
//
// Cách dùng: GET https://<worker>.workers.dev/?url=<link cần tải>
// Chỉ cho phép các tên miền của TikTok và tikwm.com để không bị lạm dụng làm proxy mở.

const ALLOWED_HOSTS = [
  'tikwm.com',
  'tiktok.com',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktokv.com',
  'tiktokv.us',
  'byteoversea.com',
  'ibytedtos.com',
  'ibyteimg.com',
  'muscdn.com',
];

// Giới hạn trang nào được gọi proxy. Để trống [] nếu muốn cho phép mọi trang.
const ALLOWED_ORIGINS = [
  'https://tuanhuycao19.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function corsHeaders(origin) {
  const allow = !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin) ? origin || '*' : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type',
    Vary: 'Origin',
  };
}

const hostAllowed = (host) => ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Origin not allowed', { status: 403, headers: cors });
    }

    const target = new URL(request.url).searchParams.get('url');
    let url;
    try {
      url = new URL(target);
    } catch {
      return new Response('Missing or invalid ?url=', { status: 400, headers: cors });
    }
    if (url.protocol !== 'https:' || !hostAllowed(url.hostname)) {
      return new Response('Host not allowed', { status: 403, headers: cors });
    }

    const headers = { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' };
    const range = request.headers.get('Range');
    if (range) headers.Range = range;
    const upstream = await fetch(url.toString(), { headers, redirect: 'follow' });

    const out = new Headers(upstream.headers);
    out.delete('set-cookie');
    for (const [k, v] of Object.entries(cors)) out.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
