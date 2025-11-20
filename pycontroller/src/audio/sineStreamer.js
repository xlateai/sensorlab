import { NativeModules } from 'react-native';
const { AudioBridge } = NativeModules;

const SAMPLE_RATE = 48000;
const CHUNK_SIZE = 2048;
const FREQS = [440, 660];
let phase = [0, 0];

function generateSineChunk() {
  const chunk = new Float32Array(CHUNK_SIZE);
  for (let i = 0; i < CHUNK_SIZE; i++) {
    let sample = 0;
    for (let j = 0; j < FREQS.length; j++) {
      sample += Math.sin(phase[j]);
      phase[j] += 2 * Math.PI * FREQS[j] / SAMPLE_RATE;
      if (phase[j] > 2 * Math.PI) phase[j] -= 2 * Math.PI;
    }
    chunk[i] = sample / FREQS.length;
  }
  return chunk;
}

let running = false;

async function loop() {
  if (!running) return;
  const buffered = await AudioBridge.getBufferedSamples();
  const seconds = buffered / SAMPLE_RATE;
  let timeout = 2;
  if (seconds < 0.3) timeout = 0;
  else if (seconds > 0.8) timeout = 10;
  const chunk = generateSineChunk();
  AudioBridge.pushSamples(Array.from(chunk));
  setTimeout(loop, timeout);
}

export function startSineStream() {
  if (running) return;
  running = true;
  loop();
}

export function stopSineStream() {
  running = false;
}
