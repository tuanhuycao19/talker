import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createGiraffe } from './giraffe.js';
import { analyzeAudio, samplePose } from './analysis.js';
import { PRESETS, loadBackground, saveBackground, backgroundCss, readImageFile } from './backgrounds.js';
import { isTikTokUrl, resolveTikTok, fetchTikTokVideo } from './tiktok.js';

const $ = (id) => document.getElementById(id);
const ui = {
  bg: $('bg'),
  canvas: $('scene'),
  status: $('status'),
  recBtn: $('recBtn'),
  recTime: $('recTime'),
  playBtn: $('playBtn'),
  voice: $('voice'),
  audioFile: $('audioFile'),
  bgVideoWrap: $('bgVideoWrap'),
  bgVideo: $('bgVideo'),
  bgVideoBlur: $('bgVideoBlur'),
  ttForm: $('ttForm'),
  ttUrl: $('ttUrl'),
  ttBtn: $('ttBtn'),
  download: $('download'),
  timeline: $('timeline'),
  timelineEmpty: $('timelineEmpty'),
  bgBtn: $('bgBtn'),
  bgPanel: $('bgPanel'),
  bgClose: $('bgClose'),
  presetGrid: $('presetGrid'),
  bgFile: $('bgFile'),
  bgColor: $('bgColor'),
};

const setStatus = (html) => { ui.status.innerHTML = html; };
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ======================= Cảnh 3D =======================

const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const TARGET = new THREE.Vector3(0, 2.05, 0);
camera.position.set(0, 2.6, 10);

const controls = new OrbitControls(camera, ui.canvas);
controls.target.copy(TARGET);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 18;
controls.minPolarAngle = Math.PI * 0.2;
controls.maxPolarAngle = Math.PI * 0.53;

scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c7a0, 1.1));
const key = new THREE.DirectionalLight(0xfff4e0, 2.4);
key.position.set(3, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -1;
key.shadow.camera.near = 1;
key.shadow.camera.far = 20;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
fill.position.set(-5, 3, 3);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.1);
rim.position.set(-2, 5, -6);
scene.add(rim);

// Mặt đất trong suốt chỉ nhận bóng + một bóng mềm dưới chân.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
{
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 2.2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.002;
  scene.add(blob);
}

const giraffe = createGiraffe();
scene.add(giraffe.root);

function fitCamera() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Chừa chỗ cho dock phía dưới: dịch tâm nhìn xuống một chút trên màn hình thấp.
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const needH = 5.2;
  const needW = 2.8;
  const dist = Math.max(needH / 2 / tanHalf, needW / 2 / (tanHalf * camera.aspect)) * 1.05;
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  // dịch khung hình lên để hươu không bị dock che
  const dock = document.querySelector('.dock');
  const dockH = (dock?.offsetHeight || 140) + 50;
  document.documentElement.style.setProperty('--dock-h', `${dock?.offsetHeight || 140}px`);
  camera.setViewOffset(w, h, 0, (dockH / 2) * 0.9, w, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fitCamera);
fitCamera();

// ======================= Chuyển động nền (idle) =======================

const idle = {
  nextBlink: 1.5,
  blinkStart: -10,
  nextGlance: 2,
  look: { x: 0, y: 0 },
  lookTarget: { x: 0, y: 0 },
  nextEar: 3,
  earStart: -10,
  earSide: 1,
  // nghiêng đầu thỉnh thoảng: nghiêng sang một bên, giữ một lúc rồi về giữa
  nextTilt: 4,
  tilt: null,
};

function idlePose(t, dt) {
  if (t > idle.nextBlink) {
    idle.blinkStart = t;
    idle.nextBlink = t + 2 + Math.random() * 3.5;
  }
  const bt = t - idle.blinkStart;
  const blink = bt < 0.08 ? bt / 0.08 : bt < 0.2 ? 1 - (bt - 0.08) / 0.12 : 0;

  if (t > idle.nextGlance) {
    idle.lookTarget = { x: (Math.random() - 0.5) * 0.25, y: (Math.random() - 0.5) * 0.15 };
    idle.nextGlance = t + 1 + Math.random() * 2.5;
  }
  const k = 1 - Math.exp(-dt * 18);
  idle.look.x += (idle.lookTarget.x - idle.look.x) * k;
  idle.look.y += (idle.lookTarget.y - idle.look.y) * k;

  if (t > idle.nextEar) {
    idle.earStart = t;
    idle.earSide = Math.random() < 0.5 ? -1 : 1;
    idle.nextEar = t + 3 + Math.random() * 5;
  }
  const et = t - idle.earStart;
  const flick = et < 0.6 ? Math.sin(et * 30) * Math.exp(-et * 7) * 0.5 : 0;

  if (t > idle.nextTilt && !idle.tilt) {
    idle.tilt = {
      start: t,
      angle: (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.1),
      rise: 0.45 + Math.random() * 0.25,
      hold: 0.8 + Math.random() * 1.4,
      fall: 0.6 + Math.random() * 0.3,
    };
  }
  let headRoll = 0;
  if (idle.tilt) {
    const { start, angle, rise, hold, fall } = idle.tilt;
    const tt = t - start;
    const ease = (x) => x * x * (3 - 2 * x);
    if (tt < rise) headRoll = angle * ease(tt / rise);
    else if (tt < rise + hold) headRoll = angle;
    else if (tt < rise + hold + fall) headRoll = angle * (1 - ease((tt - rise - hold) / fall));
    else {
      idle.tilt = null;
      idle.nextTilt = t + 4 + Math.random() * 6;
    }
  }

  const breath = Math.sin(t * Math.PI * 2 * 0.28);
  return {
    breath: breath * 0.012,
    bodyY: breath * 0.008,
    headPitch: Math.sin(t * 0.7) * 0.03,
    headRoll,
    neckRoll: headRoll * 0.15,
    earL: Math.sin(t * 0.9) * 0.05 + (idle.earSide < 0 ? flick : 0),
    earR: Math.sin(t * 0.9 + 1) * 0.05 + (idle.earSide > 0 ? flick : 0),
    blink,
    lookX: idle.look.x,
    lookY: idle.look.y,
    tail: Math.sin(t * 2.2) * 0.12,
  };
}

// ======================= Âm thanh =======================

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

const state = {
  mode: 'idle', // idle | recording | analyzing | playing
  // ghi âm
  stream: null,
  recorder: null,
  chunks: [],
  recStart: 0,
  micAnalyser: null,
  micData: null,
  micLevel: 0,
  // bản ghi hiện tại
  buffer: null,
  anim: null,
  waveform: null,
  blobUrl: null,
  // phát lại
  source: null,
  playStartCtx: 0,
  playOffset: 0,
  rate: 1,
  playhead: 0,
  // nền video (TikTok hoặc file video); videoLinked = âm thanh hiện tại lấy từ chính video này
  videoUrl: null,
  videoLinked: false,
};

const MAX_REC_SECONDS = 60;

function pickMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (!window.MediaRecorder) return null;
  return types.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus('Trình duyệt không hỗ trợ ghi âm. Hãy thử Chrome/Edge/Safari mới hoặc dùng <b>Mở file</b>.');
    return;
  }
  stopPlayback();
  const ctx = getAudioCtx();
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    setStatus(err.name === 'NotAllowedError'
      ? 'Bạn chưa cho phép dùng micro. Hãy bật quyền micro cho trang này.'
      : `Không mở được micro: ${err.message}`);
    return;
  }

  const src = ctx.createMediaStreamSource(state.stream);
  state.micAnalyser = ctx.createAnalyser();
  state.micAnalyser.fftSize = 1024;
  state.micData = new Float32Array(state.micAnalyser.fftSize);
  src.connect(state.micAnalyser);

  const mimeType = pickMime();
  state.recorder = new MediaRecorder(state.stream, mimeType ? { mimeType } : undefined);
  state.chunks = [];
  state.recorder.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
  state.recorder.onstop = onRecordingStopped;
  state.recorder.start(100);
  state.recStart = performance.now();
  state.mode = 'recording';
  ui.recBtn.classList.add('recording');
  ui.recBtn.querySelector('.label').textContent = 'Dừng';
  ui.playBtn.disabled = true;
  setStatus('Đang ghi âm… hươu đang lắng nghe bạn 👂');
}

function stopRecording() {
  if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop();
  state.stream?.getTracks().forEach((t) => t.stop());
  state.micAnalyser = null;
  ui.recBtn.classList.remove('recording');
  ui.recBtn.querySelector('.label').textContent = 'Ghi âm';
  ui.recBtn.style.setProperty('--level', 0);
}

async function onRecordingStopped() {
  const type = state.recorder?.mimeType || 'audio/webm';
  const blob = new Blob(state.chunks, { type });
  state.recorder = null;
  state.stream = null;
  if (!blob.size) {
    state.mode = 'idle';
    setStatus('Không thu được âm thanh. Thử lại nhé!');
    return;
  }
  await loadAudio(blob);
}

async function loadAudio(blob, { fromVideo = false, label = '' } = {}) {
  state.mode = 'analyzing';
  ui.recBtn.classList.add('busy');
  ui.playBtn.disabled = true;
  setStatus('Đang phân tích giọng nói và tạo chuyển động…');
  try {
    stopPlayback();
    const ctx = getAudioCtx();
    const data = await blob.arrayBuffer();
    const buffer = await ctx.decodeAudioData(data);
    if (buffer.duration < 0.2) throw new Error('Bản ghi quá ngắn');
    const t0 = performance.now();
    const anim = await analyzeAudio(buffer);
    const ms = Math.round(performance.now() - t0);
    state.buffer = buffer;
    state.anim = anim;
    setVideoLinked(fromVideo);
    state.waveform = computeWaveform(buffer, 600);
    if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
    state.blobUrl = URL.createObjectURL(blob);
    ui.download.href = state.blobUrl;
    ui.download.download = `talker-${Date.now()}.${(blob.type.split('/')[1] || (fromVideo ? 'mp4' : 'webm')).split(';')[0]}`;
    ui.download.hidden = false;
    ui.timelineEmpty.hidden = true;
    ui.playBtn.disabled = false;
    state.playhead = 0;
    const s = anim.stats;
    setStatus(`${label ? `${escapeHtml(label)} · ` : ''}Đã tạo chuyển động: ${fmtTime(anim.duration)} · ${s.syllables} nhấn âm · ${anim.phrases.length} câu`
      + `${s.medianPitch ? ` · cao độ ~${s.medianPitch} Hz` : ''} (${ms} ms). Nhấn <b>Phát lại</b>!`);
    state.mode = 'idle';
    drawTimeline();
    window.__talker = { anim, duration: buffer.duration }; // hỗ trợ kiểm thử
    window.__playhead = () => (state.mode === 'playing' ? playbackTime() : state.playhead);
  } catch (err) {
    console.error(err);
    state.mode = 'idle';
    setStatus(fromVideo
      ? `Đã đặt video làm nền, nhưng không đọc được âm thanh của video: ${escapeHtml(err.message)}`
      : `Không xử lý được âm thanh: ${escapeHtml(err.message)}`);
  } finally {
    ui.recBtn.classList.remove('busy');
  }
}

function computeWaveform(buffer, buckets) {
  const ch = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(ch.length / buckets));
  const out = new Float32Array(buckets);
  for (let b = 0; b < buckets; b++) {
    let m = 0;
    for (let i = b * step; i < Math.min(ch.length, (b + 1) * step); i++) m = Math.max(m, Math.abs(ch[i]));
    out[b] = m;
  }
  const peak = Math.max(1e-4, ...out);
  for (let b = 0; b < buckets; b++) out[b] /= peak;
  return out;
}

function startPlayback(offset = 0) {
  if (!state.buffer) return;
  stopPlayback();
  const ctx = getAudioCtx();
  const src = ctx.createBufferSource();
  src.buffer = state.buffer;
  state.rate = parseFloat(ui.voice.value) || 1;
  src.playbackRate.value = state.rate;
  src.connect(ctx.destination);
  src.onended = () => {
    if (state.source === src) {
      state.source = null;
      state.mode = 'idle';
      state.playhead = 0;
      if (state.videoLinked) ui.bgVideo.pause();
      ui.playBtn.classList.remove('playing');
      ui.playBtn.querySelector('.label').textContent = 'Phát lại';
      setStatus('Xong! Nhấn <b>Phát lại</b> để xem lại hoặc <b>Ghi âm</b> câu mới.');
    }
  };
  state.playOffset = Math.max(0, Math.min(offset, state.buffer.duration - 0.05));
  // Trễ một nhịp nhỏ để cả âm thanh lẫn hình bắt đầu đồng bộ.
  state.playStartCtx = ctx.currentTime + 0.05;
  src.start(state.playStartCtx, state.playOffset);
  state.source = src;
  if (state.videoLinked) {
    ui.bgVideo.currentTime = state.playOffset;
    ui.bgVideo.playbackRate = state.rate;
    // âm thanh bắt đầu sau 50ms (playStartCtx), video chờ cùng nhịp
    setTimeout(() => state.source === src && ui.bgVideo.play().catch(() => {}), 50);
  }
  state.mode = 'playing';
  ui.playBtn.classList.add('playing');
  ui.playBtn.querySelector('.label').textContent = 'Dừng';
  setStatus('Hươu đang nói… 🦒💬');
}

function stopPlayback() {
  if (state.source) {
    const s = state.source;
    state.source = null;
    try { s.stop(); } catch { /* đã dừng */ }
  }
  if (state.mode === 'playing') state.mode = 'idle';
  if (state.videoLinked) ui.bgVideo.pause();
  ui.playBtn.classList.remove('playing');
  ui.playBtn.querySelector('.label').textContent = 'Phát lại';
}

// Thời điểm (giây trong bản ghi) mà người nghe đang thực sự nghe thấy.
function playbackTime() {
  const ctx = audioCtx;
  let now = ctx.currentTime;
  if (ctx.getOutputTimestamp) {
    const ts = ctx.getOutputTimestamp();
    if (ts.contextTime > 0 && ts.performanceTime > 0) {
      // ngoại suy từ mốc đầu ra tới thời điểm hiện tại của khung hình
      now = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    } else if (ctx.outputLatency) {
      now -= ctx.outputLatency;
    }
  }
  return state.playOffset + Math.max(0, now - state.playStartCtx) * state.rate;
}

// ======================= Dòng thời gian =======================

function drawTimeline() {
  const c = ui.timeline;
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const anim = state.anim;
  if (!anim || !state.waveform) return;
  const dur = anim.duration;
  const X = (t) => (t / dur) * w;

  // các câu (phrase)
  g.fillStyle = 'rgba(242,162,58,0.12)';
  for (const p of anim.phrases) g.fillRect(X(p.start), 0, X(p.end) - X(p.start), h);

  // dạng sóng
  const wf = state.waveform;
  g.fillStyle = 'rgba(60,70,90,0.28)';
  const mid = h / 2;
  for (let i = 0; i < wf.length; i++) {
    const x = (i / wf.length) * w;
    const a = wf[i] * (h / 2 - 4);
    g.fillRect(x, mid - a, Math.max(1, w / wf.length - 0.5), a * 2);
  }

  // độ mở miệng
  const jaw = anim.tracks.jaw;
  g.beginPath();
  for (let i = 0; i < jaw.length; i++) {
    const x = (i / jaw.length) * w;
    const y = h - 3 - jaw[i] * (h - 8);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.strokeStyle = '#e48a17';
  g.lineWidth = 1.6;
  g.stroke();

  // nhấn âm
  g.fillStyle = '#6a4bd8';
  for (const o of anim.onsets) {
    g.beginPath();
    g.arc(X(o.t), 5, 1.5 + o.s * 2, 0, Math.PI * 2);
    g.fill();
  }

  // đầu phát
  if (state.mode === 'playing' || state.playhead > 0) {
    const x = X(state.playhead);
    g.fillStyle = '#1f2430';
    g.fillRect(x - 1, 0, 2, h);
  }
}

ui.timeline.addEventListener('click', (e) => {
  if (!state.anim) return;
  const r = ui.timeline.getBoundingClientRect();
  const t = ((e.clientX - r.left) / r.width) * state.anim.duration;
  startPlayback(t);
});
window.addEventListener('resize', drawTimeline);

// ======================= Nền video =======================

const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function showVideoBackground(src, poster = '') {
  const v = ui.bgVideo;
  ui.bgVideoWrap.hidden = false;
  ui.bgVideoBlur.style.backgroundImage = poster ? `url("${poster}")` : 'none';
  v.muted = true;
  v.src = src;
  if (poster) v.poster = poster;
  else v.removeAttribute('poster');
  // Không có ảnh bìa: lấy khung hình đầu làm nền mờ hai bên.
  v.addEventListener('loadeddata', () => {
    if (poster) return;
    try {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = Math.max(1, Math.round((64 * v.videoHeight) / (v.videoWidth || 1)));
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      ui.bgVideoBlur.style.backgroundImage = `url("${c.toDataURL('image/jpeg', 0.7)}")`;
    } catch { /* video khác nguồn – bỏ qua */ }
  }, { once: true });
  setVideoLinked(false);
  for (const el of ui.presetGrid.children) el.classList.remove('active');
}

function hideVideoBackground() {
  const v = ui.bgVideo;
  if (ui.bgVideoWrap.hidden) return;
  v.pause();
  v.removeAttribute('src');
  v.load();
  ui.bgVideoWrap.hidden = true;
  state.videoLinked = false;
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = null;
}

// Video gắn với âm thanh: chỉ chạy khi phát lại (đồng bộ theo âm thanh).
// Video chỉ làm nền (âm thanh từ ghi âm khác): chạy lặp, tắt tiếng.
function setVideoLinked(linked) {
  const v = ui.bgVideo;
  state.videoLinked = linked && !ui.bgVideoWrap.hidden;
  if (ui.bgVideoWrap.hidden) return;
  v.muted = true;
  if (state.videoLinked) {
    v.loop = false;
    v.pause();
    v.currentTime = 0;
  } else {
    v.loop = true;
    v.playbackRate = 1;
    v.play().catch(() => {});
  }
}

// ======================= Ảnh nền =======================

let currentBg = loadBackground();

function applyBackground(bg, persist = true) {
  if (persist) hideVideoBackground();
  currentBg = bg;
  const css = backgroundCss(bg);
  ui.bg.style.backgroundImage = css.image;
  ui.bg.style.backgroundColor = css.color;
  for (const el of ui.presetGrid.children) {
    el.classList.toggle('active', bg.type === 'preset' && el.dataset.id === bg.id);
  }
  if (bg.type === 'color') ui.bgColor.value = bg.value;
  if (persist && !saveBackground(bg)) {
    setStatus('Đã đổi ảnh nền (ảnh quá lớn nên không lưu lại cho lần sau).');
  }
}

for (const p of PRESETS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'preset';
  b.dataset.id = p.id;
  b.style.backgroundImage = p.css;
  b.innerHTML = `<span>${p.name}</span>`;
  b.setAttribute('aria-label', `Ảnh nền ${p.name}`);
  b.addEventListener('click', () => applyBackground({ type: 'preset', id: p.id }));
  ui.presetGrid.appendChild(b);
}

ui.bgFile.addEventListener('change', async () => {
  const file = ui.bgFile.files?.[0];
  ui.bgFile.value = '';
  if (!file) return;
  try {
    const dataUrl = await readImageFile(file);
    applyBackground({ type: 'image', dataUrl });
  } catch (err) {
    setStatus(err.message);
  }
});
ui.bgColor.addEventListener('input', () => applyBackground({ type: 'color', value: ui.bgColor.value }));

function togglePanel(open = ui.bgPanel.hidden) {
  ui.bgPanel.hidden = !open;
  ui.bgBtn.setAttribute('aria-expanded', String(open));
}
ui.bgBtn.addEventListener('click', () => togglePanel());
ui.bgClose.addEventListener('click', () => togglePanel(false));
document.addEventListener('keydown', (e) => e.key === 'Escape' && togglePanel(false));

applyBackground(currentBg, false);

// ======================= Điều khiển =======================

ui.recBtn.addEventListener('click', () => {
  if (state.mode === 'recording') stopRecording();
  else if (state.mode !== 'analyzing') startRecording();
});

ui.playBtn.addEventListener('click', () => {
  if (state.mode === 'playing') stopPlayback();
  else startPlayback(0);
});

ui.voice.addEventListener('change', () => {
  if (state.mode === 'playing') startPlayback(playbackTime());
});

ui.audioFile.addEventListener('change', async () => {
  const file = ui.audioFile.files?.[0];
  ui.audioFile.value = '';
  if (!file) return;
  if (state.mode === 'recording') stopRecording();
  stopPlayback();
  if (file.type.startsWith('video/')) {
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(file);
    showVideoBackground(state.videoUrl);
    await loadAudio(file, { fromVideo: true, label: file.name });
  } else {
    await loadAudio(file);
  }
});

// ======================= Video TikTok =======================

ui.ttForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const link = ui.ttUrl.value.trim();
  if (!isTikTokUrl(link)) {
    setStatus('Link chưa đúng. Hãy dán link video TikTok, ví dụ <b>https://vt.tiktok.com/…</b>');
    ui.ttUrl.focus();
    return;
  }
  if (state.mode === 'recording') stopRecording();
  stopPlayback();
  getAudioCtx();
  ui.ttBtn.disabled = true;
  ui.recBtn.classList.add('busy');
  try {
    setStatus('Đang tìm video TikTok…');
    const info = await resolveTikTok(link);
    const label = info.author ? `@${info.author}` : 'TikTok';
    let blob;
    try {
      blob = await fetchTikTokVideo(info, (loaded, total) => {
        setStatus(`Đang tải video ${label}… ${total ? `${Math.round((loaded / total) * 100)}%` : `${(loaded / 1e6).toFixed(1)} MB`}`);
      });
    } catch (err) {
      // Không tải được file (thường do CORS): vẫn đặt video làm nền nhưng không phân tích được âm thanh.
      console.warn(err);
      showVideoBackground(info.video, info.cover);
      setVideoLinked(false);
      setStatus('Đã đặt video làm nền, nhưng trình duyệt bị chặn tải âm thanh để phân tích. '
        + 'Hãy cấu hình proxy (xem README) hoặc tải video về rồi dùng <b>Mở file</b>.');
      return;
    }
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(blob);
    showVideoBackground(state.videoUrl, info.cover);
    await loadAudio(blob, { fromVideo: true, label });
  } catch (err) {
    console.error(err);
    setStatus(`Không lấy được video: ${escapeHtml(err.message)}`);
  } finally {
    ui.ttBtn.disabled = false;
    ui.recBtn.classList.remove('busy');
  }
});

// Ẩn/hiện toàn bộ nút điều khiển để xem trọn video/ảnh nền.
const uiToggle = document.getElementById('uiToggle');
function setUiHidden(hidden) {
  document.body.classList.toggle('ui-hidden', hidden);
  uiToggle.setAttribute('aria-pressed', String(hidden));
  uiToggle.setAttribute('aria-label', hidden ? 'Hiện nút điều khiển' : 'Ẩn nút điều khiển');
  if (hidden) togglePanel(false);
}
uiToggle.addEventListener('click', () => setUiHidden(!document.body.classList.contains('ui-hidden')));

// Phím tắt: R ghi/dừng, Space phát/dừng, H ẩn/hiện nút.
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.code === 'KeyR') { e.preventDefault(); ui.recBtn.click(); }
  if (e.code === 'Space' && !ui.playBtn.disabled) { e.preventDefault(); ui.playBtn.click(); }
  if (e.code === 'KeyH') { e.preventDefault(); uiToggle.click(); }
});

// ======================= Vòng lặp hoạt ảnh =======================

const POSE_KEYS = [
  'jaw', 'wide', 'headPitch', 'headYaw', 'headRoll', 'neckPitch', 'neckYaw', 'neckRoll',
  'earL', 'earR', 'eyeWide', 'blink', 'lookX', 'lookY', 'bodyY', 'squash', 'breath', 'tail', 'tailLift',
];

const weights = { listen: 0, play: 0 };
const listenSmooth = { level: 0 };
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  // Trọng số chuyển trạng thái mượt
  const approach = (cur, target, speed) => cur + (target - cur) * (1 - Math.exp(-dt * speed));
  weights.listen = approach(weights.listen, state.mode === 'recording' ? 1 : 0, 6);
  weights.play = approach(weights.play, state.mode === 'playing' ? 1 : 0, 14);

  const pose = idlePose(t, dt);
  for (const k of POSE_KEYS) pose[k] ??= 0;

  // Đang ghi âm: hươu nghiêng đầu lắng nghe, tai vểnh theo âm lượng micro.
  if (state.micAnalyser) {
    state.micAnalyser.getFloatTimeDomainData(state.micData);
    let e = 0;
    for (const v of state.micData) e += v * v;
    const rms = Math.sqrt(e / state.micData.length);
    const lvl = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-6) + 55) / 40));
    state.micLevel = lvl;
    ui.recBtn.style.setProperty('--level', lvl.toFixed(3));
    const el = (performance.now() - state.recStart) / 1000;
    ui.recTime.textContent = fmtTime(el);
    if (el >= MAX_REC_SECONDS) stopRecording();
  }
  listenSmooth.level = approach(listenSmooth.level, state.mode === 'recording' ? state.micLevel : 0, 10);
  if (weights.listen > 0.001) {
    const w = weights.listen, l = listenSmooth.level;
    pose.headPitch += w * -0.05;
    pose.earL += w * (0.3 + l * 0.6);
    pose.earR += w * (0.3 + l * 0.6);
    pose.eyeWide += w * (0.25 + l * 0.5);
    pose.neckPitch += w * 0.04;
    pose.lookX = pose.lookX * (1 - w);
    pose.lookY = pose.lookY * (1 - w) + w * 0.1;
  }

  // Đang phát: cộng các track chuyển động đã phân tích.
  if (state.anim && (weights.play > 0.001 || state.mode === 'playing')) {
    if (state.mode === 'playing' && audioCtx) state.playhead = playbackTime();
    const p = samplePose(state.anim, state.playhead);
    const w = weights.play;
    for (const k of Object.keys(p)) {
      if (k === 'blink') pose.blink = Math.max(pose.blink * (1 - w), p.blink * w);
      else if (k === 'lookX' || k === 'lookY') pose[k] = pose[k] * (1 - w) + p[k] * w;
      else if (k === 'jaw' || k === 'wide') pose[k] = state.mode === 'playing' ? p[k] : p[k] * w;
      else pose[k] += p[k] * w;
    }
    drawTimeline();
  }

  // Giữ video nền khớp với âm thanh khi phát (sửa lệch > 0.15s).
  const v = ui.bgVideo;
  if (state.videoLinked && state.mode === 'playing' && !v.seeking && v.readyState >= 2) {
    if (Math.abs(v.currentTime - state.playhead) > 0.15) v.currentTime = state.playhead;
    if (v.paused) v.play().catch(() => {});
  }

  giraffe.setPose(pose);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Bật sẵn AudioContext ở lần chạm đầu tiên (yêu cầu của iOS/Safari).
window.addEventListener('pointerdown', () => getAudioCtx(), { once: true });
