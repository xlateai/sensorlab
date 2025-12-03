use anyhow::Result;
use mdns_sd::{ServiceDaemon, ServiceInfo};
use rdev::{Button, EventType};
use serde::Deserialize;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};
use tracing::{error, info, warn};

// Constants
const HOST: &str = "0.0.0.0";
const PORT: u16 = 8766;
const DISCOVERY_PORT: u16 = 8767;
const SERVICE_TYPE: &str = "_pymouse._tcp.local.";
const SERVICE_NAME: &str = "pymouse-server._pymouse._tcp.local.";
const MOVE_DURATION_MS: u64 = 10; // 10ms for low latency
const SENSITIVITY: f64 = 1.0;

// Message types matching the TypeScript client
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum ClientMessage {
    #[serde(rename = "touch")]
    Touch {
        t: u64,
        action: TouchAction,
        x: f64,
        y: f64,
        screen_width: Option<u32>,
        screen_height: Option<u32>,
    },
    #[serde(rename = "click")]
    Click {
        t: u64,
        button: String,
    },
    #[serde(rename = "drag")]
    Drag {
        t: u64,
        action: TouchAction,
        x: f64,
        y: f64,
        screen_width: Option<u32>,
        screen_height: Option<u32>,
    },
}

#[derive(Debug, Deserialize, Clone, Copy)]
enum TouchAction {
    #[serde(rename = "start")]
    Start,
    #[serde(rename = "move")]
    Move,
    #[serde(rename = "end")]
    End,
}

// Mouse control state
struct MouseState {
    // Touch state
    touch_origin_norm: Option<(f64, f64)>,
    mouse_origin_pos: Option<(f64, f64)>,
    // Drag state
    is_dragging: bool,
    drag_origin_norm: Option<(f64, f64)>,
    drag_mouse_origin_pos: Option<(f64, f64)>,
}

impl MouseState {
    fn new() -> Result<Self> {
        Ok(Self {
            touch_origin_norm: None,
            mouse_origin_pos: None,
            is_dragging: false,
            drag_origin_norm: None,
            drag_mouse_origin_pos: None,
        })
    }

    fn get_screen_size(&self) -> (f64, f64) {
        // rdev doesn't provide screen size directly, so we use a reasonable default
        // In a real implementation, you might want to use a crate like `screenshots` or `display-info`
        // For now, we'll use common screen dimensions and allow the client to override
        (1920.0, 1080.0) // Default, will be overridden by actual screen size if available
    }

    fn get_mouse_location(&self) -> (f64, f64) {
        // rdev doesn't provide a direct way to get mouse position
        // We'll track position manually based on moves we make
        // For now, we'll use the stored origin or a default
        self.mouse_origin_pos.unwrap_or((960.0, 540.0))
    }

    fn handle_touch(&mut self, action: TouchAction, x: f64, y: f64) -> Result<()> {
        let (screen_width, screen_height) = self.get_screen_size();

        match action {
            TouchAction::Start => {
                let (mouse_x, mouse_y) = self.get_mouse_location();
                self.mouse_origin_pos = Some((mouse_x, mouse_y));
                self.touch_origin_norm = Some((x, y));
                info!(
                    "Touch started: mouse_origin=({:.1}, {:.1}), touch_norm=({:.3}, {:.3})",
                    mouse_x, mouse_y, x, y
                );
            }
            TouchAction::Move => {
                if self.mouse_origin_pos.is_none() || self.touch_origin_norm.is_none() {
                    // Treat as new start if we missed the start event
                    let (mouse_x, mouse_y) = self.get_mouse_location();
                    self.mouse_origin_pos = Some((mouse_x, mouse_y));
                    self.touch_origin_norm = Some((x, y));
                    return Ok(());
                }

                let (mouse_x, mouse_y) = self.mouse_origin_pos.unwrap();
                let (origin_x, origin_y) = self.touch_origin_norm.unwrap();

                // Compute delta in normalized space
                let dx_norm = x - origin_x;
                let dy_norm = y - origin_y;

                // Apply sensitivity and map to screen coordinates
                let target_x = mouse_x + dx_norm * SENSITIVITY * screen_width;
                let target_y = mouse_y + dy_norm * SENSITIVITY * screen_height;

                // Clamp to screen bounds
                let target_x = target_x.max(0.0).min(screen_width - 1.0);
                let target_y = target_y.max(0.0).min(screen_height - 1.0);

                // Update tracked position
                self.mouse_origin_pos = Some((target_x, target_y));

                // Move mouse directly for low latency
                rdev::simulate(&EventType::MouseMove { x: target_x, y: target_y })
                    .map_err(|e| anyhow::anyhow!("Failed to move mouse: {:?}", e))?;
            }
            TouchAction::End => {
                self.touch_origin_norm = None;
                // Keep mouse_origin_pos for next touch
                info!("Touch ended");
            }
        }
        Ok(())
    }

    fn handle_click(&mut self, button: &str) -> Result<()> {
        let button_enum = match button {
            "left" => Button::Left,
            "right" => Button::Right,
            "middle" => Button::Middle,
            _ => {
                warn!("Unknown button type: {}, using left click", button);
                Button::Left
            }
        };

        // Simulate click (press and release)
        rdev::simulate(&EventType::ButtonPress(button_enum))
            .map_err(|e| anyhow::anyhow!("Failed to press button: {:?}", e))?;
        rdev::simulate(&EventType::ButtonRelease(button_enum))
            .map_err(|e| anyhow::anyhow!("Failed to release button: {:?}", e))?;

        let (x, y) = self.get_mouse_location();
        info!("{} click at ({:.1}, {:.1})", button, x, y);
        Ok(())
    }

    fn handle_drag(&mut self, action: TouchAction, x: f64, y: f64) -> Result<()> {
        let (screen_width, screen_height) = self.get_screen_size();

        match action {
            TouchAction::Start => {
                let (mouse_x, mouse_y) = self.get_mouse_location();
                rdev::simulate(&EventType::ButtonPress(Button::Left))
                    .map_err(|e| anyhow::anyhow!("Failed to press button: {:?}", e))?;
                self.is_dragging = true;
                self.drag_mouse_origin_pos = Some((mouse_x, mouse_y));
                self.drag_origin_norm = Some((x, y));
                info!(
                    "Drag started: mouse_origin=({:.1}, {:.1}), touch_norm=({:.3}, {:.3})",
                    mouse_x, mouse_y, x, y
                );
            }
            TouchAction::Move => {
                if !self.is_dragging
                    || self.drag_mouse_origin_pos.is_none()
                    || self.drag_origin_norm.is_none()
                {
                    // Start drag if not already started
                    let (mouse_x, mouse_y) = self.get_mouse_location();
                    rdev::simulate(&EventType::ButtonPress(Button::Left))
                        .map_err(|e| anyhow::anyhow!("Failed to press button: {:?}", e))?;
                    self.is_dragging = true;
                    self.drag_mouse_origin_pos = Some((mouse_x, mouse_y));
                    self.drag_origin_norm = Some((x, y));
                    return Ok(());
                }

                let (mouse_x, mouse_y) = self.drag_mouse_origin_pos.unwrap();
                let (origin_x, origin_y) = self.drag_origin_norm.unwrap();

                // Compute delta in normalized space
                let dx_norm = x - origin_x;
                let dy_norm = y - origin_y;

                // Apply sensitivity and map to screen coordinates
                let target_x = mouse_x + dx_norm * SENSITIVITY * screen_width;
                let target_y = mouse_y + dy_norm * SENSITIVITY * screen_height;

                // Clamp to screen bounds
                let target_x = target_x.max(0.0).min(screen_width - 1.0);
                let target_y = target_y.max(0.0).min(screen_height - 1.0);

                // Update tracked position
                self.drag_mouse_origin_pos = Some((target_x, target_y));

                // Move mouse while dragging
                rdev::simulate(&EventType::MouseMove { x: target_x, y: target_y })
                    .map_err(|e| anyhow::anyhow!("Failed to move mouse: {:?}", e))?;
            }
            TouchAction::End => {
                if self.is_dragging {
                    rdev::simulate(&EventType::ButtonRelease(Button::Left))
                        .map_err(|e| anyhow::anyhow!("Failed to release button: {:?}", e))?;
                    self.is_dragging = false;
                }
                self.drag_origin_norm = None;
                self.drag_mouse_origin_pos = None;
                info!("Drag ended");
            }
        }
        Ok(())
    }

    fn cleanup(&mut self) {
        if self.is_dragging {
            let _ = rdev::simulate(&EventType::ButtonRelease(Button::Left));
            self.is_dragging = false;
        }
    }
}

// Handle a WebSocket connection
async fn handle_connection(
    stream: tokio::net::TcpStream,
    addr: SocketAddr,
    mouse_state: Arc<Mutex<MouseState>>,
) {
    info!("[Mouse] Client connected: {}", addr);

    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("[Mouse] Failed to accept WebSocket: {}", e);
            return;
        }
    };

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Spawn a task to handle incoming messages
    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                // Parse JSON message
                let message: ClientMessage = match serde_json::from_str(&text) {
                    Ok(m) => m,
                    Err(e) => {
                        warn!("[Mouse] Failed to parse message: {} - {}", e, text);
                        continue;
                    }
                };

                // Handle message based on type
                let mut state = mouse_state.lock().await;
                if let Err(e) = match message {
                    ClientMessage::Touch {
                        action, x, y, ..
                    } => {
                        state.handle_touch(action, x, y)
                    }
                    ClientMessage::Click { button, .. } => state.handle_click(&button),
                    ClientMessage::Drag {
                        action, x, y, ..
                    } => {
                        state.handle_drag(action, x, y)
                    }
                } {
                    error!("[Mouse] Error handling message: {}", e);
                }
            }
            Ok(Message::Close(_)) => {
                info!("[Mouse] Client closed connection: {}", addr);
                break;
            }
            Ok(Message::Ping(data)) => {
                // Respond to ping with pong
                if let Err(e) = ws_sender.send(Message::Pong(data)).await {
                    error!("[Mouse] Failed to send pong: {}", e);
                    break;
                }
            }
            Err(e) => {
                error!("[Mouse] WebSocket error: {}", e);
                break;
            }
            _ => {
                // Ignore other message types
            }
        }
    }

    // Cleanup on disconnect
    let mut state = mouse_state.lock().await;
    state.cleanup();
    info!("[Mouse] Connection finished: {}", addr);
}

// Get local IP address
fn get_local_ip() -> Result<IpAddr> {
    // Try to connect to a remote address to determine local IP
    let socket = std::net::UdpSocket::bind("0.0.0.0:0")?;
    socket.connect("8.8.8.8:80")?;
    let local_addr = socket.local_addr()?;
    Ok(local_addr.ip())
}

// Register mDNS service
fn register_mdns_service(port: u16) -> Result<ServiceDaemon> {
    let daemon = ServiceDaemon::new()?;
    let local_ip = get_local_ip()?;
    info!("[mDNS] Registering service at {}:{}", local_ip, port);

    let hostname = format!("{}.local.", local_ip.to_string().replace(".", "-"));
    let addrs = &[local_ip.to_string()][..];
    let txt_records = &[("version", "1.0")][..];
    let service_info = ServiceInfo::new(
        SERVICE_TYPE,
        SERVICE_NAME,
        &hostname,
        addrs,        // IPv4 addresses
        port,         // port
        txt_records,  // TXT properties
    )?;

    daemon.register(service_info)?;
    info!("[mDNS] Service registered: {} at {}:{}", SERVICE_NAME, local_ip, port);

    Ok(daemon)
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("[Mouse] Starting server on {}:{}", HOST, PORT);

    // Register mDNS service
    let mdns_daemon = match register_mdns_service(PORT) {
        Ok(daemon) => {
            info!("[mDNS] Service registered successfully");
            Some(daemon)
        }
        Err(e) => {
            warn!("[mDNS] Failed to register mDNS service: {}", e);
            warn!("[mDNS] Server will still work, but clients will need to know the IP address");
            None
        }
    };

    // Create shared mouse state
    let mouse_state = Arc::new(Mutex::new(MouseState::new()?));

    // Create TCP listener
    let listener = TcpListener::bind(format!("{}:{}", HOST, PORT)).await?;
    info!("[Mouse] Listening on ws://{}:{}", HOST, PORT);

    // Accept connections
    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                let mouse_state_clone = mouse_state.clone();
                tokio::spawn(async move {
                    handle_connection(stream, addr, mouse_state_clone).await;
                });
            }
            Err(e) => {
                error!("[Mouse] Failed to accept connection: {}", e);
            }
        }
    }
}
