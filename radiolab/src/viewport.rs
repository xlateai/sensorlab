use anyhow::Result;
use pixels::{Pixels, SurfaceTexture};
use std::sync::atomic::AtomicBool;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use winit::application::ApplicationHandler;
use winit::event::{ElementState, MouseButton, WindowEvent};
use winit::event_loop::{ActiveEventLoop, EventLoop};
use winit::window::{Window, WindowId};

const WINDOW_WIDTH: u32 = 800;
const WINDOW_HEIGHT: u32 = 600;
const WAVEFORM_COLOR: [u8; 4] = [0, 255, 0, 255]; // Green
const BACKGROUND_COLOR: [u8; 4] = [0, 0, 0, 255]; // Black
const GRID_COLOR: [u8; 4] = [64, 64, 64, 255]; // Dark gray
const TEXT_COLOR: [u8; 4] = [200, 200, 200, 255]; // Light gray
const CHECKBOX_COLOR: [u8; 4] = [255, 255, 255, 255]; // White for checkbox border
const CHECKBOX_CHECKED_COLOR: [u8; 4] = [0, 255, 0, 255]; // Green for checked fill

// Checkbox dimensions and position
const CHECKBOX_SIZE: u32 = 20; // Made slightly larger for easier clicking
const CHECKBOX_X: u32 = 10;
const CHECKBOX_Y: u32 = 10;
const CHECKBOX_LABEL_X: u32 = CHECKBOX_X + CHECKBOX_SIZE + 5;

// Slider dimensions and position
const SLIDER_X: u32 = 10;
const SLIDER_Y: u32 = 35;
const SLIDER_WIDTH: u32 = 300;
const SLIDER_HEIGHT: u32 = 20;
const SLIDER_TRACK_HEIGHT: u32 = 4;
const SLIDER_HANDLE_SIZE: u32 = 16;
const SLIDER_MIN_FREQ_HZ: u64 = 1_000_000; // 1 MHz
const SLIDER_MAX_FREQ_HZ: u64 = 6_000_000_000; // 6 GHz

pub fn run_viewport(
    receiver: mpsc::Receiver<f32>, 
    running: Arc<AtomicBool>, 
    audio_enabled_sender: mpsc::Sender<bool>,
    freq_sender: mpsc::Sender<u64>,
    initial_freq: u64,
) -> Result<()> {
    println!("Creating event loop on main thread...");
    let event_loop = EventLoop::new()?;
    println!("Event loop created, starting application...");
    
    // Send initial state (off) to audio thread
    let _ = audio_enabled_sender.send(false);
    
    // Calculate initial slider position from frequency
    let initial_slider_pos = frequency_to_slider_position(initial_freq);
    
    let mut app = ViewportApp { 
        receiver, 
        state: None,
        i_values: Arc::new(Mutex::new(Vec::new())),
        max_samples: WINDOW_WIDTH as usize,
        running,
        audio_enabled: false, // Default is off
        audio_enabled_sender,
        cursor_pos: (0.0, 0.0),
        freq_sender,
        slider_position: initial_slider_pos,
        is_dragging_slider: false,
        current_freq: initial_freq,
    };
    
    event_loop.run_app(&mut app)?;
    Ok(())
}

struct ViewportState {
    window: Window,
    pixels: Pixels<'static>, // Lifetime tied to window via SurfaceTexture
}

struct ViewportApp {
    receiver: mpsc::Receiver<f32>,
    state: Option<ViewportState>,
    i_values: Arc<Mutex<Vec<f32>>>,
    max_samples: usize,
    running: Arc<AtomicBool>,
    audio_enabled: bool,
    audio_enabled_sender: mpsc::Sender<bool>,
    cursor_pos: (f64, f64),
    freq_sender: mpsc::Sender<u64>,
    slider_position: f32, // 0.0 to 1.0
    is_dragging_slider: bool,
    current_freq: u64,
}

impl ApplicationHandler for ViewportApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        println!("Application resumed, creating window...");
        if self.state.is_none() {
            let window_attributes = winit::window::Window::default_attributes()
                .with_title("HackRF I-Value Waveform")
                .with_inner_size(winit::dpi::LogicalSize::new(WINDOW_WIDTH, WINDOW_HEIGHT))
                .with_resizable(true);

            println!("Creating window with attributes...");
            let window = match event_loop.create_window(window_attributes) {
                Ok(w) => {
                    println!("Window created successfully!");
                    w
                }
                Err(e) => {
                    eprintln!("Failed to create window: {}", e);
                    return;
                }
            };
            let window_size = window.inner_size();
            let surface_texture = SurfaceTexture::new(window_size.width, window_size.height, &window);

            // Create pixels - lifetime is tied to surface_texture which is tied to window
            let pixels = Pixels::new(WINDOW_WIDTH, WINDOW_HEIGHT, surface_texture).unwrap();

            let i_values_clone = Arc::clone(&self.i_values);
            let max_samples = self.max_samples;
            let receiver = std::mem::replace(&mut self.receiver, mpsc::channel().1);

            // Spawn a thread to receive I values and update the buffer
            std::thread::spawn(move || {
                while let Ok(i_val) = receiver.recv() {
                    let mut values = i_values_clone.lock().unwrap();
                    values.push(i_val);
                    // Keep only the last max_samples values
                    if values.len() > max_samples {
                        values.remove(0);
                    }
                }
            });

            // Store window and pixels together - the lifetime is managed by keeping window alive
            // We use unsafe to extend the lifetime since we guarantee window outlives pixels
            unsafe {
                let pixels_static: Pixels<'static> = std::mem::transmute(pixels);
                self.state = Some(ViewportState {
                    window,
                    pixels: pixels_static,
                });
            }

            if let Some(state) = &self.state {
                println!("Requesting initial redraw...");
                state.window.request_redraw();
            }
            println!("Window setup complete!");
        } else {
            println!("Window already exists, skipping creation");
        }
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _window_id: WindowId, event: WindowEvent) {
            match event {
                WindowEvent::CloseRequested => {
                    use std::sync::atomic::Ordering;
                    self.running.store(false, Ordering::SeqCst);
                    event_loop.exit();
                }
            WindowEvent::RedrawRequested => {
                if let Some(state) = &mut self.state {
                    if let Err(e) = Self::render_internal(state, &self.i_values, self.audio_enabled, self.slider_position, self.current_freq) {
                        eprintln!("Error rendering: {}", e);
                    }
                    // Request another redraw for continuous updates
                    state.window.request_redraw();
                }
            }
            WindowEvent::Resized(size) => {
                if let Some(state) = &mut self.state {
                    state.pixels.resize_surface(size.width, size.height).ok();
                    state.window.request_redraw();
                }
            }
            WindowEvent::MouseInput { state: button_state, button: MouseButton::Left, .. } => {
                if let Some(state) = &self.state {
                    // Convert physical position to logical position
                    let scale_factor = state.window.scale_factor();
                    let logical_x = self.cursor_pos.0 / scale_factor;
                    let logical_y = self.cursor_pos.1 / scale_factor;
                    
                    let x = logical_x as u32;
                    let y = logical_y as u32;
                    
                    if button_state == ElementState::Pressed {
                        // Check if click is within checkbox bounds
                        if x >= CHECKBOX_X && x < CHECKBOX_X + CHECKBOX_SIZE &&
                           y >= CHECKBOX_Y && y < CHECKBOX_Y + CHECKBOX_SIZE {
                            // Toggle checkbox
                            self.audio_enabled = !self.audio_enabled;
                            println!("Checkbox toggled to: {}", self.audio_enabled);
                            // Send state change to main thread
                            let _ = self.audio_enabled_sender.send(self.audio_enabled);
                            // Request redraw to update checkbox
                            state.window.request_redraw();
                        }
                        // Check if click is within slider bounds
                        else if x >= SLIDER_X && x < SLIDER_X + SLIDER_WIDTH &&
                                y >= SLIDER_Y && y < SLIDER_Y + SLIDER_HEIGHT {
                            // Start dragging slider
                            self.is_dragging_slider = true;
                            // Get window reference before updating
                            let window = &state.window;
                            drop(state); // Drop the borrow
                            self.update_slider_from_position(x);
                            // Request redraw
                            if let Some(state) = &self.state {
                                state.window.request_redraw();
                            }
                        }
                    } else if button_state == ElementState::Released {
                        // Stop dragging
                        if self.is_dragging_slider {
                            self.is_dragging_slider = false;
                        }
                    }
                }
            }
            WindowEvent::CursorMoved { position, .. } => {
                // Store cursor position for click detection (physical pixels)
                self.cursor_pos = (position.x, position.y);
                
                // Update slider if dragging
                if self.is_dragging_slider {
                    if let Some(state) = &self.state {
                        let scale_factor = state.window.scale_factor();
                        let logical_x = position.x / scale_factor;
                        let x = logical_x as u32;
                        drop(state); // Drop the borrow before mutating self
                        self.update_slider_from_position(x);
                        // Request redraw
                        if let Some(state) = &self.state {
                            state.window.request_redraw();
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

impl ViewportApp {
    fn update_slider_from_position(&mut self, x: u32) {
        // Clamp x to slider bounds
        let x_clamped = x.max(SLIDER_X).min(SLIDER_X + SLIDER_WIDTH);
        let relative_x = (x_clamped - SLIDER_X) as f32;
        let slider_range = SLIDER_WIDTH as f32;
        
        // Update slider position (0.0 to 1.0)
        self.slider_position = (relative_x / slider_range).max(0.0).min(1.0);
        
        // Calculate frequency from slider position (logarithmic scale for better control)
        let freq = slider_position_to_frequency(self.slider_position);
        self.current_freq = freq;
        
        // Send frequency update
        if self.freq_sender.send(freq).is_ok() {
            println!("Frequency updated to: {:.3} MHz", freq as f64 / 1e6);
        }
    }
    
    fn render_internal(
        state: &mut ViewportState, 
        i_values: &Arc<Mutex<Vec<f32>>>, 
        audio_enabled: bool,
        slider_position: f32,
        current_freq: u64,
    ) -> Result<()> {
        let pixels = &mut state.pixels;
        let frame = pixels.frame_mut();

        // Clear to background color
        for pixel in frame.chunks_exact_mut(4) {
            pixel.copy_from_slice(&BACKGROUND_COLOR);
        }

        // Draw grid lines (center line and quarter lines)
        let center_y = WINDOW_HEIGHT / 2;
        let quarter_y = WINDOW_HEIGHT / 4;
        let three_quarter_y = 3 * WINDOW_HEIGHT / 4;

        for x in 0..WINDOW_WIDTH {
            let idx_center = (center_y * WINDOW_WIDTH + x) as usize * 4;
            let idx_quarter = (quarter_y * WINDOW_WIDTH + x) as usize * 4;
            let idx_three_quarter = (three_quarter_y * WINDOW_WIDTH + x) as usize * 4;

            if idx_center < frame.len() {
                frame[idx_center..idx_center + 4].copy_from_slice(&GRID_COLOR);
            }
            if idx_quarter < frame.len() {
                frame[idx_quarter..idx_quarter + 4].copy_from_slice(&GRID_COLOR);
            }
            if idx_three_quarter < frame.len() {
                frame[idx_three_quarter..idx_three_quarter + 4].copy_from_slice(&GRID_COLOR);
            }
        }

            // Draw waveform
            let values = i_values.lock().unwrap();
            if values.len() >= 2 {
                let width = values.len().min(WINDOW_WIDTH as usize);
                let height = WINDOW_HEIGHT as usize;

                // Calculate normalization from last 128 samples (same as TypeScript buffer)
                let normalization_samples = 128;
                let recent_values = if values.len() >= normalization_samples {
                    &values[values.len() - normalization_samples..]
                } else {
                    &values[..]
                };
                
                // Find min and max in recent samples for normalization (critical: use actual min/max, not mean±std)
                let (v_min, v_max) = recent_values.iter()
                    .fold((f32::MAX, f32::MIN), |(min, max), &val| {
                        (min.min(val), max.max(val))
                    });
                
                // Calculate range - use minimum to avoid division by zero (same as TypeScript Math.max(0.001, ...))
                let value_range = (v_max - v_min).max(0.001);
                
                // Find min and max in displayed samples for labels
                let displayed_values = &values[..width];
                let (display_min, display_max) = displayed_values.iter()
                    .fold((f32::MAX, f32::MIN), |(min, max), &val| {
                        (min.min(val), max.max(val))
                    });
                
                // Use most of the vertical space - from quarter to three-quarter lines
                let quarter_y = (height / 4) as u32;
                let three_quarter_y = (3 * height / 4) as u32;
                let plot_height = (three_quarter_y - quarter_y) as f32;
                let plot_bottom = three_quarter_y as f32;

                for i in 0..(width - 1) {
                    let x1 = i as u32;
                    let x2 = (i + 1) as u32;

                    // Normalize using the same formula as ThreeAxisPlot.tsx:
                    // y = height - ((value - vMin) / range) * height
                    // This maps [vMin, vMax] to [height, 0] (inverted Y, high values at top)
                    let normalized1 = (values[i] - v_min) / value_range;
                    let normalized2 = (values[i + 1] - v_min) / value_range;
                    
                    // Map to plot area (between quarter and three-quarter lines)
                    // Invert: plot_bottom is at bottom, so subtract normalized value
                    let y1 = (plot_bottom - normalized1 * plot_height) as u32;
                    let y2 = (plot_bottom - normalized2 * plot_height) as u32;

                    // Clamp to plot area
                    let y1 = y1.max(quarter_y).min(three_quarter_y);
                    let y2 = y2.max(quarter_y).min(three_quarter_y);

                    // Draw line between two points
                    Self::draw_line(frame, x1, y1, x2, y2);
                }

                // Draw min and max labels using displayed values
                let label_x = 10u32; // Left margin
                let max_label_y = quarter_y - 25; // Above the top of the plot
                let min_label_y = three_quarter_y + 15; // Below the bottom of the plot
                
                Self::draw_text(frame, &format!("max: {:.4}", display_max), label_x, max_label_y);
                Self::draw_text(frame, &format!("min: {:.4}", display_min), label_x, min_label_y);
            }

        // Draw checkbox
        Self::draw_checkbox(frame, audio_enabled);
        
        // Draw frequency slider
        Self::draw_slider(frame, slider_position, current_freq);

        pixels.render()?;
        Ok(())
    }
    
    fn draw_slider(frame: &mut [u8], position: f32, freq: u64) {
        // Draw slider track
        let track_y = SLIDER_Y + (SLIDER_HEIGHT - SLIDER_TRACK_HEIGHT) / 2;
        for y in track_y..(track_y + SLIDER_TRACK_HEIGHT) {
            for x in SLIDER_X..(SLIDER_X + SLIDER_WIDTH) {
                let idx = (y * WINDOW_WIDTH + x) as usize * 4;
                if idx < frame.len() {
                    frame[idx..idx + 4].copy_from_slice(&GRID_COLOR);
                }
            }
        }
        
        // Draw slider handle
        let handle_x = SLIDER_X + (position * SLIDER_WIDTH as f32) as u32 - SLIDER_HANDLE_SIZE / 2;
        let handle_x_clamped = handle_x.max(SLIDER_X).min(SLIDER_X + SLIDER_WIDTH - SLIDER_HANDLE_SIZE);
        let handle_y = SLIDER_Y + (SLIDER_HEIGHT - SLIDER_HANDLE_SIZE) / 2;
        
        for y in handle_y..(handle_y + SLIDER_HANDLE_SIZE) {
            for x in handle_x_clamped..(handle_x_clamped + SLIDER_HANDLE_SIZE) {
                let idx = (y * WINDOW_WIDTH + x) as usize * 4;
                if idx < frame.len() {
                    // Draw handle border
                    let is_border = x == handle_x_clamped || x == handle_x_clamped + SLIDER_HANDLE_SIZE - 1 ||
                                    y == handle_y || y == handle_y + SLIDER_HANDLE_SIZE - 1;
                    if is_border {
                        frame[idx..idx + 4].copy_from_slice(&CHECKBOX_COLOR);
                    } else {
                        frame[idx..idx + 4].copy_from_slice(&WAVEFORM_COLOR);
                    }
                }
            }
        }
        
        // Draw frequency label
        let freq_mhz = freq as f64 / 1e6;
        let freq_text = format!("{:.3} MHz", freq_mhz);
        Self::draw_text(frame, &freq_text, SLIDER_X, SLIDER_Y + SLIDER_HEIGHT + 5);
    }

    fn draw_checkbox(frame: &mut [u8], checked: bool) {
        // Draw checkbox border
        for y in CHECKBOX_Y..(CHECKBOX_Y + CHECKBOX_SIZE) {
            for x in CHECKBOX_X..(CHECKBOX_X + CHECKBOX_SIZE) {
                let idx = (y * WINDOW_WIDTH + x) as usize * 4;
                if idx < frame.len() {
                    // Draw border (outer pixels)
                    if x == CHECKBOX_X || x == CHECKBOX_X + CHECKBOX_SIZE - 1 ||
                       y == CHECKBOX_Y || y == CHECKBOX_Y + CHECKBOX_SIZE - 1 {
                        frame[idx..idx + 4].copy_from_slice(&CHECKBOX_COLOR);
                    } else if checked {
                        // Fill with checked color
                        frame[idx..idx + 4].copy_from_slice(&CHECKBOX_CHECKED_COLOR);
                    }
                }
            }
        }
        
        // Draw label
        Self::draw_text(frame, "audio", CHECKBOX_LABEL_X, CHECKBOX_Y + 5);
    }

    fn draw_line(frame: &mut [u8], x1: u32, y1: u32, x2: u32, y2: u32) {
        // Simple line drawing using Bresenham's algorithm
        let dx = (x2 as i32 - x1 as i32).abs();
        let dy = (y2 as i32 - y1 as i32).abs();
        let sx = if x1 < x2 { 1 } else { -1 };
        let sy = if y1 < y2 { 1 } else { -1 };
        let mut err = dx - dy;

        let mut x = x1 as i32;
        let mut y = y1 as i32;

        loop {
            if x >= 0 && x < WINDOW_WIDTH as i32 && y >= 0 && y < WINDOW_HEIGHT as i32 {
                let idx = (y as u32 * WINDOW_WIDTH + x as u32) as usize * 4;
                if idx < frame.len() {
                    frame[idx..idx + 4].copy_from_slice(&WAVEFORM_COLOR);
                }
            }

            if x == x2 as i32 && y == y2 as i32 {
                break;
            }

            let e2 = 2 * err;
            if e2 > -dy {
                err -= dy;
                x += sx;
            }
            if e2 < dx {
                err += dx;
                y += sy;
            }
        }
    }

    fn draw_text(frame: &mut [u8], text: &str, start_x: u32, start_y: u32) {
        // Simple 5x7 bitmap font for digits and basic characters
        const CHAR_WIDTH: u32 = 5;
        const CHAR_HEIGHT: u32 = 7;
        const CHAR_SPACING: u32 = 1;

        // Bitmap patterns for characters (5 bits wide, 7 bits tall)
        // Each character is represented as 7 u8 values (one per row)
        let get_char_bitmap = |c: char| -> Option<[u8; 7]> {
            match c {
                '0' => Some([0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110]),
                '1' => Some([0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110]),
                '2' => Some([0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111]),
                '3' => Some([0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110]),
                '4' => Some([0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010]),
                '5' => Some([0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110]),
                '6' => Some([0b01110, 0b10001, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110]),
                '7' => Some([0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000]),
                '8' => Some([0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110]),
                '9' => Some([0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b10001, 0b01110]),
                '.' => Some([0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100]),
                '-' => Some([0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000]),
                ':' => Some([0b00000, 0b00100, 0b00000, 0b00000, 0b00000, 0b00100, 0b00000]),
                ' ' => Some([0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000]),
                'm' => Some([0b00000, 0b00000, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001]),
                'a' => Some([0b00000, 0b00000, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111]),
                'x' => Some([0b00000, 0b00000, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001]),
                'i' => Some([0b00100, 0b00000, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100]),
                'n' => Some([0b00000, 0b00000, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001]),
                'u' => Some([0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b10001, 0b01111]),
                'd' => Some([0b00000, 0b00000, 0b11110, 0b10001, 0b10001, 0b10001, 0b11110]),
                'o' => Some([0b00000, 0b00000, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110]),
                _ => None,
            }
        };

        let mut x_offset = 0u32;
        for c in text.chars() {
            if let Some(bitmap) = get_char_bitmap(c) {
                for (row, &bits) in bitmap.iter().enumerate() {
                    let y = start_y + row as u32;
                    if y >= WINDOW_HEIGHT {
                        continue;
                    }
                    for col in 0..CHAR_WIDTH {
                        let x = start_x + x_offset + col;
                        if x >= WINDOW_WIDTH {
                            continue;
                        }
                        // Check if bit is set (bits are stored with MSB on left)
                        if (bits >> (CHAR_WIDTH - 1 - col)) & 1 != 0 {
                            let idx = (y * WINDOW_WIDTH + x) as usize * 4;
                            if idx < frame.len() {
                                frame[idx..idx + 4].copy_from_slice(&TEXT_COLOR);
                            }
                        }
                    }
                }
                x_offset += CHAR_WIDTH + CHAR_SPACING;
            }
        }
    }
}

// Helper functions for frequency <-> slider position conversion
// Using logarithmic scale for better control across wide frequency range
fn frequency_to_slider_position(freq: u64) -> f32 {
    let min_log = (SLIDER_MIN_FREQ_HZ as f64).ln();
    let max_log = (SLIDER_MAX_FREQ_HZ as f64).ln();
    let freq_log = (freq as f64).ln();
    
    let position = (freq_log - min_log) / (max_log - min_log);
    position.max(0.0).min(1.0) as f32
}

fn slider_position_to_frequency(position: f32) -> u64 {
    let min_log = (SLIDER_MIN_FREQ_HZ as f64).ln();
    let max_log = (SLIDER_MAX_FREQ_HZ as f64).ln();
    
    let freq_log = min_log + (position as f64) * (max_log - min_log);
    let freq = freq_log.exp();
    
    freq.max(SLIDER_MIN_FREQ_HZ as f64).min(SLIDER_MAX_FREQ_HZ as f64) as u64
}
