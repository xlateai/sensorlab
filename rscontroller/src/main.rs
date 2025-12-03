use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Method, Request, Response, Server, StatusCode};
use mdns_sd::{ServiceDaemon, ServiceInfo};
use rustautogui::RustAutoGui;
use serde::Deserialize;
use serde_json::json;
use std::convert::Infallible;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info, warn};

// Constants
const HOST: &str = "0.0.0.0";
const PORT: u16 = 8766;
const DISCOVERY_PORT: u16 = 8767;
const SERVICE_TYPE: &str = "_pymouse._tcp.local.";
const SERVICE_NAME: &str = "pymouse-server._pymouse._tcp.local.";
// Overall mouse movement gain; lower values = less cursor movement per unit finger delta.
// This is the main knob to tune how "strong" the controller feels.
const SENSITIVITY: f64 = 0.4;
// Inside this normalized radius around the touch origin, we apply a reduced gain so that
// tiny finger movements in a small area don't cause large cursor drift.
const FINE_RADIUS: f64 = 0.03; // 3% of the screen in normalized units
const FINE_SENSITIVITY_SCALE: f64 = 0.35; // fine control is ~35% of normal sensitivity
// For large sweeping movements, we gradually ramp the gain up so you can cover more distance
// without losing the fine control near the origin.
const MAX_GAIN_MULTIPLIER: f64 = 2.0; // at large radii, effective gain ~= SENSITIVITY * 2.0
// Duration for smooth mouse movement (in seconds) – mirrors pymouse.py's 0.01s moves.
const MOVE_DURATION_SECONDS: f32 = 0.01;

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
        #[serde(rename = "screenWidth")]
        _screen_width: Option<u32>,
        #[serde(rename = "screenHeight")]
        _screen_height: Option<u32>,
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
        #[serde(rename = "screenWidth")]
        _screen_width: Option<u32>,
        #[serde(rename = "screenHeight")]
        _screen_height: Option<u32>,
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
    gui: RustAutoGui,
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
        // `false` => debug mode off in rustautogui
        let gui = RustAutoGui::new(false)?;
        Ok(Self {
            gui,
            touch_origin_norm: None,
            mouse_origin_pos: None,
            is_dragging: false,
            drag_origin_norm: None,
            drag_mouse_origin_pos: None,
        })
    }

    fn get_screen_size(&mut self) -> (f64, f64) {
        let (w, h) = self.gui.get_screen_size();
        (w as f64, h as f64)
    }

    fn get_mouse_location(&mut self) -> (f64, f64) {
        if let Ok((x, y)) = self.gui.get_mouse_position() {
            (x as f64, y as f64)
        } else {
            // Fallback to last known or center of screen if unavailable
            let (sw, sh) = self.get_screen_size();
            self.mouse_origin_pos.unwrap_or((sw / 2.0, sh / 2.0))
        }
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

                // Adjust gain based on how far from the origin you are:
                // - very close to origin: reduced gain for precision (avoid drift)
                // - further away: smoothly ramp up gain so big sweeps cover more distance
                let r = (dx_norm * dx_norm + dy_norm * dy_norm).sqrt();
                let gain = if r < FINE_RADIUS {
                    SENSITIVITY * FINE_SENSITIVITY_SCALE
                } else {
                    // Map radius into [0, 1] for "farther from origin" and interpolate
                    // between fine scale and a higher max multiplier.
                    let max_r = 0.5; // ~half the pad in normalized units
                    let t = ((r - FINE_RADIUS) / (max_r - FINE_RADIUS))
                        .clamp(0.0, 1.0);
                    let scale =
                        FINE_SENSITIVITY_SCALE + (MAX_GAIN_MULTIPLIER - FINE_SENSITIVITY_SCALE) * t;
                    SENSITIVITY * scale
                };

                // Apply sensitivity and map to screen coordinates
                let target_x = mouse_x + dx_norm * gain * screen_width;
                let target_y = mouse_y + dy_norm * gain * screen_height;

                // Clamp to screen bounds
                let target_x = target_x.max(0.0).min(screen_width - 1.0);
                let target_y = target_y.max(0.0).min(screen_height - 1.0);

                // Ask rustautogui to animate to the new position over a short duration,
                // similar to pyautogui.moveTo(..., duration=0.01).
                let x = target_x.round().max(0.0) as u32;
                let y = target_y.round().max(0.0) as u32;
                if let Err(e) = self.gui.move_mouse_to_pos(x, y, MOVE_DURATION_SECONDS) {
                    warn!("[Mouse] move_mouse_to_pos error: {:?}", e);
                }
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
        let res = match button {
            "left" => self.gui.left_click(),
            "right" => self.gui.right_click(),
            "middle" => self.gui.middle_click(),
            _ => {
                warn!("Unknown button type: {}, using left click", button);
                self.gui.left_click()
            }
        };

        if let Err(e) = res {
            warn!("[Mouse] click error: {:?}", e);
        }

        let (x, y) = self.get_mouse_location();
        info!("{} click at ({:.1}, {:.1})", button, x, y);
        Ok(())
    }

    fn handle_drag(&mut self, action: TouchAction, x: f64, y: f64) -> Result<()> {
        let (screen_width, screen_height) = self.get_screen_size();

        match action {
            TouchAction::Start => {
                let (mouse_x, mouse_y) = self.get_mouse_location();
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

                // Same gain curve as touch move: precise near origin, ramping up for big sweeps.
                let r = (dx_norm * dx_norm + dy_norm * dy_norm).sqrt();
                let gain = if r < FINE_RADIUS {
                    SENSITIVITY * FINE_SENSITIVITY_SCALE
                } else {
                    let max_r = 0.5;
                    let t = ((r - FINE_RADIUS) / (max_r - FINE_RADIUS))
                        .clamp(0.0, 1.0);
                    let scale =
                        FINE_SENSITIVITY_SCALE + (MAX_GAIN_MULTIPLIER - FINE_SENSITIVITY_SCALE) * t;
                    SENSITIVITY * scale
                };

                // Apply sensitivity and map to screen coordinates
                let target_x = mouse_x + dx_norm * gain * screen_width;
                let target_y = mouse_y + dy_norm * gain * screen_height;

                // Clamp to screen bounds
                let target_x = target_x.max(0.0).min(screen_width - 1.0);
                let target_y = target_y.max(0.0).min(screen_height - 1.0);

                // Ask rustautogui to animate the drag move over a short duration.
                let x = target_x.round().max(0.0) as u32;
                let y = target_y.round().max(0.0) as u32;
                if let Err(e) = self.gui.drag_mouse_to_pos(x, y, MOVE_DURATION_SECONDS) {
                    warn!("[Mouse] drag_mouse_to_pos error: {:?}", e);
                }
            }
            TouchAction::End => {
                if self.is_dragging {
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

    // Handle incoming messages.
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

                // Directly handle mouse actions on this task.
                // NOTE: This runs on the same Tokio task as the WebSocket handler.
                let mut state = mouse_state.lock().await;
                let res = match message {
                    ClientMessage::Touch { action, x, y, .. } => {
                        info!("[Mouse] touch {:?} at ({:.3}, {:.3})", action, x, y);
                        state.handle_touch(action, x, y)
                    }
                    ClientMessage::Click { button, .. } => {
                        info!("[Mouse] click {}", button);
                        state.handle_click(&button)
                    }
                    ClientMessage::Drag { action, x, y, .. } => {
                        info!("[Mouse] drag {:?} at ({:.3}, {:.3})", action, x, y);
                        state.handle_drag(action, x, y)
                    }
                };

                if let Err(e) = res {
                    error!("[Mouse] Error handling command: {}", e);
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

// HTTP discovery handler compatible with the existing React Native client
async fn discovery_handler(req: Request<Body>) -> Result<Response<Body>, Infallible> {
    if req.method() == Method::GET && req.uri().path() == "/discover" {
        info!("[Discovery] /discover request");
        // Use the same JSON shape as the Python server
        let local_ip = match get_local_ip() {
            Ok(ip) => ip.to_string(),
            Err(_) => "127.0.0.1".to_string(),
        };
        let body = json!({
            "service": "pymouse",
            "ws_url": format!("ws://{}:{}", local_ip, PORT),
            "port": PORT,
            "ip": local_ip,
        })
        .to_string();

        let mut resp = Response::new(Body::from(body));
        *resp.status_mut() = StatusCode::OK;
        resp.headers_mut()
            .insert("Content-Type", "application/json".parse().unwrap());
        resp.headers_mut()
            .insert("Access-Control-Allow-Origin", "*".parse().unwrap());
        return Ok(resp);
    }

    let mut not_found = Response::new(Body::empty());
    *not_found.status_mut() = StatusCode::NOT_FOUND;
    Ok(not_found)
}

// Start HTTP discovery server on DISCOVERY_PORT
async fn start_discovery_server() -> Result<()> {
    let addr = SocketAddr::from(([0, 0, 0, 0], DISCOVERY_PORT));
    info!("[Discovery] Starting HTTP discovery server on {}", addr);

    let make_svc = make_service_fn(|_conn| async {
        Ok::<_, Infallible>(service_fn(|req| discovery_handler(req)))
    });

    let server = Server::bind(&addr).serve(make_svc);

    tokio::spawn(async move {
        if let Err(e) = server.await {
            error!("[Discovery] server error: {}", e);
        }
    });

    Ok(())
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
    // Initialize tracing with a sensible default so logs show up even if RUST_LOG isn't set
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .init();

    info!("[Mouse] Starting server on {}:{}", HOST, PORT);

    // Register mDNS service
    let _mdns_daemon = match register_mdns_service(PORT) {
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

    // Start HTTP discovery server for React Native client
    if let Err(e) = start_discovery_server().await {
        warn!("[Discovery] Failed to start HTTP discovery server: {}", e);
    }

    // Create shared mouse state used directly by connection handlers
    let mouse_state = Arc::new(Mutex::new(MouseState::new()?));

    // Create TCP listener
    let listener = TcpListener::bind(format!("{}:{}", HOST, PORT)).await?;
    info!("[Mouse] Listening on ws://{}:{}", HOST, PORT);

    // Accept connections
    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                if let Err(e) = stream.set_nodelay(true) {
                    warn!("[Mouse] Failed to set TCP_NODELAY: {}", e);
                }
                let state = mouse_state.clone();
                tokio::spawn(async move {
                    handle_connection(stream, addr, state).await;
                });
            }
            Err(e) => {
                error!("[Mouse] Failed to accept connection: {}", e);
            }
        }
    }
}
