"""
HackRF streaming script that reads IQ samples and prints them to console.

Reads from connected HackRF device and prints IQ pairs at 60 samples per second.

Dependencies:
    pip install pyhackrf2 numpy

Note: You may also need to install libhackrf system library:
    macOS: brew install hackrf
    Linux: sudo apt-get install libhackrf-dev
"""

import os
import sys
import time
import numpy as np

# Fix macOS library loading - set library path before importing pyhackrf2
if sys.platform == 'darwin':
    import glob
    
    # Try to find libhackrf in common Homebrew locations
    possible_paths = [
        '/usr/local/Cellar/hackrf/*/lib',
        '/opt/homebrew/Cellar/hackrf/*/lib',
        '/usr/local/lib',
        '/opt/homebrew/lib',
    ]
    
    hackrf_lib_path = None
    for path_pattern in possible_paths:
        matches = glob.glob(path_pattern)
        for lib_path in matches:
            # Check if libhackrf.dylib or libhackrf.0.dylib exists
            if os.path.exists(os.path.join(lib_path, 'libhackrf.dylib')) or \
               os.path.exists(os.path.join(lib_path, 'libhackrf.0.dylib')):
                hackrf_lib_path = lib_path
                break
        if hackrf_lib_path:
            break
    
    if hackrf_lib_path:
        # Set DYLD_LIBRARY_PATH
        os.environ.setdefault('DYLD_LIBRARY_PATH', '')
        if hackrf_lib_path not in os.environ['DYLD_LIBRARY_PATH']:
            os.environ['DYLD_LIBRARY_PATH'] = hackrf_lib_path + ':' + os.environ.get('DYLD_LIBRARY_PATH', '')
        print(f"Found libhackrf at: {hackrf_lib_path}")

try:
    from pyhackrf2 import HackRF
except ImportError:
    print("Error: pyhackrf2 library not found. Install it with: pip install pyhackrf2")
    print("Note: You may also need to install libhackrf system library.")
    exit(1)
except Exception as e:
    if 'dlopen' in str(e) or 'libhackrf' in str(e).lower():
        print(f"Error loading libhackrf library: {e}")
        print("\nOn macOS, try running with DYLD_LIBRARY_PATH set:")
        print("  export DYLD_LIBRARY_PATH=/usr/local/Cellar/hackrf/2024.02.1/lib:$DYLD_LIBRARY_PATH")
        print("  python hackrf_stream.py")
        print("\nOr find your HackRF installation with:")
        print("  brew list hackrf")
    else:
        print(f"Error loading pyhackrf2: {e}")
        import traceback
        traceback.print_exc()
    exit(1)


def stream_hackrf(sample_rate_hz=1000000, center_freq_hz=100000000, 
                  print_rate_hz=60, lna_gain_db=16, vga_gain_db=20):
    """
    Stream IQ samples from HackRF and print them at specified rate.
    
    Note: sample_rate_hz is the RF hardware sample rate (how fast HackRF samples).
          print_rate_hz is just how often we print to console (60 times/sec).
          We still need a reasonable RF sample rate to capture the signal properly,
          even though we only print a subset of samples.
    
    Args:
        sample_rate_hz: RF sample rate in Hz (default 1 MHz - lower is fine for basic streaming)
        center_freq_hz: Center frequency in Hz (default 100 MHz)
        print_rate_hz: Rate to print IQ pairs to console (default 60 per second)
        lna_gain_db: LNA gain in dB, 0-40 in 8dB steps (default 16)
        vga_gain_db: VGA gain in dB, 0-62 in 2dB steps (default 20)
    """
    # Open HackRF device
    try:
        hackrf = HackRF()
    except Exception as e:
        print(f"Error opening HackRF device: {e}")
        print("Make sure your HackRF is connected and drivers are installed.")
        return
    
    # Configure device
    try:
        hackrf.sample_rate = sample_rate_hz
        hackrf.center_freq = center_freq_hz
        hackrf.lna_gain = lna_gain_db
        hackrf.vga_gain = vga_gain_db
        hackrf.amplifier_on = True  # Enable RF amplifier
        
        print(f"HackRF configured:")
        print(f"  Sample rate: {sample_rate_hz / 1e6:.2f} MHz")
        print(f"  Center frequency: {center_freq_hz / 1e6:.2f} MHz")
        print(f"  LNA gain: {lna_gain_db} dB")
        print(f"  VGA gain: {vga_gain_db} dB")
        print(f"  RF amplifier: ON")
        print(f"  Printing IQ pairs at {print_rate_hz} Hz")
        print("\nStarting stream... (Press Ctrl+C to stop)\n")
        
    except Exception as e:
        print(f"Error configuring HackRF: {e}")
        import traceback
        traceback.print_exc()
        hackrf.close()
        return
    
    # Calculate print interval and buffer size
    print_interval = 1.0 / print_rate_hz
    # Read enough samples per iteration to support our print rate
    samples_per_read = max(1024, int(sample_rate_hz / print_rate_hz))
    
    # Start streaming
    try:
        sample_count = 0
        last_print_time = time.time()
        
        while True:
            # Read samples from HackRF
            samples = hackrf.read_samples(samples_per_read)
            
            # Convert to numpy array and handle complex samples
            # HackRF returns samples as complex or interleaved I/Q
            if isinstance(samples, np.ndarray):
                if samples.dtype == np.complex64 or samples.dtype == np.complex128:
                    # Already complex
                    iq_samples = samples
                else:
                    # Interleaved I/Q, convert to complex
                    samples = np.array(samples, dtype=np.int8)
                    i_samples = samples[0::2].astype(np.float32) / 127.0
                    q_samples = samples[1::2].astype(np.float32) / 127.0
                    iq_samples = i_samples + 1j * q_samples
            else:
                # Convert list/bytes to numpy array
                samples = np.frombuffer(samples, dtype=np.int8)
                i_samples = samples[0::2].astype(np.float32) / 127.0
                q_samples = samples[1::2].astype(np.float32) / 127.0
                iq_samples = i_samples + 1j * q_samples
            
            # Print at desired rate
            current_time = time.time()
            if current_time - last_print_time >= print_interval:
                if len(iq_samples) > 0:
                    iq = iq_samples[0]
                    i_val = iq.real
                    q_val = iq.imag
                    magnitude = abs(iq)
                    phase = np.angle(iq)
                    
                    print(f"IQ[{sample_count}]: I={i_val:+.6f}, Q={q_val:+.6f}, "
                          f"Magnitude={magnitude:.6f}, Phase={phase:.6f} rad")
                    sample_count += 1
                    last_print_time = current_time
            
    except KeyboardInterrupt:
        print("\n\nStopping stream...")
    except Exception as e:
        print(f"\nError during streaming: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            hackrf.close()
            print("HackRF device closed.")
        except:
            pass


if __name__ == "__main__":
    # Default configuration - adjust as needed
    # Note: RF sample rate can be lower since we're just printing samples
    # Lower rates use less CPU/bandwidth. Minimum is typically ~1 MHz.
    stream_hackrf(
        sample_rate_hz=1000000,      # 1 MHz RF sample rate (lower than 2 MHz since we only print at 60 Hz)
        center_freq_hz=100000000,    # 100 MHz center frequency
        print_rate_hz=60,            # Print 60 IQ pairs per second
        lna_gain_db=16,              # LNA gain (0-40 dB in 8dB steps)
        vga_gain_db=20               # VGA gain (0-62 dB in 2dB steps)
    )
