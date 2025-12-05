mod audio;
mod viewport;

use anyhow::Result;
use hackrfone::HackRfOne;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
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
        if let Err(e) = audio::run_audio_thread(audio_receiver_clone, audio_enabled_state_clone, audio_running) {
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
