use anyhow::Result;
use pixels::{Pixels, SurfaceTexture};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, EventLoop};
use winit::window::{Window, WindowId};

const WINDOW_WIDTH: u32 = 800;
const WINDOW_HEIGHT: u32 = 600;
const WAVEFORM_COLOR: [u8; 4] = [0, 255, 0, 255]; // Green
const BACKGROUND_COLOR: [u8; 4] = [0, 0, 0, 255]; // Black
const GRID_COLOR: [u8; 4] = [64, 64, 64, 255]; // Dark gray

pub fn run_viewport(receiver: mpsc::Receiver<f32>) -> Result<()> {
    let event_loop = EventLoop::new()?;
    event_loop.run_app(&mut ViewportApp { 
        receiver, 
        state: None,
        i_values: Arc::new(Mutex::new(Vec::new())),
        max_samples: WINDOW_WIDTH as usize,
    })?;
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
}

impl ApplicationHandler for ViewportApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.state.is_none() {
            let window_attributes = winit::window::Window::default_attributes()
                .with_title("HackRF I-Value Waveform")
                .with_inner_size(winit::dpi::LogicalSize::new(WINDOW_WIDTH, WINDOW_HEIGHT))
                .with_resizable(true);

            let window = event_loop.create_window(window_attributes).unwrap();
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
                state.window.request_redraw();
            }
        }
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _window_id: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => {
                event_loop.exit();
            }
            WindowEvent::RedrawRequested => {
                if let Some(state) = &mut self.state {
                    if let Err(e) = Self::render_internal(state, &self.i_values) {
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
            _ => {}
        }
    }
}

impl ViewportApp {
    fn render_internal(state: &mut ViewportState, i_values: &Arc<Mutex<Vec<f32>>>) -> Result<()> {
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
            let center_y = height / 2;

            for i in 0..(width - 1) {
                let x1 = i as u32;
                let x2 = (i + 1) as u32;

                // Normalize I value from [-1, 1] to [0, height]
                // Invert Y so positive values go up
                let y1 = (center_y as f32 - values[i] * (height as f32 / 2.0)) as u32;
                let y2 = (center_y as f32 - values[i + 1] * (height as f32 / 2.0)) as u32;

                // Draw line between two points
                Self::draw_line(frame, x1, y1, x2, y2);
            }
        }

        pixels.render()?;
        Ok(())
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
}
