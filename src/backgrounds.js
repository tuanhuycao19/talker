// Ảnh nền dựng sẵn (SVG nội tuyến) + ảnh người dùng tải lên + màu trơn.

const svg = (body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;

const toUrl = (s) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}")`;

function acacia(x, y, s, color) {
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="${color}">
    <path d="M-6 0 L-3 -120 Q-40 -150 -70 -160 L-60 -166 Q-20 -150 -1 -135 Q10 -170 45 -185 L50 -178 Q20 -160 6 -125 L6 0Z"/>
    <ellipse cx="-80" cy="-178" rx="95" ry="22"/><ellipse cx="40" cy="-196" rx="110" ry="24"/><ellipse cx="-10" cy="-205" rx="70" ry="18"/>
  </g>`;
}

function cloud(x, y, s, op = 0.9) {
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff" opacity="${op}">
    <ellipse cx="0" cy="0" rx="90" ry="38"/><ellipse cx="60" cy="-22" rx="60" ry="44"/><ellipse cx="-55" cy="-12" rx="50" ry="32"/><ellipse cx="120" cy="2" rx="55" ry="28"/>
  </g>`;
}

function stars(count, seed) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let out = '';
  for (let i = 0; i < count; i++) {
    out += `<circle cx="${(r() * 1600).toFixed(0)}" cy="${(r() * 680).toFixed(0)}" r="${(0.8 + r() * 2.2).toFixed(1)}" fill="#fff" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
  }
  return out;
}

export const PRESETS = [
  {
    id: 'studio',
    name: 'Studio',
    css: toUrl(svg(
      `<rect width="1600" height="1000" fill="url(#g)"/><ellipse cx="800" cy="860" rx="700" ry="120" fill="url(#f)"/>`,
      `<radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#eef0f3"/><stop offset="1" stop-color="#c9ced6"/></radialGradient>
       <radialGradient id="f" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#dfe3e8"/><stop offset="1" stop-color="#dfe3e8" stop-opacity="0"/></radialGradient>`,
    )),
  },
  {
    id: 'savanna',
    name: 'Thảo nguyên',
    css: toUrl(svg(
      `<rect width="1600" height="1000" fill="url(#sky)"/>
       <circle cx="1150" cy="430" r="120" fill="#ffe9a8" opacity="0.95"/>
       <path d="M0 640 Q300 590 600 630 T1200 615 T1600 625 V1000 H0Z" fill="#e9a65a"/>
       ${acacia(260, 650, 1.1, '#6b4a2b')}${acacia(1380, 640, 0.8, '#7a5634')}${acacia(980, 628, 0.45, '#8c6640')}
       <path d="M0 700 Q400 660 800 700 T1600 690 V1000 H0Z" fill="#d79a4f"/>
       <path d="M0 790 Q500 750 1000 790 T1600 780 V1000 H0Z" fill="#c78a45"/>`,
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset="0.55" stop-color="#ffd59a"/><stop offset="0.7" stop-color="#ffe7bf"/></linearGradient>`,
    )),
  },
  {
    id: 'sky',
    name: 'Bầu trời',
    css: toUrl(svg(
      `<rect width="1600" height="1000" fill="url(#sky)"/>
       ${cloud(250, 200, 1.2)}${cloud(1250, 150, 1)}${cloud(800, 320, 0.7, 0.8)}${cloud(1450, 420, 0.6, 0.75)}
       <path d="M0 680 Q350 610 700 670 T1600 650 V1000 H0Z" fill="#9fd78a"/>
       <path d="M0 740 Q500 690 1000 740 T1600 730 V1000 H0Z" fill="#7cc46b"/>`,
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fb4ff"/><stop offset="0.7" stop-color="#bfe4ff"/></linearGradient>`,
    )),
  },
  {
    id: 'jungle',
    name: 'Rừng xanh',
    css: toUrl(svg(
      `<rect width="1600" height="1000" fill="url(#bg)"/>
       <g fill="#2f7d4b" opacity="0.8"><ellipse cx="120" cy="220" rx="260" ry="200"/><ellipse cx="1500" cy="180" rx="300" ry="220"/><ellipse cx="800" cy="-40" rx="520" ry="200"/></g>
       <g fill="#3f9a5a"><ellipse cx="-40" cy="520" rx="260" ry="320"/><ellipse cx="1660" cy="500" rx="280" ry="330"/></g>
       <rect x="300" y="250" width="40" height="500" fill="#6b4a2b"/><rect x="1240" y="220" width="46" height="520" fill="#6b4a2b"/>
       <path d="M0 720 Q400 680 800 720 T1600 710 V1000 H0Z" fill="#5fae5f"/>
       <path d="M0 800 Q500 770 1000 810 T1600 800 V1000 H0Z" fill="#4b9a4f"/>`,
      `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe8c2"/><stop offset="0.7" stop-color="#e6f6d8"/></linearGradient>`,
    )),
  },
  {
    id: 'night',
    name: 'Đêm sao',
    css: toUrl(svg(
      `<rect width="1600" height="1000" fill="url(#bg)"/>${stars(140, 7)}
       <circle cx="1250" cy="230" r="80" fill="#fff6d6"/><circle cx="1285" cy="210" r="72" fill="#1d2a5c"/>
       <path d="M0 700 Q400 650 800 700 T1600 690 V1000 H0Z" fill="#26365f"/>
       <path d="M0 780 Q500 740 1000 780 T1600 770 V1000 H0Z" fill="#1c2a4d"/>`,
      `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1638"/><stop offset="0.7" stop-color="#2c3f7a"/></linearGradient>`,
    )),
  },
  {
    id: 'candy',
    name: 'Kẹo ngọt',
    css: toUrl(svg(
      `<rect width="1600" height="1000" fill="url(#bg)"/>
       <g opacity="0.55"><circle cx="200" cy="200" r="90" fill="#ffd1e8"/><circle cx="1400" cy="260" r="120" fill="#d6ccff"/><circle cx="1100" cy="120" r="50" fill="#c9f2ff"/><circle cx="420" cy="460" r="40" fill="#fff0b3"/></g>
       <path d="M0 760 Q400 720 800 760 T1600 750 V1000 H0Z" fill="#ffe0ef"/>`,
      `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe3f1"/><stop offset="0.5" stop-color="#e9e3ff"/><stop offset="1" stop-color="#d9f4ff"/></linearGradient>`,
    )),
  },
];

const STORAGE_KEY = 'talker.background';

export function loadBackground() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* không có storage – dùng mặc định */
  }
  return { type: 'preset', id: 'studio' };
}

export function saveBackground(bg) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bg));
    return true;
  } catch {
    return false; // ảnh quá lớn hoặc storage bị chặn – vẫn áp dụng cho phiên hiện tại
  }
}

export function backgroundCss(bg) {
  if (bg.type === 'color') return { image: 'none', color: bg.value };
  if (bg.type === 'image') return { image: `url("${bg.dataUrl}")`, color: '#ddd' };
  const preset = PRESETS.find((p) => p.id === bg.id) || PRESETS[0];
  return { image: preset.css, color: '#eee' };
}

// Thu nhỏ ảnh người dùng (tối đa 1920px) để lưu được vào localStorage.
export function readImageFile(file, maxSize = 1920) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được ảnh'));
    };
    img.src = url;
  });
}
