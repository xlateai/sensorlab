use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

const AUDIO_SAMPLE_RATE: u32 = 44100;
const BUFFER_SIZE: usize = 8192; // Larger buffer to prevent underruns
const MIN_BUFFER_BEFORE_START: usize = 2048; // Pre-fill buffer before starting

pub fn run_audio_thread(
    receiver: mpsc::Receiver<f32>,
    audio_enabled: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
) -> Result<()> {
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
    
    // Get supported config - we need to keep this for recreating streams
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
    
    // Get sample format - we need this for recreating streams
    let sample_format = supported_config.sample_format();
    
    // Shared buffer for audio samples (thread-safe)
    let sample_buffer = Arc::new(Mutex::new(Vec::<f32>::new()));
    
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
    
    let mut stream_opt: Option<cpal::Stream> = None;
    
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
            
            // Start audio stream - create a new one each time
            println!("Starting audio stream (buffer has {} samples)...", buffer_size_before);
            println!("Audio sample format: {:?}", sample_format);
            let sample_buffer_for_callback = Arc::clone(&sample_buffer);
            
            // Create a new stream - we can do this because device and config are still available
            let stream_result = match sample_format {
                SampleFormat::F32 => {
                    device.build_output_stream(
                        &config,
                        {
                            let sample_buffer_for_callback = Arc::clone(&sample_buffer_for_callback);
                            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                                let mut buf = sample_buffer_for_callback.lock().unwrap();
                                for output_sample in data.iter_mut() {
                                    if !buf.is_empty() {
                                        *output_sample = buf.remove(0); // FIFO - remove from front
                                    } else {
                                        *output_sample = 0.0; // Silence if no samples available
                                    }
                                }
                            }
                        },
                        |err| eprintln!("Audio stream error: {}", err),
                        None,
                    )
                }
                SampleFormat::I16 => {
                    device.build_output_stream(
                        &config,
                        {
                            let sample_buffer_for_callback = Arc::clone(&sample_buffer_for_callback);
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
                            }
                        },
                        |err| eprintln!("Audio stream error: {}", err),
                        None,
                    )
                }
                SampleFormat::U16 => {
                    device.build_output_stream(
                        &config,
                        {
                            let sample_buffer_for_callback = Arc::clone(&sample_buffer_for_callback);
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
                            }
                        },
                        |err| eprintln!("Audio stream error: {}", err),
                        None,
                    )
                }
                _ => return Err(anyhow::anyhow!("Unsupported sample format")),
            };
            
            match stream_result {
                Ok(stream) => {
                    stream.play()?;
                    stream_opt = Some(stream);
                    println!("Audio stream started successfully.");
                }
                Err(e) => {
                    eprintln!("Failed to create audio stream: {}", e);
                    // Don't set stream_opt, so we'll try again next iteration
                }
            }
        } else if !should_be_enabled && stream_opt.is_some() {
            // Stop audio stream by dropping it
            println!("Stopping audio stream...");
            if let Some(stream) = stream_opt.take() {
                drop(stream); // Explicitly drop to stop playback
            }
            // Don't clear the buffer - keep samples for next start
            // sample_buffer.lock().unwrap().clear();
            println!("Audio stream stopped.");
        }
        
        thread::sleep(Duration::from_millis(100));
    }
    
    Ok(())
}

