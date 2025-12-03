use anyhow::Result;
use enigo::{Button, Coordinate, Direction, Enigo, Mouse};
use futures_util::{SinkExt, StreamExt};
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Method, Request, Response, Server, StatusCode};
use mdns_sd::{ServiceDaemon, ServiceInfo};
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
const SENSITIVITY: f64 = 0.1;
// Smoothing parameters for continuously variable gain
const MIN_GAIN_SCALE: f64 = 0.3; // Minimum gain multiplier (at origin) for fine control
const MAX_GAIN_SCALE: f64 = 5.0; // Maximum gain multiplier (at large distances)
const GAIN_CURVE_STEEPNESS: f64 = 8.0; // Controls how quickly gain ramps up (higher = steeper)
const GAIN_CURVE_CENTER: f64 = 0.15; // Normalized distance where gain is halfway between min and max

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
    // Touch state
    touch_origin_norm: Option<(f64, f64)>,
    mouse_origin_pos: Option<(f64, f64)>,
    // Drag state
    is_dragging: bool,
    drag_origin_norm: Option<(f64, f64)>,
    drag_mouse_origin_pos: Option<(f64, f64)>,
    // Track last sent position to avoid redundant OS calls
    last_sent_pos: Option<(i32, i32)>,
    // Reusable Enigo instance to avoid repeated permission checks
    enigo: Option<Enigo>,
}

impl MouseState {
    fn new() -> Result<Self> {
        Ok(Self {
            touch_origin_norm: None,
            mouse_origin_pos: None,
            is_dragging: false,
            drag_origin_norm: None,
            drag_mouse_origin_pos: None,
            last_sent_pos: None,
            enigo: None,
        })
    }

    /// Get or create the Enigo instance (lazy initialization)
    fn get_enigo(&mut self) -> Result<&mut Enigo> {
        if self.enigo.is_none() {
            self.enigo = Some(Enigo::new(&enigo::Settings::default())?);
        }
        Ok(self.enigo.as_mut().unwrap())
    }

    /// Calculate continuously variable gain based on distance from origin.
    /// Uses a smooth sigmoid-like curve that provides:
    /// - Lower sensitivity near origin (for precision)
    /// - Gradually increasing sensitivity as distance increases (for larger sweeps)
    /// - Smooth, continuous transitions (no abrupt changes)
    fn calculate_gain(&self, distance_norm: f64) -> f64 {
        // Normalize distance to a 0-1 range for the sigmoid curve
        // The curve is centered at GAIN_CURVE_CENTER and has steepness GAIN_CURVE_STEEPNESS
        let normalized = (distance_norm - GAIN_CURVE_CENTER) * GAIN_CURVE_STEEPNESS;
        
        // Apply sigmoid function: 1 / (1 + e^(-x))
        // This gives a smooth S-curve from 0 to 1
        let sigmoid = 1.0 / (1.0 + (-normalized).exp());
        
        // Map sigmoid output (0-1) to gain range (MIN_GAIN_SCALE to MAX_GAIN_SCALE)
        let gain_scale = MIN_GAIN_SCALE + (MAX_GAIN_SCALE - MIN_GAIN_SCALE) * sigmoid;
        
        SENSITIVITY * gain_scale
    }

    fn get_screen_size(&self) -> (f64, f64) {
        // Enigo doesn't expose screen size; use a reasonable virtual desktop size.
        // This only affects the relative gain scaling.
        (1920.0, 1080.0)
    }

    fn get_mouse_location(&mut self) -> (f64, f64) {
        // Try to get the real OS cursor position from Enigo so that each new
        // gesture starts from wherever the cursor currently is, instead of
        // teleporting back to an internal logical origin.
        //
        // If this fails for any reason, fall back to our last known origin or
        // the virtual screen center.
        let (sw, sh) = self.get_screen_size();

        match self.get_enigo() {
            Ok(enigo) => {
                match enigo.location() {
                    Ok((x, y)) => (x as f64, y as f64),
                    Err(_) => self.mouse_origin_pos.unwrap_or((sw / 2.0, sh / 2.0)),
                }
            }
            Err(_) => self.mouse_origin_pos.unwrap_or((sw / 2.0, sh / 2.0)),
        }
    }

    fn handle_touch(&mut self, action: TouchAction, x: f64, y: f64) -> Result<()> {
        let (screen_width, screen_height) = self.get_screen_size();

        match action {
            TouchAction::Start => {
                let (mouse_x, mouse_y) = self.get_mouse_location();
                self.mouse_origin_pos = Some((mouse_x, mouse_y));
                self.touch_origin_norm = Some((x, y));
                // Reset last sent position on new touch
                self.last_sent_pos = None;
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

                // Calculate distance from origin for continuously variable gain
                let distance_norm = (dx_norm * dx_norm + dy_norm * dy_norm).sqrt();
                let gain = self.calculate_gain(distance_norm);

                // Apply continuously variable gain and map to screen coordinates
                let target_x = mouse_x + dx_norm * gain * screen_width;
                let target_y = mouse_y + dy_norm * gain * screen_height;

                // Clamp to screen bounds
                let target_x = target_x.max(0.0).min(screen_width - 1.0);
                let target_y = target_y.max(0.0).min(screen_height - 1.0);

                // Move instantly to the new position, but only if it's different from last sent position
                let x = target_x.round().max(0.0) as i32;
                let y = target_y.round().max(0.0) as i32;
                
                // Skip redundant moves to avoid OS call overhead
                if let Some((last_x, last_y)) = self.last_sent_pos {
                    if last_x == x && last_y == y {
                        return Ok(());
                    }
                }
                
                let enigo = self.get_enigo()?;
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
                self.last_sent_pos = Some((x, y));
            }
            TouchAction::End => {
                self.touch_origin_norm = None;
                // Reset last sent position on touch end
                self.last_sent_pos = None;
                // Keep mouse_origin_pos for next touch
                info!("Touch ended");
            }
        }
        Ok(())
    }

    fn handle_click(&mut self, button: &str) -> Result<()> {
        let btn = match button {
            "left" => Button::Left,
            "right" => Button::Right,
            "middle" => Button::Middle,
            _ => {
                warn!("Unknown button type: {}, using left click", button);
                Button::Left
            }
        };

        let enigo = self.get_enigo()?;
        let _ = enigo.button(btn, Direction::Click);

        let (x, y) = self.get_mouse_location();
        info!("{} click at ({:.1}, {:.1})", button, x, y);
        Ok(())
    }

    fn handle_drag(&mut self, action: TouchAction, x: f64, y: f64) -> Result<()> {
        let (screen_width, screen_height) = self.get_screen_size();

        match action {
            TouchAction::Start => {
                let (mouse_x, mouse_y) = self.get_mouse_location();
                // Mouse down at current position (left button)
                let enigo = self.get_enigo()?;
                let _ = enigo.button(Button::Left, Direction::Press);
                self.is_dragging = true;
                self.drag_mouse_origin_pos = Some((mouse_x, mouse_y));
                self.drag_origin_norm = Some((x, y));
                // Reset last sent position on new drag
                self.last_sent_pos = None;
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
                    // Start drag if not already started (mouse down + init state)
                    let (mouse_x, mouse_y) = self.get_mouse_location();
                    let enigo = self.get_enigo()?;
                    let _ = enigo.button(Button::Left, Direction::Press);
                    self.is_dragging = true;
                    self.drag_mouse_origin_pos = Some((mouse_x, mouse_y));
                    self.drag_origin_norm = Some((x, y));
                    // Reset last sent position on auto-start drag
                    self.last_sent_pos = None;
                    info!(
                        "Drag auto-started: mouse_origin=({:.1}, {:.1}), touch_norm=({:.3}, {:.3})",
                        mouse_x, mouse_y, x, y
                    );
                }

                let (mouse_x, mouse_y) = self.drag_mouse_origin_pos.unwrap();
                let (origin_x, origin_y) = self.drag_origin_norm.unwrap();

                // Compute delta in normalized space
                let dx_norm = x - origin_x;
                let dy_norm = y - origin_y;

                // Calculate distance from origin for continuously variable gain
                let distance_norm = (dx_norm * dx_norm + dy_norm * dy_norm).sqrt();
                let gain = self.calculate_gain(distance_norm);

                // Apply continuously variable gain and map to screen coordinates
                let target_x = mouse_x + dx_norm * gain * screen_width;
                let target_y = mouse_y + dy_norm * gain * screen_height;

                // Clamp to screen bounds
                let target_x = target_x.max(0.0).min(screen_width - 1.0);
                let target_y = target_y.max(0.0).min(screen_height - 1.0);

                // Move while the button is held down, but only if position changed
                let x = target_x.round().max(0.0) as i32;
                let y = target_y.round().max(0.0) as i32;
                
                // Skip redundant moves to avoid OS call overhead
                if let Some((last_x, last_y)) = self.last_sent_pos {
                    if last_x == x && last_y == y {
                        return Ok(());
                    }
                }
                
                let enigo = self.get_enigo()?;
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
                self.last_sent_pos = Some((x, y));
            }
            TouchAction::End => {
                if self.is_dragging {
                    // Release mouse button when drag ends.
                    let enigo = self.get_enigo()?;
                    let _ = enigo.button(Button::Left, Direction::Release);
                    self.is_dragging = false;
                }
                self.drag_origin_norm = None;
                self.drag_mouse_origin_pos = None;
                // Reset last sent position on drag end
                self.last_sent_pos = None;
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
    let local_ip = get_local_ip().unwrap_or_else(|_| IpAddr::from([127, 0, 0, 1]));
    info!("[Mouse] Listening on ws://{}:{}", HOST, PORT);
    info!("[Mouse] Server IP address: {}", local_ip);
    info!("[Mouse] WebSocket URL: ws://{}:{}", local_ip, PORT);
    info!("[Mouse] Discovery URL: http://{}:{}/discover", local_ip, DISCOVERY_PORT);

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
