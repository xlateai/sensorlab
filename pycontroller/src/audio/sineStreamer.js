import { requireNativeModule } from 'expo-modules-core';
const Sensorlib = requireNativeModule('Sensorlib');

const SAMPLE_RATE = 48000;
const CHUNK_SIZE = 2048;
const FREQ = 440;
let phase = 0;
let running = false;

function generateConstantChunk(value = 0.5) {
  const chunk = new Float32Array(CHUNK_SIZE);
  for (let i = 0; i < CHUNK_SIZE; i++) {
    chunk[i] = value;
  }
  return chunk;
}

async function sineLoop() {
  while (running) {
    const buffered = await Sensorlib.getAudioBufferedSamples();
    const seconds = buffered / SAMPLE_RATE;
    let timeout = 20;
    if (seconds < 0.3) timeout = 10;
    else if (seconds > 0.8) timeout = 40;
  const chunk = generateConstantChunk();
  Sensorlib.pushAudioSamples(Array.from(chunk));
    await new Promise(resolve => setTimeout(resolve, timeout));
  }
}

export function startSineStream() {
  if (running) return;
  running = true;
  sineLoop();
}

export function stopSineStream() {
  running = false;
}
