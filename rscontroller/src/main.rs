use anyhow::Result;
use enigo::{Button, Coordinate, Direction, Enigo, Mouse};
use futures_util::StreamExt;
use libp2p::{
    core::upgrade,
    identity, noise,
    swarm::{SwarmEvent, NetworkBehaviour, SwarmBuilder},
    tcp, websocket, yamux, PeerId, Transport,
};
use libp2p_mdns::tokio::Behaviour as MdnsBehaviour;
use libp2p_mdns::Config as MdnsConfig;
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, warn};

// Constants
const SENSITIVITY: f64 = 0.1;
// Smoothing parameters for continuously variable gain
const MIN_GAIN_SCALE: f64 = 0.3; // Minimum gain multiplier (at origin) for fine control
const MAX_GAIN_SCALE: f64 = 5.0; // Maximum gain multiplier (at large distances)
const GAIN_CURVE_STEEPNESS: f64 = 8.0; // Controls how quickly gain ramps up (higher = steeper)
const GAIN_CURVE_CENTER: f64 = 0.15; // Normalized distance where gain is halfway between min and max

// Protocol name for our mouse control protocol
const PROTOCOL_NAME: &str = "/mouse-control/1.0.0";

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

// libp2p NetworkBehaviour for our application protocol
#[derive(NetworkBehaviour)]
struct AppBehaviour {
    mdns: MdnsBehaviour,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing with a sensible default so logs show up even if RUST_LOG isn't set
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .init();

    info!("[Mouse] Starting libp2p server");

    // Create a random PeerId
    let local_key = identity::Keypair::generate_ed25519();
    let local_peer_id = PeerId::from(local_key.public());
    info!("[Mouse] Local peer id: {}", local_peer_id);

    // Set up transport: TCP with WebSocket upgrade
    let tcp_transport = tcp::tokio::Transport::default();
    
    let tcp_transport = tcp_transport
        .upgrade(upgrade::Version::V1)
        .authenticate(noise::Config::new(&local_key)?)
        .multiplex(yamux::Config::default())
        .boxed();

    // Add WebSocket transport
    let ws_transport = websocket::Config::new(tcp::tokio::Transport::default());
    let ws_transport = ws_transport
        .upgrade(upgrade::Version::V1)
        .authenticate(noise::Config::new(&local_key)?)
        .multiplex(yamux::Config::default())
        .boxed();

    // Combine transports using futures_util::future::Either
    use futures_util::future::Either;
    let transport = libp2p::core::transport::OrTransport::new(ws_transport, tcp_transport)
        .map(|either, _| match either {
            Either::Left((peer_id, muxer)) => (peer_id, libp2p::core::muxing::StreamMuxerBox::new(muxer)),
            Either::Right((peer_id, muxer)) => (peer_id, libp2p::core::muxing::StreamMuxerBox::new(muxer)),
        })
        .boxed();

    // Create mDNS behaviour for discovery
    let mdns = MdnsBehaviour::new(MdnsConfig::default(), local_peer_id)?;

    // Create network behaviour
    let behaviour = AppBehaviour { mdns };

    // Create swarm using SwarmBuilder
    let mut swarm = SwarmBuilder::with_tokio_executor(transport, behaviour, local_peer_id).build();

    // Listen on all interfaces with TCP
    swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse()?)?;
    
    // Also listen on WebSocket
    swarm.listen_on("/ip4/0.0.0.0/tcp/0/ws".parse()?)?;

    // Create shared mouse state
    let mouse_state = Arc::new(Mutex::new(MouseState::new()?));

    info!("[Mouse] Listening for connections...");
    info!("[Mouse] Peer ID: {}", local_peer_id);
    info!("[Mouse] Protocol: {}", PROTOCOL_NAME);
    info!("[Mouse] mDNS discovery enabled - peers will discover this service automatically");

    // Event loop
    loop {
        match swarm.select_next_some().await {
            SwarmEvent::NewListenAddr { address, .. } => {
                info!("[Mouse] Listening on {}", address);
            }
            SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                info!("[Mouse] Connection established with {}", peer_id);
                // When a connection is established, we'll handle streams through
                // connection handler events or by opening streams manually
            }
            SwarmEvent::ConnectionClosed { peer_id, .. } => {
                info!("[Mouse] Connection closed with {}", peer_id);
            }
            SwarmEvent::Behaviour(event) => {
                match event {
                    AppBehaviourEvent::Mdns(libp2p_mdns::Event::Discovered(list)) => {
                        for (peer_id, multiaddr) in list {
                            info!("[Mouse] Discovered peer {} at {}", peer_id, multiaddr);
                        }
                    }
                    AppBehaviourEvent::Mdns(libp2p_mdns::Event::Expired(list)) => {
                        for (peer_id, multiaddr) in list {
                            info!("[Mouse] Peer {} expired at {}", peer_id, multiaddr);
                        }
                    }
                }
            }
            SwarmEvent::Dialing { peer_id, .. } => {
                if let Some(peer_id) = peer_id {
                    info!("[Mouse] Dialing peer {}", peer_id);
                }
            }
            SwarmEvent::ListenerClosed { addresses, reason, listener_id: _ } => {
                warn!("[Mouse] Listener closed: {:?}, reason: {:?}", addresses, reason);
            }
            SwarmEvent::ListenerError { error, listener_id: _ } => {
                warn!("[Mouse] Listener error: {}", error);
            }
            SwarmEvent::IncomingConnection { .. } => {
                info!("[Mouse] Incoming connection");
            }
            SwarmEvent::IncomingConnectionError { error, .. } => {
                warn!("[Mouse] Incoming connection error: {}", error);
            }
            SwarmEvent::OutgoingConnectionError { peer_id, error, .. } => {
                if let Some(peer_id) = peer_id {
                    warn!("[Mouse] Outgoing connection error to {}: {}", peer_id, error);
                } else {
                    warn!("[Mouse] Outgoing connection error: {}", error);
                }
            }
            _ => {}
        }
    }
}
