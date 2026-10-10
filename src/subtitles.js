// Phụ đề tự động: gửi âm thanh 16 kHz cho worker Whisper, chia kết quả thành các dòng phụ đề
// ngắn, xuất SRT, và vẽ phụ đề lên canvas khi xuất video.

const MAX_LINE = 42; // số ký tự tối đa mỗi dòng phụ đề

export const MODELS = {
  fast: 'onnx-community/whisper-base',
  accurate: 'onnx-community/whisper-small',
};

let worker = null;

export function transcribe(audio16k, { model, language, onDownload, onStage }) {
  worker ||= new Worker(new URL('./whisper.worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'download') onDownload?.(data);
      else if (data.type === 'status') onStage?.(data);
      else if (data.type === 'done') resolve(data);
      else if (data.type === 'error') reject(new Error(data.message));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'Lỗi bộ nhận dạng'));
    const copy = audio16k.slice();
    worker.postMessage({ type: 'run', audio: copy, model, language, webgpu: !!navigator.gpu }, [copy.buffer]);
  });
}

// Chia một đoạn dài thành các dòng ≤ MAX_LINE ký tự, thời gian chia theo số ký tự.
export function chunksToCues(chunks, duration) {
  const cues = [];
  chunks.forEach((c, idx) => {
    const text = (c.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    let [start, end] = c.timestamp || [0, null];
    start = Math.max(0, start ?? 0);
    if (end == null || end <= start) end = chunks[idx + 1]?.timestamp?.[0] ?? duration;
    end = Math.min(Math.max(end, start + 0.3), duration || end);
    // chia đều: số dòng tối thiểu để mỗi dòng ≤ MAX_LINE, độ dài các dòng gần bằng nhau
    const words = text.split(' ');
    const n = Math.ceil(text.length / MAX_LINE);
    const target = text.length / n;
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && lines.length < n - 1 && (next.length > MAX_LINE || next.length > target + 4)) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    const total = lines.reduce((n, l) => n + l.length, 0);
    let t = start;
    for (const l of lines) {
      const d = ((end - start) * l.length) / total;
      cues.push({ start: t, end: t + d, text: l });
      t += d;
    }
  });
  return cues;
}

export function cueAt(cues, t) {
  if (!cues) return null;
  for (const c of cues) if (t >= c.start && t < c.end) return c;
  return null;
}

const srtTime = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}

export const fmtCueTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

// Vẽ phụ đề lên canvas (khung xuất video): chữ trắng đậm trên nền tối bo góc, tự xuống dòng.
export function drawCaption(g, W, H, text) {
  if (!text) return;
  const size = Math.round(Math.min(W, H) * 0.048);
  g.save();
  g.font = `700 ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const maxW = W * 0.86;
  const lines = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && g.measureText(next).width > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  const lh = size * 1.3;
  const boxW = Math.min(W * 0.94, Math.max(...lines.map((l) => g.measureText(l).width)) + size * 1.2);
  const boxH = lines.length * lh + size * 0.6;
  const y0 = H * 0.86 - boxH;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  const x0 = (W - boxW) / 2;
  const r = size * 0.4;
  g.beginPath();
  g.moveTo(x0 + r, y0);
  g.arcTo(x0 + boxW, y0, x0 + boxW, y0 + boxH, r);
  g.arcTo(x0 + boxW, y0 + boxH, x0, y0 + boxH, r);
  g.arcTo(x0, y0 + boxH, x0, y0, r);
  g.arcTo(x0, y0, x0 + boxW, y0, r);
  g.fill();
  g.fillStyle = '#fff';
  lines.forEach((l, i) => g.fillText(l, W / 2, y0 + size * 0.3 + lh * (i + 0.5)));
  g.restore();
}
