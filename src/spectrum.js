// "Music spectrum" dạng nhiều đường sóng phát sáng, màu chuyển xanh ngọc -> xanh dương -> tím -> hồng.
// Biên độ theo từng vùng ngang lấy từ phổ tần số của âm thanh đang phát (AnalyserNode).

const BANDS = 64;
const COLORS = ['#22d3ee', '#3b82f6', '#8b5cf6', '#d946ef'];
const LINES = [
  // [hệ số bước sóng, tốc độ pha, lệch pha, hệ số biên độ]
  [1.0, 2.1, 0.0, 1.0],
  [0.92, -1.7, 1.3, 0.85],
  [1.09, 2.9, 2.2, 0.72],
  [0.86, -2.4, 3.4, 0.6],
  [1.17, 1.3, 4.6, 0.5],
  [0.8, -3.1, 5.5, 0.4],
];

export function createSpectrum() {
  const levels = new Float32Array(BANDS); // mức đã làm mượt 0..1
  const peaks = new Float32Array(BANDS).fill(0.3); // đỉnh gần đây của từng dải (tự cân bằng)
  const shaped = new Float32Array(BANDS);
  const bars = new Float32Array(BANDS); // phổ thật (không tự cân bằng) cho kiểu cột
  let barPeak = 0.3;
  let freq = null;

  // Cập nhật mức từ analyser (hoặc tắt dần khi không có âm thanh).
  function update(analyser, dt) {
    if (analyser) {
      if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freq);
      const nyq = analyser.context.sampleRate / 2;
      const n = freq.length;
      let total = 0;
      const raw = shaped; // dùng tạm mảng shaped
      for (let b = 0; b < BANDS; b++) {
        // dải tần chia theo thang log 90 Hz – 6 kHz
        const f0 = 90 * Math.pow(6000 / 90, b / BANDS);
        const f1 = 90 * Math.pow(6000 / 90, (b + 1) / BANDS);
        const i0 = Math.max(1, Math.floor((f0 / nyq) * n));
        const i1 = Math.max(i0 + 1, Math.ceil((f1 / nyq) * n));
        let m = 0;
        for (let i = i0; i < i1 && i < n; i++) m = Math.max(m, freq[i]);
        raw[b] = Math.max(0, (m - 50) / 205);
        total += raw[b];
      }
      // Giọng nói dồn năng lượng ở tần số thấp: chia cho đỉnh gần đây của từng dải để sóng trải đều
      // cả bề ngang, rồi nhân với độ to chung để im lặng thì sóng vẫn lặng.
      const loud = Math.min(1, (total / BANDS) * 3.2);
      let mx = 0;
      for (let b = 0; b < BANDS; b++) mx = Math.max(mx, raw[b] * (1 + (1.2 * b) / BANDS));
      barPeak = Math.max(mx, barPeak * Math.exp(-dt * 0.25), 0.15);
      for (let b = 0; b < BANDS; b++) {
        const target = Math.pow((raw[b] * (1 + (1.2 * b) / BANDS)) / barPeak, 1.5);
        const kb = target > bars[b] ? 1 - Math.exp(-dt * 35) : 1 - Math.exp(-dt * 9);
        bars[b] += (target - bars[b]) * kb;
      }
      for (let b = 0; b < BANDS; b++) {
        peaks[b] = Math.max(raw[b], peaks[b] * Math.exp(-dt * 0.35), 0.12);
        const target = Math.min(1, Math.pow(raw[b] / peaks[b], 1.6) * (0.35 + 0.65 * loud) * Math.min(1, loud * 4));
        const k = target > levels[b] ? 1 - Math.exp(-dt * 28) : 1 - Math.exp(-dt * 7);
        levels[b] += (target - levels[b]) * k;
      }
    } else {
      const k = 1 - Math.exp(-dt * 4);
      for (let b = 0; b < BANDS; b++) {
        levels[b] += (0 - levels[b]) * k;
        bars[b] += (0 - bars[b]) * k * 2;
      }
    }
  }

  // Làm mượt giữa các dải để sóng thành từng "cụm" tròn trịa như dạng âm thanh thật.
  function smoothLevels() {
    for (let b = 0; b < BANDS; b++) {
      let sum = 0, wsum = 0;
      for (let d = -3; d <= 3; d++) {
        const j = b + d;
        if (j < 0 || j >= BANDS) continue;
        const w = 4 - Math.abs(d);
        sum += levels[j] * w;
        wsum += w;
      }
      shaped[b] = sum / wsum;
    }
  }

  function envelope(x, t) {
    const f = x * (BANDS - 1);
    const i = Math.floor(f);
    const a = f - i;
    const v = shaped[i] * (1 - a) + (shaped[Math.min(BANDS - 1, i + 1)] || 0) * a;
    const taper = Math.pow(Math.sin(Math.PI * x), 0.7);
    const idle = 0.035 + 0.02 * Math.sin(t * 1.3 + x * 9);
    return Math.max(idle, v) * taper;
  }

  // Kiểu "cột trắng": các cột mảnh mọc lên từ một đường chấm, như visualizer trên video nhạc.
  function drawBars(g, W, H, t, { y = 0.6, amp = 0.17 } = {}) {
    const span = Math.min(W * 0.62, H * 1.1); // bề rộng dải cột
    const unit = Math.max(1.5, span / 230); // 1 cột = 1 đơn vị, khe = 1.6 đơn vị
    const count = Math.floor(span / (unit * 2.6));
    const x0 = (W - count * unit * 2.6) / 2;
    const base = H * y + H * amp * 0.45; // cột mọc lên nên hạ đường gốc xuống một chút
    const maxH = H * amp * 1.25;
    g.save();
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(255,255,255,0.55)';
    g.shadowBlur = unit * 2;
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1);
      // tần số thấp ở giữa-trái như mẫu: đọc dải tần theo vị trí, hơi nén phần cao
      const f = Math.pow(u, 1.1) * (BANDS - 1);
      const k = Math.floor(f);
      const a = f - k;
      const v = bars[k] * (1 - a) + (bars[Math.min(BANDS - 1, k + 1)] || 0) * a;
      const taper = 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.5);
      const h = v * taper * maxH;
      const x = x0 + i * unit * 2.6;
      if (h < unit * 1.5) {
        g.globalAlpha = 0.85;
        g.fillRect(x, base - unit, unit, unit); // chấm nhỏ khi im lặng
      } else {
        g.globalAlpha = 0.95;
        g.fillRect(x, base - h, unit, h);
      }
    }
    g.restore();
  }

  // Vẽ lên một context 2D bất kỳ (màn hình hoặc khung xuất video).
  // opts.x: dịch ngang (tỉ lệ bề rộng), opts.y: vị trí dọc của đường giữa (tỉ lệ chiều cao)
  function draw(g, W, H, t, opts = {}) {
    if (opts.x) {
      g.save();
      g.translate(opts.x * W, 0);
      draw(g, W, H, t, { ...opts, x: 0 });
      g.restore();
      return;
    }
    if (opts.style === 'bars') return drawBars(g, W, H, t, opts);
    const { y = 0.6, amp = 0.17 } = opts;
    const cy = H * y;
    const A = H * amp;
    const grad = g.createLinearGradient(W * 0.05, 0, W * 0.95, 0);
    COLORS.forEach((c, i) => grad.addColorStop(i / (COLORS.length - 1), c));
    smoothLevels();
    const step = Math.max(1.5, W / 560);
    const wavelength = Math.min(28, Math.max(9, W / 45)); // px mỗi chu kỳ dao động
    const env = [];
    for (let x = 0; x <= W; x += step) env.push(envelope(x / W, t));

    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineJoin = 'round';
    g.strokeStyle = grad;
    const glowW = Math.max(5, H / 130);
    const lineW = Math.max(1.1, H / 750);
    // lớp sáng mờ (chỉ 3 đường lớn) rồi các nét mảnh
    for (const pass of [{ w: glowW, a: 0.2, lines: 3 }, { w: lineW, a: 0.9, lines: LINES.length }]) {
      g.lineWidth = pass.w;
      g.globalAlpha = pass.a;
      for (const [wl, speed, phase, scale] of LINES.slice(0, pass.lines)) {
        const cycles = W / (wavelength * wl);
        g.beginPath();
        let j = 0;
        for (let x = 0; x <= W; x += step, j++) {
          const u = x / W;
          const yy = cy + env[j] * A * scale * Math.sin(2 * Math.PI * u * cycles + t * speed + phase);
          if (j) g.lineTo(x, yy);
          else g.moveTo(x, yy);
        }
        g.stroke();
      }
    }
    // đường giữa mảnh
    g.globalAlpha = 0.5;
    g.lineWidth = Math.max(1, H / 900);
    g.beginPath();
    g.moveTo(0, cy);
    g.lineTo(W, cy);
    g.stroke();
    g.restore();
  }

  return { update, draw };
}
