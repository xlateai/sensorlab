mod viewport;

use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate, StreamConfig};
use hackrfone::HackRfOne;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

fn main() -> Result<()> {
    println!("Opening HackRF device...");
    
    // Open the first available HackRF device
    let mut radio = HackRfOne::new()
        .ok_or_else(|| anyhow::anyhow!("No HackRF device found"))?;
    
    // Configuration
    let sample_rate_hz = 1_000_000; // 1 MHz RF sample rate
    let center_freq_hz = 1_000_000; // 100_000_000; // 100 MHz center frequency
    let print_rate_hz = 60; // Print 60 IQ pairs per second
    let lna_gain_db = 16;
    let vga_gain_db = 20;
    
    println!("HackRF configured:");
    println!("  Sample rate: {:.2} MHz", sample_rate_hz as f64 / 1e6);
    println!("  Center frequency: {:.2} MHz", center_freq_hz as f64 / 1e6);
    println!("  LNA gain: {} dB", lna_gain_db);
    println!("  VGA gain: {} dB", vga_gain_db);
    println!("  Printing IQ pairs at {} Hz", print_rate_hz);
    
    // Configure the device BEFORE entering RX mode
    radio.set_freq(center_freq_hz)?;
    radio.set_sample_rate(sample_rate_hz, 1)?; // hz and divisor (1 = no division)
    radio.set_lna_gain(lna_gain_db)?;
    radio.set_vga_gain(vga_gain_db)?;
    radio.set_amp_enable(true)?;
    
    println!("\nStarting stream... (Press Ctrl+C to stop)\n");
    
    // Create channel for sending I values to viewport
    let (i_sender, i_receiver) = mpsc::channel();
    
    // Create channel for audio samples (I values as f32)
    let (audio_sender, audio_receiver) = mpsc::channel::<f32>();
    
    // Create channel for audio enable/disable state
    let (audio_enabled_sender, audio_enabled_receiver) = mpsc::channel();
    
    // Create running flag for HackRF thread
    let running = Arc::new(AtomicBool::new(true));
    let running_clone = running.clone();
    
    // Audio configuration
    const AUDIO_SAMPLE_RATE: u32 = 44100;
    const RF_SAMPLE_RATE: u32 = 1_000_000;
    // Downsample factor: take every Nth sample from RF stream
    // 1,000,000 / 44,100 ≈ 22.675, so we'll use 23 to get closer to target rate
    let downsample_factor = ((RF_SAMPLE_RATE as f64 / AUDIO_SAMPLE_RATE as f64).round() as usize).max(1);
    println!("Audio downsample factor: {} (RF {} Hz -> Audio {} Hz)", 
             downsample_factor, RF_SAMPLE_RATE, AUDIO_SAMPLE_RATE);
    
    // Spawn audio playback thread
    let audio_running = Arc::clone(&running);
    let audio_receiver_clone = audio_receiver;
    let audio_enabled_state = Arc::new(AtomicBool::new(false));
    let audio_enabled_state_clone = Arc::clone(&audio_enabled_state);
    
    thread::spawn(move || {
        if let Err(e) = run_audio_thread(audio_receiver_clone, audio_enabled_state_clone, audio_running) {
            eprintln!("Audio thread error: {}", e);
        }
    });
    
    // Spawn thread to handle audio state changes
    let audio_enabled_state_for_handler = Arc::clone(&audio_enabled_state);
    thread::spawn(move || {
        while let Ok(enabled) = audio_enabled_receiver.recv() {
            audio_enabled_state_for_handler.store(enabled, Ordering::SeqCst);
            if enabled {
                println!("Audio playback enabled");
            } else {
                println!("Audio playback disabled");
            }
        }
    });
    
    // Spawn HackRF reading in a background thread
    // (On macOS, the main thread must run the event loop)
    let radio_rx = radio.into_rx_mode()?;
    let print_interval = Duration::from_secs_f64(1.0 / print_rate_hz as f64);
    let audio_enabled_for_rf = Arc::clone(&audio_enabled_state);
    
    thread::spawn(move || {
        let mut radio_rx = radio_rx;
        let mut last_print_time = Instant::now();
        let mut sample_count = 0u64;
        let mut downsample_counter = 0usize;
        let audio_sender = audio_sender; // Move sender into thread
        
        while running_clone.load(Ordering::SeqCst) {
            // Read samples from HackRF
            match radio_rx.rx() {
                Ok(samples) => {
                    // Check if it's time to print
                    let now = Instant::now();
                    let should_print = now.duration_since(last_print_time) >= print_interval;
                    
                    // Process all samples
                    for (idx, chunk) in samples.chunks_exact(2).enumerate() {
                        let i_val = (chunk[0] as i8) as f32 / 128.0;
                        let _q_val = (chunk[1] as i8) as f32 / 128.0;
                        
                        // Send I value to viewport (throttled by print rate)
                        if should_print {
                            let _ = i_sender.send(i_val);
                        }
                        
                        // Send to audio (downsampled) if audio is enabled
                        if audio_enabled_for_rf.load(Ordering::SeqCst) {
                            if downsample_counter == 0 {
                                // Amplify the sample for better audibility (HackRF samples are typically small)
                                // Reduced amplification to prevent clipping/crackling
                                let amplified = i_val * 5.0; // Amplify by 5x (reduced from 10x)
                                let clamped = amplified.max(-1.0).min(1.0); // Clamp to valid range
                                // Send this sample
                                if audio_sender.send(clamped).is_err() {
                                    // Receiver dropped, audio thread stopped
                                    break;
                                }
                            }
                            downsample_counter = (downsample_counter + 1) % downsample_factor;
                        }
                    }
                    
                    // Print first IQ pair for console output
                    if should_print && samples.len() >= 2 {
                        let i_val = (samples[0] as i8) as f32 / 128.0;
                        let q_val = (samples[1] as i8) as f32 / 128.0;
                        let magnitude = (i_val * i_val + q_val * q_val).sqrt();
                        let phase = q_val.atan2(i_val);
                        
                        println!(
                            "IQ[{}]: I={:+.6}, Q={:+.6}, Magnitude={:.6}, Phase={:.6} rad",
                            sample_count, i_val, q_val, magnitude, phase
                        );
                        
                        sample_count += 1;
                        last_print_time = now;
                    }
                }
                Err(e) => {
                    eprintln!("Error reading from HackRF: {}", e);
                    break;
                }
            }
        }
        
        // Clean up
        let _ = radio_rx.stop_rx();
        println!("HackRF reading thread stopped.");
    });
    
    // Handle Ctrl+C gracefully
    let r = running.clone();
    ctrlc::set_handler(move || {
        println!("\n\nStopping stream...");
        r.store(false, Ordering::SeqCst);
    })?;
    
    // Run viewport on main thread (required on macOS)
    println!("Starting viewport on main thread...");
    viewport::run_viewport(i_receiver, running, audio_enabled_sender)?;
    
    println!("HackRF device closed.");
    Ok(())
}

fn run_audio_thread(
    receiver: mpsc::Receiver<f32>,
    audio_enabled: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
) -> Result<()> {
    const AUDIO_SAMPLE_RATE: u32 = 44100;
    
    let host = cpal::default_host();
    
    // List available devices for debugging
    let devices: Vec<_> = host.output_devices()?.collect();
    println!("Available audio output devices:");
    for (idx, dev) in devices.iter().enumerate() {
        if let Ok(name) = dev.name() {
            println!("  {}: {}", idx, name);
        }
    }
    
    let device = host
        .default_output_device()
        .ok_or_else(|| anyhow::anyhow!("No audio output device found"))?;
    
    let device_name = device.name()?;
    println!("Using audio device: {}", device_name);
    
    // Get supported config
    let supported_config = device.default_output_config()?;
    println!("Audio config: {:?}, sample rate: {:?}", supported_config, supported_config.sample_rate());
    
    // Use the device's preferred config, but try to set our desired sample rate
    let mut config = supported_config.config();
    
    // Try to use our desired sample rate, or fall back to device default
    if config.sample_rate.0 != AUDIO_SAMPLE_RATE {
        // Try to set our desired sample rate
        config.sample_rate = SampleRate(AUDIO_SAMPLE_RATE);
    }
    
    println!("Audio stream config: channels={}, sample_rate={:?}, buffer_size={:?}", 
             config.channels, config.sample_rate, config.buffer_size);
    
    // Shared buffer for audio samples (thread-safe)
    let sample_buffer = Arc::new(Mutex::new(Vec::<f32>::new()));
    const BUFFER_SIZE: usize = 8192; // Larger buffer to prevent underruns
    const MIN_BUFFER_BEFORE_START: usize = 2048; // Pre-fill buffer before starting
    
    let mut stream_opt: Option<cpal::Stream> = None;
    
    // Sample collection thread
    let sample_buffer_clone = Arc::clone(&sample_buffer);
    let running_clone = Arc::clone(&running);
    thread::spawn(move || {
        let mut samples_received = 0u64;
        while running_clone.load(Ordering::SeqCst) {
            // Collect samples from receiver (blocking wait for better throughput)
            match receiver.recv_timeout(Duration::from_millis(100)) {
                Ok(sample) => {
                    let mut buf = sample_buffer_clone.lock().unwrap();
                    buf.push(sample);
                    samples_received += 1;
                    
                    // Keep buffer size reasonable
                    if buf.len() > BUFFER_SIZE * 2 {
                        buf.drain(0..BUFFER_SIZE);
                    }
                    
                    // Debug: print every 1000 samples
                    if samples_received % 1000 == 0 {
                        println!("Audio: received {} samples, buffer size: {}", samples_received, buf.len());
                    }
                }
                Err(_) => {
                    // Timeout - continue checking
                }
            }
        }
    });
    
    while running.load(Ordering::SeqCst) {
        // Check if audio should be enabled
        let should_be_enabled = audio_enabled.load(Ordering::SeqCst);
        
        if should_be_enabled && stream_opt.is_none() {
            // Wait for buffer to fill before starting
            let buffer = sample_buffer.lock().unwrap();
            if buffer.len() < MIN_BUFFER_BEFORE_START {
                drop(buffer);
                thread::sleep(Duration::from_millis(50));
                continue; // Check again next iteration
            }
            let buffer_size_before = buffer.len();
            drop(buffer);
            
            // Start audio stream
            println!("Starting audio stream (buffer has {} samples)...", buffer_size_before);
            let sample_format = device.default_output_config()?.sample_format();
            println!("Audio sample format: {:?}", sample_format);
            let sample_buffer_for_callback = Arc::clone(&sample_buffer);
            
            let stream = match sample_format {
                SampleFormat::F32 => {
                    let stream = device.build_output_stream(
                        &config,
                        move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                            let mut buf = sample_buffer_for_callback.lock().unwrap();
                            for output_sample in data.iter_mut() {
                                if !buf.is_empty() {
                                    *output_sample = buf.remove(0); // FIFO - remove from front
                                } else {
                                    *output_sample = 0.0; // Silence if no samples available
                                }
                            }
                        },
                        |err| eprintln!("Audio stream error: {}", err),
                        None,
                    )?;
                    Some(stream)
                }
                SampleFormat::I16 => {
                    let stream = device.build_output_stream(
                        &config,
                        move |data: &mut [i16], _: &cpal::OutputCallbackInfo| {
                            let mut buf = sample_buffer_for_callback.lock().unwrap();
                            for output_sample in data.iter_mut() {
                                if !buf.is_empty() {
                                    let sample = buf.remove(0); // FIFO - remove from front
                                    // Convert f32 [-1.0, 1.0] to i16
                                    *output_sample = (sample * i16::MAX as f32) as i16;
                                } else {
                                    *output_sample = 0; // Silence if no samples available
                                }
                            }
                        },
                        |err| eprintln!("Audio stream error: {}", err),
                        None,
                    )?;
                    Some(stream)
                }
                SampleFormat::U16 => {
                    let stream = device.build_output_stream(
                        &config,
                        move |data: &mut [u16], _: &cpal::OutputCallbackInfo| {
                            let mut buf = sample_buffer_for_callback.lock().unwrap();
                            for output_sample in data.iter_mut() {
                                if !buf.is_empty() {
                                    let sample = buf.remove(0); // FIFO - remove from front
                                    // Convert f32 [-1.0, 1.0] to u16
                                    *output_sample = ((sample + 1.0) * u16::MAX as f32 / 2.0) as u16;
                                } else {
                                    *output_sample = u16::MAX / 2; // Silence if no samples available
                                }
                            }
                        },
                        |err| eprintln!("Audio stream error: {}", err),
                        None,
                    )?;
                    Some(stream)
                }
                _ => return Err(anyhow::anyhow!("Unsupported sample format")),
            };
            
            if let Some(s) = stream {
                s.play()?;
                stream_opt = Some(s);
            }
        } else if !should_be_enabled && stream_opt.is_some() {
            // Stop audio stream by dropping it
            println!("Stopping audio stream...");
            if let Some(stream) = stream_opt.take() {
                drop(stream); // Explicitly drop to stop playback
            }
            sample_buffer.lock().unwrap().clear();
            println!("Audio stream stopped.");
        }
        
        thread::sleep(Duration::from_millis(100));
    }
    
    Ok(())
}
