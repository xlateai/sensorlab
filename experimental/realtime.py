"""
Real-time microphone input with FIFO replay buffer.

Maintains a buffer of 64 chunks of 2048 samples each.
Supports optional relay to speakers for live monitoring.

Dependencies:
    pip install sounddevice numpy
"""

import numpy as np
import sounddevice as sd
import queue
import threading
from collections import deque
from typing import Optional


class ReplayBuffer:
    """FIFO buffer that maintains 64 chunks of 2048 samples each."""
    
    def __init__(self, num_chunks: int = 64, chunk_size: int = 2048):
        self.num_chunks = num_chunks
        self.chunk_size = chunk_size
        self.buffer = deque(maxlen=num_chunks)
        self.lock = threading.Lock()
    
    def add_chunk(self, chunk: np.ndarray):
        """Add a new chunk to the buffer (FIFO if full)."""
        if len(chunk) != self.chunk_size:
            raise ValueError(f"Chunk size must be {self.chunk_size}, got {len(chunk)}")
        
        with self.lock:
            self.buffer.append(chunk.copy())
    
    def get_all_chunks(self) -> np.ndarray:
        """Get all chunks as a single array (oldest to newest)."""
        with self.lock:
            if len(self.buffer) == 0:
                return np.array([])
            return np.concatenate(list(self.buffer))
    
    def get_chunk(self, index: int) -> Optional[np.ndarray]:
        """Get a specific chunk by index (0 = oldest, -1 = newest)."""
        with self.lock:
            if 0 <= index < len(self.buffer):
                return np.array(list(self.buffer)[index]).copy()
            elif -len(self.buffer) <= index < 0:
                return np.array(list(self.buffer)[index]).copy()
            return None
    
    def get_size(self) -> int:
        """Get current number of chunks in buffer."""
        with self.lock:
            return len(self.buffer)
    
    def is_full(self) -> bool:
        """Check if buffer is full."""
        with self.lock:
            return len(self.buffer) == self.num_chunks


class AudioRecorder:
    """Real-time audio recorder with replay buffer."""
    
    def __init__(
        self,
        sample_rate: int = 44100,
        chunk_size: int = 2048,
        num_chunks: int = 64,
        channels: int = 1,
        relay_to_speakers: bool = False
    ):
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.channels = channels
        self.relay_to_speakers = relay_to_speakers
        
        self.replay_buffer = ReplayBuffer(num_chunks=num_chunks, chunk_size=chunk_size)
        self.audio_queue = queue.Queue()
        
        self.is_recording = False
        self.recording_thread = None
        self.stream = None
    
    def _audio_callback(self, indata, outdata, frames, time, status):
        """Callback for sounddevice stream (handles both input and output)."""
        if status:
            print(f"Audio callback status: {status}")
        
        # Convert to mono if needed
        if self.channels == 1 and indata.shape[1] > 1:
            audio_data = np.mean(indata, axis=1)
        else:
            audio_data = indata[:, 0] if indata.shape[1] > 0 else indata.flatten()
        
        # Put in queue for processing
        self.audio_queue.put(audio_data.copy())
        
        # If relaying to speakers, directly copy input to output
        if self.relay_to_speakers and outdata is not None:
            if self.channels == 1:
                outdata[:, 0] = audio_data
            else:
                outdata[:] = indata
    
    def _process_audio(self):
        """Process audio chunks and add to replay buffer."""
        current_chunk = np.zeros(self.chunk_size, dtype=np.float32)
        chunk_index = 0
        
        while self.is_recording:
            try:
                # Get audio data from queue (with timeout to allow checking is_recording)
                audio_data = self.audio_queue.get(timeout=0.1)
                
                # Fill current chunk
                remaining = self.chunk_size - chunk_index
                if len(audio_data) <= remaining:
                    # Fits in current chunk
                    current_chunk[chunk_index:chunk_index + len(audio_data)] = audio_data
                    chunk_index += len(audio_data)
                else:
                    # Fill remainder of current chunk
                    current_chunk[chunk_index:] = audio_data[:remaining]
                    # Add complete chunk to buffer
                    self.replay_buffer.add_chunk(current_chunk)
                    
                    # Start new chunk with remaining data
                    remaining_data = audio_data[remaining:]
                    chunk_index = len(remaining_data)
                    current_chunk = np.zeros(self.chunk_size, dtype=np.float32)
                    current_chunk[:chunk_index] = remaining_data
                
                # If chunk is full, add to buffer
                if chunk_index >= self.chunk_size:
                    self.replay_buffer.add_chunk(current_chunk)
                    current_chunk = np.zeros(self.chunk_size, dtype=np.float32)
                    chunk_index = 0
                    
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Error processing audio: {e}")
                break
    
    
    def start(self):
        """Start recording."""
        if self.is_recording:
            print("Already recording!")
            return
        
        self.is_recording = True
        
        # Use Stream (combined input/output) if relaying, otherwise just InputStream
        if self.relay_to_speakers:
            self.stream = sd.Stream(
                samplerate=self.sample_rate,
                channels=self.channels,
                callback=self._audio_callback,
                blocksize=self.chunk_size,
                dtype=np.float32
            )
        else:
            # For input-only, we need a wrapper callback
            def input_only_callback(indata, frames, time, status):
                self._audio_callback(indata, None, frames, time, status)
            
            self.stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                callback=input_only_callback,
                blocksize=self.chunk_size,
                dtype=np.float32
            )
        
        self.stream.start()
        
        # Start processing thread
        self.recording_thread = threading.Thread(target=self._process_audio, daemon=True)
        self.recording_thread.start()
        
        print(f"Recording started (sample_rate={self.sample_rate}, chunk_size={self.chunk_size}, "
              f"buffer_size={self.replay_buffer.num_chunks} chunks)")
        if self.relay_to_speakers:
            print("Relay to speakers: ENABLED")
    
    def stop(self):
        """Stop recording."""
        if not self.is_recording:
            print("Not recording!")
            return
        
        self.is_recording = False
        
        # Stop stream
        if self.stream is not None:
            self.stream.stop()
            self.stream.close()
        
        # Wait for threads to finish
        if self.recording_thread:
            self.recording_thread.join(timeout=1.0)
        
        print("Recording stopped")
    
    def get_buffer_status(self):
        """Get status information about the replay buffer."""
        return {
            "num_chunks": self.replay_buffer.get_size(),
            "max_chunks": self.replay_buffer.num_chunks,
            "chunk_size": self.chunk_size,
            "is_full": self.replay_buffer.is_full(),
            "total_samples": self.replay_buffer.get_size() * self.chunk_size,
            "total_duration_seconds": (self.replay_buffer.get_size() * self.chunk_size) / self.sample_rate
        }


def main():
    """Main function to run the audio recorder."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Real-time microphone recorder with replay buffer")
    parser.add_argument("--sample-rate", type=int, default=44100, help="Sample rate (default: 44100)")
    parser.add_argument("--chunk-size", type=int, default=2048, help="Chunk size in samples (default: 2048)")
    parser.add_argument("--num-chunks", type=int, default=64, help="Number of chunks in buffer (default: 64)")
    parser.add_argument("--channels", type=int, default=1, help="Number of audio channels (default: 1)")
    parser.add_argument("--relay-to-speakers", action="store_true", help="Enable relay to speakers")
    parser.add_argument("--duration", type=float, default=None, help="Record for specified duration in seconds (default: infinite)")
    
    args = parser.parse_args()
    
    # Create recorder
    recorder = AudioRecorder(
        sample_rate=args.sample_rate,
        chunk_size=args.chunk_size,
        num_chunks=args.num_chunks,
        channels=args.channels,
        relay_to_speakers=args.relay_to_speakers
    )
    
    try:
        # Start recording
        recorder.start()
        
        # Print status periodically
        import time
        start_time = time.time()
        
        while True:
            time.sleep(2.0)
            status = recorder.get_buffer_status()
            elapsed = time.time() - start_time
            print(f"\n[Elapsed: {elapsed:.1f}s] Buffer: {status['num_chunks']}/{status['max_chunks']} chunks "
                  f"({status['total_duration_seconds']:.2f}s), Full: {status['is_full']}")
            
            # Check if duration limit reached
            if args.duration and elapsed >= args.duration:
                print(f"\nDuration limit ({args.duration}s) reached, stopping...")
                break
            
    except KeyboardInterrupt:
        print("\nInterrupted by user")
    finally:
        recorder.stop()
        print("\nFinal buffer status:", recorder.get_buffer_status())


if __name__ == "__main__":
    main()

