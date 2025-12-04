mod viewport;

use anyhow::Result;
use hackrfone::HackRfOne;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

fn main() -> Result<()> {
    // Handle Ctrl+C gracefully
    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();
    ctrlc::set_handler(move || {
        println!("\n\nStopping stream...");
        r.store(false, Ordering::SeqCst);
    })?;
    println!("Opening HackRF device...");
    
    // Open the first available HackRF device
    let mut radio = HackRfOne::new()
        .ok_or_else(|| anyhow::anyhow!("No HackRF device found"))?;
    
    // Configuration
    let sample_rate_hz = 1_000_000; // 1 MHz RF sample rate
    let center_freq_hz = 100_000_000; // 100 MHz center frequency
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
    
    // Spawn viewport in a separate thread
    thread::spawn(move || {
        if let Err(e) = viewport::run_viewport(i_receiver) {
            eprintln!("Viewport error: {}", e);
        }
    });
    
    // Start receiving - this returns a radio in RxMode
    // hackrfone uses typestates, so we transition to RxMode
    let mut radio_rx = radio.into_rx_mode()?;
    
    // Calculate timing for 60 Hz print rate
    let print_interval = Duration::from_secs_f64(1.0 / print_rate_hz as f64);
    let mut last_print_time = Instant::now();
    
    let mut sample_count = 0u64;
    
    while running.load(Ordering::SeqCst) {
        // Read samples from HackRF
        // rx() returns one MTU of data (interleaved I/Q as signed 8-bit integers)
        let samples = radio_rx.rx()?;
        
        // Check if it's time to print
        let now = Instant::now();
        if now.duration_since(last_print_time) >= print_interval {
            // Extract I values from samples and send to viewport
            // HackRF returns interleaved: I, Q, I, Q, ... as signed 8-bit integers
            for chunk in samples.chunks_exact(2) {
                // Convert unsigned 8-bit to signed 8-bit, then normalize to [-1, 1]
                let i_val = (chunk[0] as i8) as f32 / 128.0;
                let _q_val = (chunk[1] as i8) as f32 / 128.0;
                
                // Send I value to viewport (ignore errors if receiver is closed)
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
    
    // Clean up: stop receiving and return to unknown mode
    let _radio = radio_rx.stop_rx()?;
    println!("HackRF device closed.");
    Ok(())
}
