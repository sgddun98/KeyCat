//! Global keyboard and mouse buttons for the KeyCat Linux host (linux/src/main.js), which starts
//! this program and reads one JSON object per line from its stdout:
//!
//!   {"t":"ready"}                            listening
//!   {"t":"key","code":"KeyA","down":true}    `code` is null for keys the scene has no name for
//!   {"t":"button","button":"left","down":true}   left, right or other
//!   {"t":"wheel","notches":1}                positive away from the user
//!
//! It asks the X server for XInput2 raw events on the root window: every key and button press
//! system-wide, whichever window has the focus. It only listens and never grabs, so input
//! methods and other programs get their input as before. Which key went down goes to the host
//! and nowhere else; nothing is written down. X11 only: Wayland has no such events for ordinary
//! programs. Exits when the host closes its stdin or stdout.
mod keymap;

use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::ExitCode;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use x11rb::connection::Connection;
use x11rb::protocol::xinput::{self, ConnectionExt as _};
use x11rb::protocol::xproto::ConnectionExt as _;
use x11rb::protocol::Event;
use x11rb::rust_connection::RustConnection;

/// Keys that went down and not yet up, by X keycode, with when they went down.
type Held = Arc<Mutex<HashMap<u32, Instant>>>;

fn emit(line: &str) {
    let mut out = std::io::stdout().lock();
    if writeln!(out, "{line}").and_then(|()| out.flush()).is_err() {
        // The host is gone.
        std::process::exit(0);
    }
}

fn key(keycode: u32, down: bool) {
    let code = keymap::code(keycode).map_or("null".to_string(), |code| format!("\"{code}\""));
    emit(&format!(r#"{{"t":"key","code":{code},"down":{down}}}"#));
}

fn button(detail: u32, down: bool) {
    match detail {
        // Buttons 4 and 5 are one notch of the wheel each, up and down; 6 and 7 tilt it sideways.
        4 | 5 if down => emit(&format!(r#"{{"t":"wheel","notches":{}}}"#, if detail == 4 { 1 } else { -1 })),
        4..=7 => {}
        _ => {
            let name = match detail {
                1 => "left",
                3 => "right",
                _ => "other",
            };
            emit(&format!(r#"{{"t":"button","button":"{name}","down":{down}}}"#));
        }
    }
}

fn listen(conn: &RustConnection, root: u32) -> Result<(), String> {
    // XInput 2.1 and later deliver raw events to the root window even while another client
    // holds a grab (a menu, a game), so ask for at least that.
    let version = conn
        .xinput_xi_query_version(2, 2)
        .map_err(|e| e.to_string())?
        .reply()
        .map_err(|e| format!("XInput2 unavailable: {e}"))?;
    if (version.major_version, version.minor_version) < (2, 1) {
        return Err(format!("XInput {}.{} is too old, 2.1 needed", version.major_version, version.minor_version));
    }
    let mask = xinput::XIEventMask::RAW_KEY_PRESS
        | xinput::XIEventMask::RAW_KEY_RELEASE
        | xinput::XIEventMask::RAW_BUTTON_PRESS
        | xinput::XIEventMask::RAW_BUTTON_RELEASE;
    conn.xinput_xi_select_events(root, &[xinput::EventMask { deviceid: xinput::Device::ALL_MASTER.into(), mask: vec![mask] }])
        .map_err(|e| e.to_string())?
        .check()
        .map_err(|e| format!("selecting raw events failed: {e}"))?;
    Ok(())
}

/// Some key-ups never arrive: a key let go while the screen locks, or after the session switched
/// away. The key would then stay down on the page and its label hang over the keyboard until
/// pressed again. So, as the mac and Windows builds do, a key held for a while is checked
/// against the keyboard itself twice a second, and let go if it is not actually down.
fn release_lost_keys(held: Held) {
    let Ok((conn, _)) = x11rb::connect(None) else { return };
    loop {
        thread::sleep(Duration::from_millis(500));
        let mut keys = held.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if !keys.values().any(|since| since.elapsed() > Duration::from_millis(400)) {
            continue;
        }
        let Ok(state) = conn.query_keymap().map_err(drop).and_then(|c| c.reply().map_err(drop)) else { continue };
        let lost: Vec<u32> = keys
            .iter()
            .filter(|(&kc, since)| since.elapsed() > Duration::from_millis(400) && state.keys[kc as usize / 8] & (1 << (kc % 8)) == 0)
            .map(|(&kc, _)| kc)
            .collect();
        for kc in lost {
            keys.remove(&kc);
            key(kc, false);
        }
    }
}

fn main() -> ExitCode {
    let (conn, screen) = match x11rb::connect(None) {
        Ok(connected) => connected,
        Err(error) => {
            eprintln!("cannot connect to the X server: {error}");
            return ExitCode::from(2);
        }
    };
    let root = conn.setup().roots[screen].root;
    if let Err(error) = listen(&conn, root) {
        eprintln!("{error}");
        return ExitCode::from(3);
    }
    thread::spawn(|| {
        let _ = std::io::stdin().read_to_end(&mut Vec::new());
        std::process::exit(0);
    });
    let held: Held = Arc::default();
    let checker = held.clone();
    thread::spawn(move || release_lost_keys(checker));
    emit(r#"{"t":"ready"}"#);
    loop {
        let event = match conn.wait_for_event() {
            Ok(event) => event,
            Err(error) => {
                eprintln!("lost the X server: {error}");
                return ExitCode::from(4);
            }
        };
        match event {
            Event::XinputRawKeyPress(e) => {
                // Autorepeat: one paw press per physical press.
                let mut keys = held.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                if keys.insert(e.detail, Instant::now()).is_none() {
                    key(e.detail, true);
                }
            }
            Event::XinputRawKeyRelease(e) => {
                let mut keys = held.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                if keys.remove(&e.detail).is_some() {
                    key(e.detail, false);
                }
            }
            Event::XinputRawButtonPress(e) => button(e.detail, true),
            Event::XinputRawButtonRelease(e) => button(e.detail, false),
            _ => {}
        }
    }
}
