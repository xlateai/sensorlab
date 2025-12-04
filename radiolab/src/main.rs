use anyhow::Result;
use seify_hackrfone::{Config, HackRf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
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
    let radio = HackRf::open_first()?;
    
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
    println!("\nStarting stream... (Press Ctrl+C to stop)\n");
    
    // Start receiving
    radio.start_rx(&Config {
        vga_db: vga_gain_db,
        txvga_db: 0,
        lna_db: lna_gain_db,
        amp_enable: true,
        antenna_enable: true,
        frequency_hz: center_freq_hz,
        sample_rate_hz,
        sample_rate_div: 1,
    })?;
    
    // Calculate timing for 60 Hz print rate
    let print_interval = Duration::from_secs_f64(1.0 / print_rate_hz as f64);
    let mut last_print_time = Instant::now();
    
    // Buffer to store received samples
    // HackRF returns interleaved I/Q as int8 values
    // We need enough samples to support our print rate
    let samples_per_read = (sample_rate_hz / print_rate_hz).max(1024) as usize;
    let mut buf = vec![0u8; samples_per_read * 2]; // *2 for I and Q
    
    let mut sample_count = 0u64;
    
    while running.load(Ordering::SeqCst) {
        // Read samples from HackRF
        radio.read(&mut buf)?;
        
        // Check if it's time to print
        let now = Instant::now();
        if now.duration_since(last_print_time) >= print_interval {
            // Extract first IQ pair from buffer
            // HackRF returns interleaved: I, Q, I, Q, ...
            if buf.len() >= 2 {
                let i_val = buf[0] as f32 / 127.0; // Normalize to [-1, 1]
                let q_val = buf[1] as f32 / 127.0; // Normalize to [-1, 1]
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
    
    println!("HackRF device closed.");
    Ok(())
}
