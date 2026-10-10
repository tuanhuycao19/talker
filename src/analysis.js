// Phân tích audio giọng nói và sinh các "track" chuyển động cho nhân vật.
//
// Quy trình:
//   1. Đưa audio về mono 16 kHz.
//   2. Tách khung (60 khung/giây): đo năng lượng (RMS), phổ (năng lượng theo dải tần),
//      cao độ (pitch) bằng tự tương quan qua FFT.
//   3. Suy ra các đặc trưng: độ to, hữu thanh/vô thanh, độ "dẹt" của nguyên âm,
//      điểm nhấn âm tiết (onset), các cụm câu (phrase) ngăn cách bởi khoảng lặng.
//   4. Sinh track chuyển động: mở miệng, hình miệng, gật đầu theo nhấn âm,
//      nghiêng/xoay đầu theo câu, tai, chớp mắt, nhún người, vẫy đuôi...

export const FPS = 60;
const SR = 16000;
const WIN = 1024; // 64 ms
const NFFT = 2048;

// ---------- Tiện ích ----------

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = Float64Array.from(arr).sort();
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[idx];
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Làm mượt bất đối xứng (mở nhanh, đóng chậm hơn) – hằng số thời gian theo giây.
function smoothAR(x, attack, release) {
  const out = new Float32Array(x.length);
  const ka = 1 - Math.exp(-1 / (FPS * attack));
  const kr = 1 - Math.exp(-1 / (FPS * release));
  let y = x[0] || 0;
  for (let i = 0; i < x.length; i++) {
    y += (x[i] - y) * (x[i] > y ? ka : kr);
    out[i] = y;
  }
  return out;
}

const smoothT = (x, tau) => smoothAR(x, tau, tau);

// Làm mượt hai chiều (không trễ pha).
function smoothZeroPhase(x, tau) {
  const a = smoothT(x, tau);
  a.reverse();
  const b = smoothT(a, tau);
  return b.reverse();
}

// Lò xo tắt dần được kích bởi các xung vận tốc (cho gật đầu, vẫy tai...).
function springTrack(n, impulses, freq = 3, zeta = 0.45) {
  const out = new Float32Array(n);
  const w = 2 * Math.PI * freq;
  const dt = 1 / FPS;
  let x = 0, v = 0;
  for (let i = 0; i < n; i++) {
    v += (impulses[i] || 0) * w;
    // tích phân bán ẩn, chia nhỏ bước cho ổn định
    for (let s = 0; s < 4; s++) {
      const h = dt / 4;
      v += (-w * w * x - 2 * zeta * w * v) * h;
      x += v * h;
    }
    out[i] = x;
  }
  return out;
}

// Bộ sinh số ngẫu nhiên có seed để kết quả lặp lại được.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ---------- Bước 1: mono 16 kHz ----------

async function toMono16k(audioBuffer) {
  const length = Math.max(1, Math.ceil(audioBuffer.duration * SR));
  const ctx = new OfflineAudioContext(1, length, SR);
  const src = ctx.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(ctx.destination);
  src.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

// ---------- Bước 2: đặc trưng theo khung ----------

function extractFrames(x) {
  const n = Math.max(1, Math.ceil((x.length / SR) * FPS));
  const rms = new Float32Array(n);
  const low = new Float32Array(n);
  const mid = new Float32Array(n);
  const high = new Float32Array(n);
  const pitch = new Float32Array(n); // Hz, 0 nếu vô thanh
  const clarity = new Float32Array(n);

  const hann = new Float32Array(WIN);
  for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1));

  // Tự tương quan của chính cửa sổ, để bù hiệu ứng thu hẹp theo độ trễ.
  const winAc = new Float32Array(WIN);
  for (let lag = 0; lag < WIN; lag++) {
    let s = 0;
    for (let i = 0; i + lag < WIN; i++) s += hann[i] * hann[i + lag];
    winAc[lag] = s;
  }

  const re = new Float64Array(NFFT);
  const im = new Float64Array(NFFT);
  const binHz = SR / NFFT;
  const band = (lo, hi) => [Math.floor(lo / binHz), Math.ceil(hi / binHz)];
  const [l0, l1] = band(150, 900);
  const [m0, m1] = band(900, 2600);
  const [h0, h1] = band(2600, 7000);
  const minLag = Math.floor(SR / 650);
  const maxLag = Math.ceil(SR / 70);

  for (let f = 0; f < n; f++) {
    const center = Math.round((f / FPS) * SR);
    const start = center - WIN / 2;

    // RMS trên 512 mẫu giữa (32 ms) cho độ phân giải thời gian tốt.
    let e = 0, cnt = 0;
    for (let i = center - 256; i < center + 256; i++) {
      if (i >= 0 && i < x.length) { e += x[i] * x[i]; cnt++; }
    }
    rms[f] = Math.sqrt(e / Math.max(1, cnt));

    re.fill(0); im.fill(0);
    let mean = 0;
    for (let i = 0; i < WIN; i++) {
      const k = start + i;
      mean += k >= 0 && k < x.length ? x[k] : 0;
    }
    mean /= WIN;
    for (let i = 0; i < WIN; i++) {
      const k = start + i;
      re[i] = ((k >= 0 && k < x.length ? x[k] : 0) - mean) * hann[i];
    }
    fft(re, im);

    let el = 0, em = 0, eh = 0;
    for (let k = 0; k <= NFFT / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      if (k >= l0 && k < l1) el += p;
      else if (k >= m0 && k < m1) em += p;
      else if (k >= h0 && k < h1) eh += p;
      re[k] = p; im[k] = 0;
      if (k > 0 && k < NFFT / 2) { re[NFFT - k] = p; im[NFFT - k] = 0; }
    }
    low[f] = el; mid[f] = em; high[f] = eh;

    // IFFT của phổ công suất = tự tương quan (dùng FFT xuôi vì phổ thực, đối xứng).
    fft(re, im);
    const r0 = re[0];
    if (r0 <= 1e-9) continue;
    let best = 0, bestLag = 0;
    const nr = (lag) => (re[lag] / r0) * (winAc[0] / winAc[lag]);
    for (let lag = minLag; lag <= maxLag; lag++) {
      const v = nr(lag);
      if (v > best && v >= nr(lag - 1) && v >= nr(lag + 1)) { best = v; bestLag = lag; }
    }
    clarity[f] = best;
    if (bestLag && best > 0.5) {
      // nội suy parabol quanh đỉnh
      const a = nr(bestLag - 1), b = nr(bestLag), c = nr(bestLag + 1);
      const d = a - 2 * b + c;
      const off = d !== 0 ? (0.5 * (a - c)) / d : 0;
      pitch[f] = SR / (bestLag + clamp(off, -0.5, 0.5));
    }
  }
  return { n, rms, low, mid, high, pitch, clarity };
}

// ---------- Bước 3 + 4: đặc trưng giọng nói -> chuyển động ----------

export async function analyzeAudio(audioBuffer) {
  const x = await toMono16k(audioBuffer);
  const fr = extractFrames(x);
  const { n } = fr;
  const duration = x.length / SR;

  // Độ to chuẩn hóa theo nền nhiễu và đỉnh của chính bản ghi.
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) db[i] = 20 * Math.log10(fr.rms[i] + 1e-7);
  const floor = percentile(db, 12);
  const peak = percentile(db, 98);
  const gate = floor + Math.max(4, (peak - floor) * 0.18);
  const range = Math.max(12, peak - gate);
  const loud = new Float32Array(n);
  for (let i = 0; i < n; i++) loud[i] = clamp((db[i] - gate) / range, 0, 1);

  // Hữu thanh (có cao độ) và độ "xì" (âm s, x, ch...).
  const voiced = new Uint8Array(n);
  const fric = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    voiced[i] = fr.pitch[i] > 0 && loud[i] > 0.05 ? 1 : 0;
    const tot = fr.low[i] + fr.mid[i] + fr.high[i] + 1e-12;
    fric[i] = fr.high[i] / tot;
  }

  // Hoạt động nói (có khoảng ngân ~150ms) và phân cụm câu.
  const active = new Uint8Array(n);
  const hang = Math.round(0.15 * FPS);
  for (let i = 0, last = -1e9; i < n; i++) {
    if (loud[i] > 0.08) last = i;
    active[i] = i - last <= hang ? 1 : 0;
  }
  const phrases = [];
  {
    let s = -1;
    for (let i = 0; i <= n; i++) {
      const a = i < n && active[i];
      if (a && s < 0) s = i;
      if (!a && s >= 0) {
        const prev = phrases[phrases.length - 1];
        if (prev && s - prev.end < 0.3 * FPS) prev.end = i;
        else phrases.push({ start: s, end: i });
        s = -1;
      }
    }
  }
  const realPhrases = phrases.filter((p) => p.end - p.start >= 0.12 * FPS);

  // ---- Miệng ----
  // Độ mở hàm theo độ to; âm vô thanh/xì mở ít hơn; hình dạng theo tỉ lệ dải giữa/thấp.
  const jawRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let j = Math.pow(loud[i], 0.75);
    if (!voiced[i]) j *= 0.55;
    j *= 1 - clamp((fric[i] - 0.35) * 1.6, 0, 0.6);
    jawRaw[i] = j;
  }
  // Mở nhanh (25ms), khép chậm hơn (70ms); hình ảnh đi trước âm thanh ~2 khung cho tự nhiên.
  let jaw = smoothAR(jawRaw, 0.025, 0.07);
  jaw = shift(jaw, -2);
  // Tăng tương phản để thấy rõ từng âm tiết.
  const jawPeak = Math.max(0.2, percentile(jaw, 97));
  for (let i = 0; i < n; i++) jaw[i] = clamp(jaw[i] / jawPeak, 0, 1);

  const wideRaw = new Float32Array(n);
  const ratios = [];
  for (let i = 0; i < n; i++) {
    if (voiced[i]) ratios.push(Math.log((fr.mid[i] + 1e-12) / (fr.low[i] + 1e-12)));
  }
  const rMed = percentile(ratios, 50);
  const rSpread = Math.max(0.5, (percentile(ratios, 90) - percentile(ratios, 10)) / 2);
  for (let i = 0; i < n; i++) {
    if (!voiced[i]) { wideRaw[i] = 0; continue; }
    const r = Math.log((fr.mid[i] + 1e-12) / (fr.low[i] + 1e-12));
    wideRaw[i] = clamp((r - rMed) / rSpread, -1, 1) * Math.min(1, loud[i] * 3);
  }
  const wide = shift(smoothT(wideRaw, 0.06), -2);

  // ---- Cao độ tương đối (nửa cung so với trung vị của người nói) ----
  const voicedPitches = [];
  for (let i = 0; i < n; i++) if (voiced[i]) voicedPitches.push(fr.pitch[i]);
  const f0Med = percentile(voicedPitches, 50) || 180;
  const stRaw = new Float32Array(n);
  {
    let hold = 0;
    for (let i = 0; i < n; i++) {
      if (voiced[i]) hold = clamp(12 * Math.log2(fr.pitch[i] / f0Med), -7, 7);
      else hold *= 0.96;
      stRaw[i] = hold;
    }
  }
  const pitchRel = smoothZeroPhase(stRaw, 0.08);
  for (let i = 0; i < n; i++) pitchRel[i] = clamp(pitchRel[i] / 5, -1, 1);

  // ---- Nhấn âm tiết (onset) ----
  const env = smoothT(loud, 0.02);
  const flux = new Float32Array(n);
  for (let i = 3; i < n; i++) flux[i] = Math.max(0, env[i] - env[i - 3]);
  const onsets = [];
  const minGap = Math.round(0.14 * FPS);
  for (let i = 1; i < n - 1; i++) {
    if (flux[i] > 0.09 && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1]) {
      const last = onsets[onsets.length - 1];
      if (last && i - last.i < minGap) {
        if (flux[i] > last.s) { last.i = i; last.s = flux[i]; }
      } else onsets.push({ i, s: flux[i] });
    }
  }
  const maxS = Math.max(0.1, ...onsets.map((o) => o.s));
  for (const o of onsets) o.s = clamp(o.s / maxS, 0, 1);

  const rand = rng(Math.round(duration * 1000) + n * 7 + onsets.length * 131);

  // ---- Đầu: gật theo nhấn âm, ngẩng theo cao độ, xoay/nghiêng theo câu ----
  const nodImp = new Float32Array(n);
  const bounceImp = new Float32Array(n);
  const earImpL = new Float32Array(n);
  const earImpR = new Float32Array(n);
  const eyeImp = new Float32Array(n);
  let flip = 1;
  for (const o of onsets) {
    // âm nhấn mạnh -> gật rõ; âm cao -> hất đầu lên thay vì gật xuống
    const up = pitchRel[o.i] > 0.35 ? -0.6 : 1;
    nodImp[o.i] += 0.07 * o.s * up;
    bounceImp[o.i] += 0.03 * o.s;
    if (o.s > 0.55) {
      flip = -flip;
      (flip > 0 ? earImpL : earImpR)[o.i] += 0.5 * o.s;
      eyeImp[o.i] += 0.6 * o.s;
    }
  }
  const nod = springTrack(n, nodImp, 2.6, 0.5);
  const bounce = springTrack(n, bounceImp, 3.2, 0.45);
  const earFlickL = springTrack(n, earImpL, 4, 0.3);
  const earFlickR = springTrack(n, earImpR, 4, 0.3);
  const eyePop = springTrack(n, eyeImp, 2.5, 0.8);

  const yawTarget = new Float32Array(n);
  const rollTarget = new Float32Array(n);
  const lookXT = new Float32Array(n);
  const lookYT = new Float32Array(n);
  {
    let yaw = 0, roll = 0;
    let pi = 0;
    let side = rand() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      while (pi < realPhrases.length && realPhrases[pi].end <= i) pi++;
      const ph = realPhrases[pi];
      if (ph && i === ph.start) {
        side = -side;
        yaw = side * (0.08 + rand() * 0.22);
        roll = -side * (0.04 + rand() * 0.1);
      }
      const inPhrase = ph && i >= ph.start && i < ph.end;
      yawTarget[i] = inPhrase ? yaw : yaw * 0.3;
      // cao độ lên cuối câu (câu hỏi) -> nghiêng đầu nhiều hơn
      rollTarget[i] = inPhrase ? roll + pitchRel[i] * 0.08 * Math.sign(roll || 1) : 0;
    }
    // ánh mắt: liếc nhẹ theo hướng xoay đầu + vài cú liếc ngẫu nhiên
    let lx = 0, ly = 0;
    for (let i = 0; i < n; i++) {
      if (i % Math.round(FPS * (0.9 + rand() * 1.5)) === 0) {
        lx = (rand() - 0.5) * 0.6;
        ly = (rand() - 0.5) * 0.4;
      }
      lookXT[i] = lx - yawTarget[i] * 0.8;
      lookYT[i] = ly + pitchRel[i] * 0.25;
    }
  }
  const headYaw = smoothZeroPhase(yawTarget, 0.18);
  const headRoll = smoothZeroPhase(rollTarget, 0.22);
  const lookX = smoothT(lookXT, 0.04);
  const lookY = smoothT(lookYT, 0.04);

  // Hoạt động nói được làm mượt (0..1) – dùng cho tai, cổ, đuôi.
  const activity = smoothT(Float32Array.from(active), 0.25);
  const energy = smoothT(loud, 0.18);

  const headPitch = new Float32Array(n);
  const neckPitch = new Float32Array(n);
  const neckYaw = smoothT(headYaw, 0.35);
  const earL = new Float32Array(n);
  const earR = new Float32Array(n);
  const eyeWide = new Float32Array(n);
  const bodyY = new Float32Array(n);
  const squash = new Float32Array(n);
  const tail = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    headPitch[i] = nod[i] - pitchRel[i] * 0.09 - energy[i] * 0.04;
    neckPitch[i] = energy[i] * 0.06 + nod[i] * 0.25;
    earL[i] = activity[i] * 0.35 + energy[i] * 0.2 + earFlickL[i] - (1 - activity[i]) * 0.1;
    earR[i] = activity[i] * 0.35 + energy[i] * 0.2 + earFlickR[i] - (1 - activity[i]) * 0.1;
    eyeWide[i] = clamp(pitchRel[i] * 0.4 + eyePop[i] + energy[i] * 0.2, -0.6, 1);
    bodyY[i] = bounce[i] * 0.5;
    squash[i] = Math.max(0, -bounce[i]) * 0.6;
    tail[i] = Math.sin(t * (6 + energy[i] * 6)) * (0.15 + energy[i] * 0.45) * activity[i];
  }
  const headYawFinal = new Float32Array(n);
  for (let i = 0; i < n; i++) headYawFinal[i] = headYaw[i] - neckYaw[i] * 0.4;

  // ---- Chớp mắt: đầu câu, cuối câu và ngẫu nhiên mỗi 2–5 giây ----
  const blinkTimes = [];
  for (const ph of realPhrases) {
    if (rand() < 0.65) blinkTimes.push(ph.start / FPS + 0.05);
    if (rand() < 0.5) blinkTimes.push(ph.end / FPS + 0.1);
  }
  for (let t = 0.8 + rand() * 1.5; t < duration; t += 2 + rand() * 3) blinkTimes.push(t);
  blinkTimes.sort((a, b) => a - b);
  const blinks = blinkTimes.filter((t, i) => i === 0 || t - blinkTimes[i - 1] > 0.6);
  const blink = new Float32Array(n);
  for (const bt of blinks) {
    const s = Math.round(bt * FPS);
    // khép 3 khung, giữ 1, mở 6 khung
    const shape = [0.35, 0.75, 1, 1, 0.8, 0.6, 0.4, 0.22, 0.1, 0.03];
    for (let k = 0; k < shape.length; k++) {
      const i = s + k;
      if (i >= 0 && i < n) blink[i] = Math.max(blink[i], shape[k]);
    }
  }

  const tracks = {
    jaw, wide, headPitch, headYaw: headYawFinal, headRoll, neckPitch, neckYaw,
    earL, earR, eyeWide, blink, lookX, lookY, bodyY, squash, tail,
  };

  return {
    fps: FPS,
    duration,
    frames: n,
    tracks,
    loud,
    onsets: onsets.map((o) => ({ t: o.i / FPS, s: o.s })),
    phrases: realPhrases.map((p) => ({ start: p.start / FPS, end: p.end / FPS })),
    stats: {
      medianPitch: voicedPitches.length ? Math.round(f0Med) : null,
      voicedRatio: voicedPitches.length / n,
      syllables: onsets.length,
    },
  };
}

function shift(arr, frames) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const j = clamp(i - frames, 0, arr.length - 1);
    out[i] = arr[j];
  }
  return out;
}

// Lấy mẫu pose tại thời điểm t (giây), nội suy tuyến tính giữa các khung.
export function samplePose(anim, t) {
  const f = clamp(t * anim.fps, 0, anim.frames - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(anim.frames - 1, i0 + 1);
  const a = f - i0;
  const pose = {};
  for (const [k, arr] of Object.entries(anim.tracks)) {
    pose[k] = arr[i0] * (1 - a) + arr[i1] * a;
  }
  return pose;
}
