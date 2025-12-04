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
    
    // Create running flag for HackRF thread
    let running = Arc::new(AtomicBool::new(true));
    let running_clone = running.clone();
    
    // Spawn HackRF reading in a background thread
    // (On macOS, the main thread must run the event loop)
    let radio_rx = radio.into_rx_mode()?;
    let print_interval = Duration::from_secs_f64(1.0 / print_rate_hz as f64);
    
    thread::spawn(move || {
        let mut radio_rx = radio_rx;
        let mut last_print_time = Instant::now();
        let mut sample_count = 0u64;
        
        while running_clone.load(Ordering::SeqCst) {
            // Read samples from HackRF
            match radio_rx.rx() {
                Ok(samples) => {
                    // Check if it's time to print
                    let now = Instant::now();
                    if now.duration_since(last_print_time) >= print_interval {
                        // Extract I values from samples and send to viewport
                        for chunk in samples.chunks_exact(2) {
                            let i_val = (chunk[0] as i8) as f32 / 128.0;
                            let _q_val = (chunk[1] as i8) as f32 / 128.0;
                            
                            // Send I value to viewport
                            let _ = i_sender.send(i_val);
                        }
                        
                        // Print first IQ pair for console output
                        if samples.len() >= 2 {
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
    viewport::run_viewport(i_receiver, running)?;
    
    println!("HackRF device closed.");
    Ok(())
}
