// Web Worker: nhận dạng giọng nói bằng Whisper (transformers.js) để giao diện không bị đứng.
// Mô hình tải từ Hugging Face lần đầu rồi được trình duyệt lưu lại (Cache Storage).

import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

let asr = null;
let loadedKey = '';

async function load(model, device) {
  const key = `${model}|${device}`;
  if (asr && loadedKey === key) return asr;
  asr = null;
  const dtype = device === 'webgpu'
    ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
    : 'q8';
  asr = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: (p) => {
      if (p.status === 'progress') self.postMessage({ type: 'download', file: p.file, loaded: p.loaded, total: p.total });
    },
  });
  loadedKey = key;
  return asr;
}

self.onmessage = async ({ data }) => {
  if (data.type !== 'run') return;
  try {
    let device = data.webgpu ? 'webgpu' : 'wasm';
    let run;
    try {
      run = await load(data.model, device);
    } catch (err) {
      if (device !== 'webgpu') throw err;
      device = 'wasm'; // WebGPU lỗi trên một số máy – dùng CPU
      run = await load(data.model, device);
    }
    self.postMessage({ type: 'status', stage: 'transcribe', device });
    const out = await run(data.audio, {
      task: 'transcribe',
      ...(data.language ? { language: data.language } : {}),
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });
    self.postMessage({ type: 'done', chunks: out.chunks || [], text: out.text || '' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
