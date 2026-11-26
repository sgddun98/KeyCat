// The Windows host for the web scene in ../web. Mirrors the mac build's mac/App.swift and
// mac/AppMenu.swift: a transparent, click-through floating window reports the pointer to the page,
// forwards global keyboard and mouse input, and offers the same tray menu. The page is drawn by
// the system WebView2, so the app ships no browser of its own. tauri-plugin-updater handles updates.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod autostart;
mod elevate;
#[cfg_attr(not(windows), allow(dead_code))]
mod hook;
#[cfg_attr(not(windows), allow(dead_code))]
mod keymap;
mod store;

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::webview::PageLoadEvent;
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, RunEvent, Webview, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, Wry,
};
use tauri_plugin_updater::{Update, UpdaterExt};

use autostart::Mode;
use hook::{Button, Input};
use store::Store;

const DESIGN: (f64, f64) = (360.0, 368.0); // mac/App.swift designSize at scale 1
const PANEL: &str = "panel";
/// The second cat's window, when 第二只猫 is on. Its own settings carry the `cat2.` prefix.
const PANEL2: &str = "panel2";
const SETTINGS: &str = "settings";
const STATS: &str = "stats";
/// Every webview gets the same arguments, since they share one data folder: WebView2's own
/// defaults, plus letting the purr (Web Audio) start without a click on the page.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";
const TRAY: &str = "tray";
const DEV: bool = cfg!(debug_assertions);
/// tauri.conf.json `identifier`, which names the app data folder in %APPDATA%.
const IDENTIFIER: &str = "com.ellobok.keycat";

// The web scene talks to its host through `window.webkit.messageHandlers.<name>.postMessage`,
// the WKWebView bridge the mac build uses. Recreate that shape on top of Tauri IPC so web/ stays
// untouched. Right-clicks belong to the tray-style menu, not WebView2's own.
const BRIDGE: &str = r#"(() => {
  const handler = channel => ({
    postMessage: message => window.__TAURI_INTERNALS__.invoke('host_message', { channel, message }).catch(() => {}),
  });
  window.webkit = { messageHandlers: { cat: handler('cat'), settings: handler('settings'), stats: handler('stats') } };
  window.addEventListener('contextmenu', event => event.preventDefault());
})();"#;

// MARK: State

#[derive(Clone, PartialEq)]
enum UpdateState {
    Idle,
    Checking,
    Downloading(String, u32),
    Ready(String),
    Current,
    Failed,
}

struct Drag {
    label: &'static str,
    cursor: (f64, f64),
    origin: (i32, i32),
    last: (i32, i32),
}

/// What the host tracks per cat window.
struct Cat {
    page_ready: bool,
    /// The page has sent a message, so its script is running.
    answered: bool,
    hit: String,
    last_cursor: (i32, i32),
    /// Where the other cat's head was last reported to this one, in its page's pixels.
    last_friend: Option<(i32, i32)>,
}

impl Cat {
    fn new() -> Self {
        Self { page_ready: false, answered: false, hit: "none".into(), last_cursor: (-9999, -9999), last_friend: None }
    }
}

struct Host {
    store: Store,
    hook_ready: bool,
    cats: HashMap<&'static str, Cat>,
    /// The cat being petted, if any.
    petting: Option<&'static str>,
    drag: Option<Drag>,
    pending_delta: (f64, f64),
    last_pointer: Option<(f64, f64)>,
    size_fixes: u32,
    key_events: u64,
    /// Keys the page thinks are down, by hook `id` (see release_lost_keys).
    held: HashMap<u32, Held>,
    last_held_check: Instant,
    autostart: Mode,
    update: UpdateState,
    downloaded: Option<(Update, Vec<u8>)>,
    /// Not remembered across restarts: a pomodoro started yesterday is over.
    pomodoro: bool,
    /// A cat window could not be made, or its page never answered (see watch_page).
    page_failed: bool,
}

/// Settings with their defaults applied, the same keys and fallbacks as the mac build.
struct Settings {
    style: String,
    coat: String,
    pattern: String,
    eye: String,
    shine: String,
    collar: String,
    gloves: String,
    blush: bool,
    whiskers: bool,
    /// Colourpoint coats fade into their points, as in 1.0.4, instead of a crisp edge.
    soft_points: bool,
    mouse_cable: bool,
    keyboard_color: String,
    /// How see-through the whole picture is, 1 solid.
    opacity: f64,
    privacy: bool,
    click_through: bool,
    run_as_admin: bool,
    sleep_after: f64,
    tune: Value,
    scale: f64,
    sound: bool,
    festival: bool,
    cup: bool,
    second_cat: bool,
    /// "play": both cats have a keyboard and mouse; "split": the main cat types, the second works the mouse.
    pair_mode: String,
    coat2: String,
}

impl Host {
    fn scale(&self) -> f64 {
        self.store.get("catScale").and_then(Value::as_f64).filter(|v| v.is_finite() && *v > 0.3).unwrap_or(0.9)
    }

    fn settings(&self) -> Settings {
        let text = |key: &str, fallback: &str| {
            self.store.get(key).and_then(Value::as_str).unwrap_or(fallback).to_string()
        };
        let number = |key: &str| self.store.get(key).and_then(Value::as_f64).filter(|v| v.is_finite());
        let coat = text("coat", "black");
        Settings {
            style: text("style", "2d"),
            pattern: text(&format!("pattern.{coat}"), "auto"),
            eye: text("eyeColor", "auto"),
            shine: text("eyeShine", "classic"),
            collar: text("collar", "none"),
            gloves: text("gloves", "auto"),
            blush: self.store.get("blush") == Some(&Value::Bool(true)),
            whiskers: self.store.get("whiskers") != Some(&Value::Bool(false)),
            soft_points: self.store.get("softPoints") != Some(&Value::Bool(false)),
            mouse_cable: self.store.get("mouseCable") != Some(&Value::Bool(false)),
            keyboard_color: text("keyboardColor", "cream"),
            opacity: number("opacity").filter(|v| (0.3..=1.0).contains(v)).unwrap_or(1.0),
            privacy: self.store.get("privacy") == Some(&Value::Bool(true)),
            click_through: self.store.get("clickThrough") == Some(&Value::Bool(true)),
            run_as_admin: self.store.get("runAsAdmin") == Some(&Value::Bool(true)),
            sleep_after: number("sleepAfter").unwrap_or(60.0),
            tune: self.store.get("tune").filter(|v| v.is_object()).cloned().unwrap_or_else(|| json!({})),
            scale: self.scale(),
            sound: self.store.get("sound") == Some(&Value::Bool(true)),
            festival: self.store.get("festival") != Some(&Value::Bool(false)),
            cup: self.store.get("cup") != Some(&Value::Bool(false)),
            second_cat: self.store.get("secondCat") == Some(&Value::Bool(true)),
            pair_mode: text("pairMode", "play"),
            coat2: text("cat2.coat", "orange"),
            coat,
        }
    }
}

fn host(app: &AppHandle) -> MutexGuard<'_, Host> {
    app.state::<Mutex<Host>>().inner().lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn panel(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(PANEL)
}

/// The cat windows that exist, main cat first.
fn panels(app: &AppHandle) -> Vec<(&'static str, WebviewWindow)> {
    [PANEL, PANEL2].into_iter().filter_map(|label| app.get_webview_window(label).map(|w| (label, w))).collect()
}

fn cat_label(label: &str) -> Option<&'static str> {
    [PANEL, PANEL2].into_iter().find(|l| *l == label)
}

/// Prefix of a cat's own keys in the store (position, coat).
fn prefix(label: &str) -> &'static str {
    if label == PANEL { "" } else { "cat2." }
}

// MARK: Logging

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

fn data_dir() -> PathBuf {
    DATA_DIR.get().cloned().unwrap_or_else(std::env::temp_dir)
}

/// UTC time as ISO 8601, like JavaScript's `toISOString` without the milliseconds.
fn timestamp() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let (days, rest) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z", rest / 3600, rest / 60 % 60, rest % 60)
}

fn log(text: &str) {
    // Logging must never take the app down.
    let dir = data_dir();
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("log.txt");
    // Past 1 MB the log moves to log.old.txt, replacing the one before, so the two stay small.
    if fs::metadata(&path).is_ok_and(|meta| meta.len() > 1 << 20) {
        let _ = fs::rename(&path, dir.join("log.old.txt"));
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{} {text}", timestamp());
    }
}

// MARK: Page

/// Input and anything else every cat should hear.
fn js(app: &AppHandle, script: &str) {
    for (label, _) in panels(app) {
        js_to(app, label, script);
    }
}

fn js_to(app: &AppHandle, label: &str, script: &str) {
    if !host(app).cats.get(label).is_some_and(|cat| cat.page_ready) {
        return;
    }
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.eval(script);
    }
}

fn options(app: &AppHandle, label: &str) -> Value {
    let (s, pomodoro) = {
        let h = host(app);
        (h.settings(), h.pomodoro)
    };
    let main = label == PANEL;
    let role = match (s.second_cat && s.pair_mode == "split", main) {
        (false, _) => "both",
        (true, true) => "keys",
        (true, false) => "mouse",
    };
    json!({
        "style": s.style,
        "coat": if main { &s.coat } else { &s.coat2 },
        "pattern": if main { s.pattern.as_str() } else { "auto" },
        "eye": s.eye,
        "shine": s.shine,
        "blush": s.blush,
        "whiskers": s.whiskers,
        "collar": s.collar,
        "softPoints": s.soft_points,
        "gloves": s.gloves,
        "cable": s.mouse_cable,
        "board": s.keyboard_color,
        "opacity": s.opacity,
        "privacy": s.privacy,
        "sleepAfter": if s.sleep_after > 0.0 { s.sleep_after } else { 1e9 },
        "tune": s.tune,
        "sound": s.sound,
        "festival": s.festival,
        "cup": s.cup,
        "pomodoro": main && pomodoro,
        "role": role,
        "persist": main,
    })
}

fn push_options(app: &AppHandle) {
    for (label, _) in panels(app) {
        push_options_to(app, label);
    }
}

fn push_options_to(app: &AppHandle, label: &str) {
    let script = format!("cat.options({})", options(app, label));
    js_to(app, label, &script);
}

/// What the cat remembers (web/life.js), as the page posted it.
fn memory(app: &AppHandle) -> Value {
    host(app).store.get("memory").filter(|v| v.is_object()).cloned().unwrap_or(Value::Null)
}

fn on_page_ready(app: &AppHandle, label: &'static str) {
    let first = {
        let mut h = host(app);
        let cat = h.cats.entry(label).or_insert_with(Cat::new);
        let first = !cat.page_ready;
        cat.page_ready = true;
        cat.last_friend = None;
        first && label == PANEL
    };
    log(&format!("page loaded for {label}"));
    // The main cat keeps the memory; hand it over before anything else happens.
    if label == PANEL {
        js_to(app, label, &format!("cat.memory({})", memory(app)));
    }
    push_options_to(app, label);
    if first {
        start_status_reports(app);
    }
}

// MARK: Window

fn window_size(scale: f64) -> LogicalSize<f64> {
    LogicalSize::new((DESIGN.0 * scale).round(), (DESIGN.1 * scale).round())
}

fn saved_origin(app: &AppHandle, label: &str) -> Option<PhysicalPosition<i32>> {
    let (x, y) = {
        let h = host(app);
        let p = prefix(label);
        (h.store.get(&format!("{p}originX"))?.as_f64()?, h.store.get(&format!("{p}originY"))?.as_f64()?)
    };
    let (x, y) = (x as i32, y as i32);
    // Only if an 80 px corner of the cat would still land on a connected screen.
    let visible = app.available_monitors().unwrap_or_default().iter().any(|monitor| {
        let (pos, size) = (monitor.position(), monitor.size());
        x < pos.x + size.width as i32 && pos.x < x + 80 && y < pos.y + size.height as i32 && pos.y < y + 80
    });
    visible.then(|| PhysicalPosition::new(x, y))
}

/// Bottom-right of the primary screen's work area (the taskbar is excluded), like the mac build.
/// The second cat sits just left of the main one.
fn default_origin(app: &AppHandle, label: &str, size: LogicalSize<f64>) -> PhysicalPosition<i32> {
    let Some(monitor) = app.primary_monitor().ok().flatten() else {
        return PhysicalPosition::new(0, 0);
    };
    let factor = monitor.scale_factor();
    if label != PANEL {
        if let Some(pos) = panel(app).and_then(|p| p.outer_position().ok()) {
            return PhysicalPosition::new(pos.x - (size.width * factor * 0.72).round() as i32, pos.y);
        }
    }
    let area = monitor.work_area();
    PhysicalPosition::new(
        area.position.x + area.size.width as i32 - (size.width * factor).round() as i32 - (20.0 * factor).round() as i32,
        area.position.y + area.size.height as i32 - (size.height * factor).round() as i32,
    )
}

fn save_origin(app: &AppHandle, label: &str, origin: (i32, i32)) {
    let mut h = host(app);
    let p = prefix(label);
    h.store.set(&format!("{p}originX"), json!(origin.0));
    h.store.set(&format!("{p}originY"), json!(origin.1));
}

fn apply_scale(app: &AppHandle, value: f64, keep_origin: bool) {
    let scale = value.clamp(0.4, 2.0);
    host(app).store.set("catScale", json!(scale));
    let size = window_size(scale);
    for (label, window) in panels(app) {
        let origin = match keep_origin {
            true => window.outer_position().ok(),
            false => None,
        }
        .or_else(|| saved_origin(app, label))
        .unwrap_or_else(|| default_origin(app, label, size));
        let _ = window.set_size(size);
        let _ = window.set_position(origin);
    }
}

fn create_panel(app: &AppHandle, label: &'static str) -> tauri::Result<()> {
    let scale = host(app).settings().scale;
    let size = window_size(scale);
    host(app).cats.insert(label, Cat::new());
    let panel = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("KeyCat")
        .inner_size(size.width, size.height)
        .visible(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .focusable(false)
        .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
        .additional_browser_args(BROWSER_ARGS)
        .initialization_script(BRIDGE)
        .on_page_load(move |window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                on_page_ready(window.app_handle(), label);
            }
        })
        .build()?;
    let origin = saved_origin(app, label).unwrap_or_else(|| default_origin(app, label, size));
    panel.set_position(origin)?;
    panel.set_ignore_cursor_events(true)?;
    panel.show()?;
    log(&format!("{label} created"));
    watch_page(app, label);
    Ok(())
}

/// WebView2 can fail without an error reaching us: the window stays blank and the page never
/// loads or never runs. A page that has not sent a single message 30 s after its window was
/// made (it answers the frame count every 15 s, see start_status_reports) goes in the log, and
/// the menu says so until it answers.
fn watch_page(app: &AppHandle, label: &'static str) {
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(30));
        let page_ready = {
            let mut h = host(&app);
            let Some(cat) = h.cats.get(label) else { return };
            if cat.answered {
                return;
            }
            let page_ready = cat.page_ready;
            h.page_failed = true;
            page_ready
        };
        log(&format!("{label} page has not answered 30 s after start (load finished: {page_ready})"));
        refresh_menu(&app);
    });
}

/// Adds or removes the second cat.
fn set_second_cat(app: &AppHandle, on: bool) {
    host(app).store.set("secondCat", json!(on));
    match (on, app.get_webview_window(PANEL2)) {
        (true, None) => {
            if let Err(error) = create_panel(app, PANEL2) {
                log(&format!("second cat failed: {error}"));
                host(app).cats.remove(PANEL2);
            }
        }
        (false, Some(window)) => {
            host(app).cats.remove(PANEL2);
            let _ = window.destroy();
            js_to(app, PANEL, "cat.friend(null)");
        }
        _ => {}
    }
    push_options(app);
}

// MARK: Frame loop

fn tick(app: &AppHandle) {
    if !host(app).cats.get(PANEL).is_some_and(|cat| cat.page_ready) {
        return;
    }
    release_lost_keys(app);
    let Ok(pointer) = app.cursor_position() else { return };
    let windows = panels(app);
    if let Some(drag) = host(app).drag.as_mut() {
        drag.last = (
            drag.origin.0 + (pointer.x - drag.cursor.0).round() as i32,
            drag.origin.1 + (pointer.y - drag.cursor.1).round() as i32,
        );
    }
    let dragged = host(app).drag.as_ref().map(|drag| (drag.label, drag.last));
    // Where each window is and its scale factor, for turning screen pixels into page pixels.
    let mut frames = Vec::new();
    for (label, window) in &windows {
        let origin = match dragged {
            Some((l, origin)) if l == *label => {
                let _ = window.set_position(PhysicalPosition::new(origin.0, origin.1));
                origin
            }
            _ => match window.outer_position() {
                Ok(pos) => (pos.x, pos.y),
                Err(_) => continue,
            },
        };
        let factor = window.scale_factor().unwrap_or(1.0);
        keep_size(app, window, factor);
        frames.push((*label, origin, factor));
    }
    keep_on_top(&windows);
    let delta = {
        let mut h = host(app);
        // The hook reports no pointer moves, so the movement is the pointer's change between
        // frames, in CSS pixels like the mac build's event deltas. It drives the mouse paw and
        // the pointer speed that makes the cat curious.
        let factor = frames.first().map(|f| f.2).unwrap_or(1.0);
        if let Some(last) = h.last_pointer.replace((pointer.x, pointer.y)) {
            h.pending_delta.0 += (pointer.x - last.0) / factor;
            h.pending_delta.1 += (pointer.y - last.1) / factor;
        }
        std::mem::replace(&mut h.pending_delta, (0.0, 0.0))
    };
    let to_page = |frame: &(&str, (i32, i32), f64), x: f64, y: f64| {
        (((x - f64::from(frame.1 .0)) / frame.2).round() as i32, ((y - f64::from(frame.1 .1)) / frame.2).round() as i32)
    };
    for (i, frame) in frames.iter().enumerate() {
        let label = frame.0;
        let cursor = to_page(frame, pointer.x, pointer.y);
        // Each cat knows where the other one's head is, to look at it and play: the scene puts
        // the head at the same place in the window at any size.
        let friend = frames.get(1 - i.min(1)).filter(|_| frames.len() > 1).map(|other| {
            let size = window_size(host(app).scale());
            let head = (f64::from(other.1 .0) + size.width * other.2 * 0.49, f64::from(other.1 .1) + size.height * other.2 * 0.36);
            to_page(frame, head.0, head.1)
        });
        let mut calls = Vec::new();
        {
            let mut h = host(app);
            let Some(cat) = h.cats.get_mut(label) else { continue };
            if cursor != cat.last_cursor {
                cat.last_cursor = cursor;
                calls.push(format!("cat.cursor({},{})", cursor.0, cursor.1));
            }
            if let Some(at) = friend {
                if cat.last_friend.map_or(true, |f| (f.0 - at.0).abs() + (f.1 - at.1).abs() > 2) {
                    cat.last_friend = Some(at);
                    calls.push(format!("cat.friend({},{})", at.0, at.1));
                }
            }
        }
        if delta != (0.0, 0.0) {
            calls.push(format!("cat.mouseMove({:.1},{:.1})", delta.0, delta.1));
        }
        if !calls.is_empty() {
            let script = calls.join(";");
            js_to(app, label, &script);
        }
    }
}

/// Holds the panel to the size picked in the menu. Users have seen it creep larger while the
/// pointer moves over the cat or the cat is dragged, which makes the cat grow; log.txt notes
/// the first few corrections so the cause can be traced.
fn keep_size(app: &AppHandle, panel: &WebviewWindow, factor: f64) {
    let Ok(actual) = panel.inner_size() else { return };
    let want = window_size(host(app).scale());
    let off = |have: u32, logical: f64| (f64::from(have) - (logical * factor).round()).abs() > 1.0;
    if !off(actual.width, want.width) && !off(actual.height, want.height) {
        return;
    }
    let fixes = {
        let mut h = host(app);
        h.size_fixes += 1;
        h.size_fixes
    };
    if fixes <= 5 {
        log(&format!(
            "panel was {}x{}, restoring {}x{} (scale factor {factor})",
            actual.width,
            actual.height,
            (want.width * factor).round(),
            (want.height * factor).round()
        ));
    }
    let _ = panel.set_size(want);
}

/// Feeds hook input and a ~60 fps tick to the main thread, where all the state lives. A tick is
/// skipped while the previous one is still queued (a menu is open, say) rather than piling up.
fn start_pump(app: &AppHandle) {
    let (sink, inputs) = mpsc::channel::<Input>();
    match hook::start(sink.clone()) {
        Ok(()) => {
            host(app).hook_ready = true;
            log("global input hook started");
        }
        Err(error) => log(&format!("global input hook failed: {error}")),
    }
    let app = app.clone();
    let queued = Arc::new(AtomicBool::new(false));
    thread::Builder::new()
        .name("pump".into())
        .spawn(move || {
            // Holding a sender keeps the channel open even if the hook never started.
            let _sink = sink;
            let frame = Duration::from_millis(16);
            let mut next = Instant::now() + frame;
            loop {
                match inputs.recv_timeout(next.saturating_duration_since(Instant::now())) {
                    Ok(input) => {
                        let app2 = app.clone();
                        let _ = app.run_on_main_thread(move || on_input(&app2, input));
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        next = Instant::now() + frame;
                        if !queued.swap(true, Ordering::AcqRel) {
                            let (app2, queued) = (app.clone(), queued.clone());
                            let _ = app.run_on_main_thread(move || {
                                queued.store(false, Ordering::Release);
                                tick(&app2);
                            });
                        }
                    }
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
        })
        .expect("spawn pump thread");
}

// MARK: Input

/// The cat window under the pointer, if any, with the pointer in screen pixels.
fn panel_under_pointer(app: &AppHandle) -> Option<(&'static str, WebviewWindow, (f64, f64))> {
    let pointer = app.cursor_position().ok()?;
    panels(app).into_iter().find_map(|(label, window)| {
        let (pos, size) = (window.outer_position().ok()?, window.outer_size().ok()?);
        let inside = pointer.x >= f64::from(pos.x)
            && pointer.x < f64::from(pos.x) + f64::from(size.width)
            && pointer.y >= f64::from(pos.y)
            && pointer.y < f64::from(pos.y) + f64::from(size.height);
        let hit = host(app).cats.get(label).map(|cat| cat.hit != "none").unwrap_or(false);
        (inside && hit).then_some((label, window, (pointer.x, pointer.y)))
    })
}

fn on_input(app: &AppHandle, input: Input) {
    match input {
        Input::Key { id, vk, code, down } => {
            {
                let mut h = host(app);
                // Autorepeat: one paw press per physical press.
                if down {
                    if h.held.contains_key(&id) {
                        return;
                    }
                    h.held.insert(id, Held { vk, code, since: Instant::now() });
                } else {
                    h.held.remove(&id);
                }
                h.key_events += 1;
            }
            if let Some(code) = code {
                js(app, &format!("cat.key('{code}',{down})"));
            }
        }
        Input::Button { button, down } => on_button(app, button, down),
        // Feed the wheel like a vertical mouse move, as the mac build does.
        Input::Wheel(notches) => host(app).pending_delta.1 += -notches * 0.4,
    }
}

/// A key the hook saw go down and not yet up.
struct Held {
    vk: u32,
    code: Option<&'static str>,
    since: Instant,
}

/// The hook never sees some key-ups: Win+L takes the keyboard to the lock screen before L and
/// Win come up, and a key let go over an administrator window is hidden from it. The key would
/// then stay down on the page and its label hang over the keyboard until pressed again. So, as
/// the mac build does, a key held for a while is checked against the keyboard itself twice a
/// second, and let go if it is not actually down.
fn release_lost_keys(app: &AppHandle) {
    let lost: Vec<Option<&'static str>> = {
        let mut h = host(app);
        if h.last_held_check.elapsed() < Duration::from_millis(500) {
            return;
        }
        h.last_held_check = Instant::now();
        let ids: Vec<u32> = h
            .held
            .iter()
            .filter(|(_, key)| key.since.elapsed() > Duration::from_millis(400) && !hook::is_down(key.vk))
            .map(|(id, _)| *id)
            .collect();
        ids.iter().filter_map(|id| h.held.remove(id)).map(|key| key.code).collect()
    };
    for code in lost.into_iter().flatten() {
        js(app, &format!("cat.key('{code}',false)"));
    }
}

fn on_button(app: &AppHandle, button: Button, down: bool) {
    if down {
        let click_through = host(app).settings().click_through;
        if !click_through {
            if let Some((label, window, pointer)) = panel_under_pointer(app) {
                let hit = host(app).cats.get(label).map(|cat| cat.hit.clone()).unwrap_or_default();
                match button {
                    Button::Right => show_context_menu(app, &window),
                    Button::Left if hit == "pet" => start_pet(app, label, &window, pointer),
                    Button::Left => start_drag(app, label, &window, pointer),
                    Button::Other => {}
                }
            }
        }
    } else {
        stop_pet(app);
        stop_drag(app);
    }
    js(app, &format!("cat.mouseButton({down})"));
}

fn start_pet(app: &AppHandle, label: &'static str, window: &WebviewWindow, pointer: (f64, f64)) {
    {
        let mut h = host(app);
        if h.petting.is_some() {
            return;
        }
        h.petting = Some(label);
    }
    let left = window.outer_position().map(|pos| f64::from(pos.x)).unwrap_or(0.0);
    let factor = window.scale_factor().unwrap_or(1.0);
    let script = format!("cat.pet(true, {})", ((pointer.0 - left) / factor).round());
    js_to(app, label, &script);
}

fn stop_pet(app: &AppHandle) {
    let Some(label) = host(app).petting.take() else { return };
    js_to(app, label, "cat.pet(false, 0)");
}

fn start_drag(app: &AppHandle, label: &'static str, window: &WebviewWindow, pointer: (f64, f64)) {
    let Ok(pos) = window.outer_position() else { return };
    {
        let mut h = host(app);
        if h.drag.is_some() {
            return;
        }
        h.drag = Some(Drag { label, cursor: pointer, origin: (pos.x, pos.y), last: (pos.x, pos.y) });
    }
    let _ = window.set_ignore_cursor_events(false);
}

fn stop_drag(app: &AppHandle) {
    let Some(drag) = host(app).drag.take() else { return };
    save_origin(app, drag.label, drag.last);
    update_click_targets(app);
}

/// Only the cat itself takes clicks, and in click-through mode not even that: everything goes
/// to the window underneath, and the menu is reached from the tray.
fn update_click_targets(app: &AppHandle) {
    for (label, window) in panels(app) {
        let ignore = {
            let h = host(app);
            if h.drag.as_ref().is_some_and(|drag| drag.label == label) {
                continue;
            }
            h.cats.get(label).map_or(true, |cat| cat.hit == "none") || h.settings().click_through
        };
        let _ = window.set_ignore_cursor_events(ignore);
    }
}

// MARK: Bridge

#[tauri::command]
fn host_message(app: AppHandle, webview: Webview, channel: String, message: Value) {
    match (webview.label(), channel.as_str()) {
        (label, "cat") => {
            if let Some(label) = cat_label(label) {
                on_cat_message(&app, label, &message);
            }
        }
        (SETTINGS, "settings") => on_settings_message(&app, &message),
        (STATS, "stats") => on_stats_message(&app, &message),
        _ => {}
    }
}

/// Messages from a cat's page: what is under the pointer, the memory to keep, a file to save,
/// a picture for the 今日小结 card, something to pass on to the other cat.
fn on_cat_message(app: &AppHandle, label: &'static str, message: &Value) {
    let recovered = {
        let mut h = host(app);
        if let Some(cat) = h.cats.get_mut(label) {
            cat.answered = true;
        }
        let recovered = h.page_failed && h.cats.values().all(|cat| cat.answered) && panel(app).is_some();
        if recovered {
            h.page_failed = false;
        }
        recovered
    };
    if recovered {
        log(&format!("{label} page answered"));
        refresh_menu(app);
    }
    if let Some(hit) = message.get("hit").and_then(Value::as_str) {
        if let Some(cat) = host(app).cats.get_mut(label) {
            cat.hit = hit.to_string();
        }
        update_click_targets(app);
    } else if let Some(ticks) = message.get("ticks").and_then(Value::as_f64) {
        write_status(app, ticks);
    } else if let Some(memory) = message.get("memory").filter(|m| m.is_object() && label == PANEL) {
        host(app).store.set("memory", memory.clone());
        stats_memory_changed(app);
    } else if let Some(file) = message.get("saveFile") {
        if let (Some(name), Some(data)) = (file.get("name").and_then(Value::as_str), file.get("base64").and_then(Value::as_str)) {
            save_picture(app, name, data);
        }
    } else if let Some(portrait) = message.get("portrait").and_then(Value::as_str) {
        if portrait.starts_with("data:image/png;base64,") {
            if let Some(window) = app.get_webview_window(STATS) {
                let _ = window.eval(format!("showPortrait({})", json!(portrait)));
            }
        }
    } else if let Some(event) = message.get("friend").and_then(Value::as_str).filter(|e| ["swat", "blink"].contains(e)) {
        let other = if label == PANEL { PANEL2 } else { PANEL };
        js_to(app, other, &format!("cat.friendEvent('{event}')"));
    }
}

fn on_settings_message(app: &AppHandle, body: &Value) {
    if let Some(tune) = body.get("tune").and_then(Value::as_object) {
        {
            let mut h = host(app);
            let mut merged = h.settings().tune;
            if let Some(saved) = merged.as_object_mut() {
                saved.extend(tune.clone());
            }
            h.store.set("tune", merged);
        }
        push_options(app);
    } else if let Some(preset) = body.get("preset").filter(|p| p.is_object()) {
        // A personality replaces every saved value at once.
        host(app).store.set("tune", preset.clone());
        push_options(app);
    } else if body.get("reset").and_then(Value::as_bool) == Some(true) {
        host(app).store.set("tune", json!({}));
        push_options(app);
    } else if let Some(test) = body.get("test").and_then(Value::as_str).filter(|t| t.bytes().all(|b| b.is_ascii_alphabetic())) {
        let script = format!("cat.test('{test}')");
        js_to(app, PANEL, &script);
    }
}

fn on_stats_message(app: &AppHandle, body: &Value) {
    if let Some(save) = body.get("save") {
        if let (Some(name), Some(data)) = (save.get("name").and_then(Value::as_str), save.get("base64").and_then(Value::as_str)) {
            save_picture(app, name, data);
        }
    } else if body.get("refresh").is_some() {
        refresh_stats(app);
    }
}

// MARK: Menu

type Item = Box<dyn IsMenuItem<Wry>>;

fn check(app: &AppHandle, id: String, text: &str, checked: bool) -> tauri::Result<Item> {
    Ok(Box::new(CheckMenuItem::with_id(app, id, text, true, checked, None::<&str>)?))
}

fn action(app: &AppHandle, id: &str, text: &str) -> tauri::Result<Item> {
    Ok(Box::new(MenuItem::with_id(app, id, text, true, None::<&str>)?))
}

fn note(app: &AppHandle, text: &str) -> tauri::Result<Item> {
    Ok(Box::new(MenuItem::new(app, text, false, None::<&str>)?))
}

fn separator(app: &AppHandle) -> tauri::Result<Item> {
    Ok(Box::new(PredefinedMenuItem::separator(app)?))
}

fn submenu(app: &AppHandle, text: &str, items: Vec<Item>) -> tauri::Result<Item> {
    let refs: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(|item| item.as_ref()).collect();
    Ok(Box::new(Submenu::with_items(app, text, true, &refs)?))
}

/// Radio-style items: each id saves `key = value` (the value as JSON) when clicked.
fn choice(app: &AppHandle, key: &str, current: &Value, options: &[(&str, Value)]) -> tauri::Result<Vec<Item>> {
    options
        .iter()
        .map(|(text, value)| check(app, format!("set:{key}={value}"), text, same(current, value)))
        .collect()
}

/// Settings written by the 1.0.x Electron build store whole numbers, so 60 has to match 60.0.
fn same(a: &Value, b: &Value) -> bool {
    match (a.as_f64(), b.as_f64()) {
        (Some(x), Some(y)) => x == y,
        _ => a == b,
    }
}

fn toggle(app: &AppHandle, text: &str, key: &str, on: bool) -> tauri::Result<Item> {
    check(app, format!("set:{key}={}", !on), text, on)
}

fn update_item(app: &AppHandle) -> tauri::Result<Item> {
    let version = app.package_info().version.to_string();
    if DEV {
        return note(app, &format!("开发模式 v{version}"));
    }
    match host(app).update.clone() {
        UpdateState::Ready(new) => action(app, "update:install", &format!("重启并更新到 v{new}")),
        UpdateState::Downloading(_, percent) => note(app, &format!("正在下载更新 {percent}%")),
        UpdateState::Checking => note(app, "正在检查更新…"),
        UpdateState::Current => note(app, &format!("已是最新版本 v{version}")),
        UpdateState::Failed => action(app, "update:check", "检查更新失败，点击重试"),
        UpdateState::Idle => action(app, "update:check", "检查更新…"),
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let (s, hook_ready, autostart, pomodoro, page_failed) = {
        let h = host(app);
        (h.settings(), h.hook_ready, h.autostart, h.pomodoro, h.page_failed)
    };
    let coat = s.coat.as_str();
    let coats = [
        ("黑猫", json!("black")),
        ("奶牛猫", json!("tuxedo")),
        ("橘猫", json!("orange")),
        ("蓝灰猫", json!("grey")),
        ("英短蓝金渐层", json!("britishBlueGolden")),
        ("白猫", json!("white")),
        ("三花猫", json!("calico")),
        ("暹罗猫", json!("siamese")),
        ("布偶猫", json!("ragdoll")),
        ("德文卷毛猫", json!("devon")),
        ("美短银虎斑", json!("silver")),
        ("狸花猫", json!("lihua")),
    ];
    // Things to do first, then the settings in three groups (the cat, the desk, its habits), then
    // window and app items. Same order and wording as the mac menu.
    let mut items = vec![
        check(app, "pomodoro".into(), if pomodoro { "结束番茄钟" } else { "开始番茄钟" }, pomodoro)?,
        action(app, "stats", "今日小结…")?,
        action(app, "record", "拍一张动图（3 秒）")?,
        separator(app)?,
    ];
    let mut look = vec![submenu(app, "毛色", choice(app, "coat", &json!(coat), &coats)?)?];
    // Only coats whose stripes would show get the choice; black and white stay plain.
    if coat == "orange" || coat == "grey" {
        let striped = s.pattern == "tabby" || (s.pattern == "auto" && coat == "orange");
        let current = json!(if striped { "tabby" } else { "solid" });
        let options = [("纯色", json!("solid")), ("虎斑条纹", json!("tabby"))];
        look.push(submenu(app, "花纹", choice(app, &format!("pattern.{coat}"), &current, &options)?)?);
    }
    // Colourpoint coats get the soft-points choice; the second cat shares the look, so its coat counts too.
    let points = |c: &str| c == "siamese" || c == "ragdoll";
    if points(coat) || (s.second_cat && points(&s.coat2)) {
        look.push(toggle(app, "重点色柔和渐变", "softPoints", s.soft_points)?);
    }
    let sizes = [("特小", 0.5), ("小", 0.7), ("中", 0.9), ("大", 1.1), ("特大", 1.35)]
        .iter()
        .map(|(text, value)| check(app, format!("scale:{value}"), text, s.scale == *value))
        .collect::<tauri::Result<Vec<_>>>()?;
    look.push(submenu(app, "大小", sizes)?);
    look.push(check(app, format!("set:style={}", json!(if s.style == "3d" { "2d" } else { "3d" })), "立体效果（3D）", s.style == "3d")?);
    look.push(separator(app)?);
    look.push(submenu(app, "眼睛颜色", choice(app, "eyeColor", &json!(s.eye), &[
        ("跟随毛色", json!("auto")),
        ("金色", json!("gold")),
        ("绿色", json!("green")),
        ("蓝色", json!("blue")),
        ("琥珀色", json!("amber")),
        ("鸳鸯眼（一蓝一金）", json!("odd")),
    ])?)?);
    look.push(submenu(app, "眼睛高光", choice(app, "eyeShine", &json!(s.shine), &[
        ("无", json!("none")),
        ("经典", json!("classic")),
        ("闪亮", json!("sparkle")),
    ])?)?);
    look.push(submenu(app, "手套颜色", choice(app, "gloves", &json!(s.gloves), &[
        ("跟随毛色", json!("auto")),
        ("白色", json!("white")),
        ("黑色", json!("black")),
        ("粉色", json!("pink")),
    ])?)?);
    look.push(submenu(app, "项圈", choice(app, "collar", &json!(s.collar), &[
        ("无", json!("none")),
        ("红色铃铛", json!("red")),
        ("蓝色铃铛", json!("blue")),
        ("粉色铃铛", json!("pink")),
        ("绿色铃铛", json!("green")),
    ])?)?);
    look.push(toggle(app, "腮红", "blush", s.blush)?);
    look.push(toggle(app, "胡须", "whiskers", s.whiskers)?);
    look.push(toggle(app, "节日装扮", "festival", s.festival)?);
    items.push(submenu(app, "外观", look)?);
    items.push(submenu(app, "桌面", vec![
        submenu(app, "键盘颜色", choice(app, "keyboardColor", &json!(s.keyboard_color), &[
            ("奶白", json!("cream")),
            ("黑灰", json!("dark")),
            ("樱粉", json!("pink")),
            ("薄荷", json!("mint")),
        ])?)?,
        toggle(app, "鼠标线", "mouseCable", s.mouse_cable)?,
        toggle(app, "桌上的杯子（它会推下去）", "cup", s.cup)?,
        submenu(app, "透明度", choice(app, "opacity", &json!(s.opacity), &[
            ("不透明", json!(1.0)),
            ("85%", json!(0.85)),
            ("70%", json!(0.7)),
            ("55%", json!(0.55)),
        ])?)?,
    ])?);
    items.push(submenu(app, "习性", vec![
        submenu(app, "多久睡着", choice(app, "sleepAfter", &json!(s.sleep_after), &[
            ("30 秒", json!(30.0)),
            ("1 分钟", json!(60.0)),
            ("3 分钟", json!(180.0)),
            ("10 分钟", json!(600.0)),
            ("不睡", json!(0.0)),
        ])?)?,
        toggle(app, "声音（摸它时呼噜）", "sound", s.sound)?,
        action(app, "settings", "调节反应…")?,
    ])?);
    items.push(submenu(app, "第二只猫", vec![
        check(app, "cat2".into(), "陪着它", s.second_cat)?,
        submenu(app, "它的毛色", choice(app, "cat2.coat", &json!(s.coat2), &coats)?)?,
        submenu(app, "怎么相处", choice(app, "pairMode", &json!(s.pair_mode), &[
            ("一起玩（各有键盘鼠标，会互相打闹）", json!("play")),
            ("分工（一只打字，一只管鼠标）", json!("split")),
        ])?)?,
    ])?);
    items.push(separator(app)?);
    items.push(toggle(app, "隐私模式（不显示键名）", "privacy", s.privacy)?);
    items.push(toggle(app, "鼠标穿透（点击直接落到下层窗口）", "clickThrough", s.click_through)?);
    items.push(action(app, "home", "回到右下角")?);
    let visible = panel(app).and_then(|panel| panel.is_visible().ok()).unwrap_or(false);
    items.push(action(app, "visibility", if visible { "隐藏" } else { "显示" })?);
    items.push(separator(app)?);
    if DEV {
        items.push(note(app, "开机自启（开发模式不可用）")?);
        items.push(note(app, "以管理员身份运行（开发模式不可用）")?);
    } else {
        items.push(check(app, "autostart".into(), "开机自启", autostart != Mode::Off)?);
        items.push(check(app, "admin".into(), "以管理员身份运行（游戏里也有按键反馈）", s.run_as_admin)?);
    }
    items.push(separator(app)?);
    items.push(update_item(app)?);
    if !DEV && !hook_ready {
        items.push(note(app, "键盘监听未启动（详见 log.txt）")?);
    }
    if page_failed {
        items.push(note(app, "猫的页面未加载（详见 log.txt）")?);
    }
    items.push(separator(app)?);
    items.push(action(app, "quit", "退出 KeyCat")?);
    let refs: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(|item| item.as_ref()).collect();
    Menu::with_items(app, &refs)
}

fn rebuild_menu(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY) else { return };
    match build_menu(app) {
        Ok(menu) => {
            let _ = tray.set_menu(Some(menu));
        }
        Err(error) => log(&format!("menu build failed: {error}")),
    }
}

/// Rebuilds the tray menu from any thread.
fn refresh_menu(app: &AppHandle) {
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || rebuild_menu(&app2));
}

fn show_context_menu(app: &AppHandle, panel: &WebviewWindow) {
    match build_menu(app) {
        Ok(menu) => {
            let _ = panel.popup_menu(&menu);
        }
        Err(error) => log(&format!("menu build failed: {error}")),
    }
}

/// Saves a look setting, sends it to the cat and redraws the menu so the checkmarks follow.
fn on_menu(app: &AppHandle, id: &str) {
    if let Some((key, raw)) = id.strip_prefix("set:").and_then(|rest| rest.split_once('=')) {
        if let Ok(value) = serde_json::from_str::<Value>(raw) {
            host(app).store.set(key, value);
            push_options(app);
            update_click_targets(app);
        }
    } else if let Some(value) = id.strip_prefix("scale:").and_then(|raw| raw.parse::<f64>().ok()) {
        apply_scale(app, value, true);
    } else {
        match id {
            "settings" => open_settings(app),
            "stats" => open_stats(app),
            "record" => js_to(app, PANEL, "cat.record(3)"),
            "pomodoro" => {
                {
                    let mut h = host(app);
                    h.pomodoro = !h.pomodoro;
                }
                push_options(app);
            }
            "cat2" => {
                let on = !host(app).settings().second_cat;
                set_second_cat(app, on);
            }
            "autostart" => {
                let on = host(app).autostart == Mode::Off;
                set_autostart(app, if on { autostart_mode(app) } else { Mode::Off });
            }
            "admin" => toggle_admin(app),
            "home" => {
                {
                    let mut h = host(app);
                    for key in ["originX", "originY", "cat2.originX", "cat2.originY"] {
                        h.store.remove(key);
                    }
                }
                let scale = host(app).settings().scale;
                apply_scale(app, scale, false);
            }
            "visibility" => {
                let show = !panel(app).and_then(|panel| panel.is_visible().ok()).unwrap_or(false);
                for (_, window) in panels(app) {
                    let _ = if show { window.show() } else { window.hide() };
                }
            }
            "update:check" => {
                tauri::async_runtime::spawn(check_for_updates(app.clone(), true));
            }
            "update:install" => install_update(app),
            "quit" => app.exit(0),
            _ => {}
        }
    }
    rebuild_menu(app);
}

// MARK: Administrator mode

/// How start at login has to work for the way KeyCat runs now. A copy outside Program Files
/// keeps the Run key even as administrator; it then asks at login through the UAC prompt.
fn autostart_mode(app: &AppHandle) -> Mode {
    if host(app).settings().run_as_admin && elevate::is_elevated() && autostart::task_allowed() {
        Mode::Task
    } else {
        Mode::RunKey
    }
}

fn set_autostart(app: &AppHandle, mode: Mode) {
    match autostart::set(mode) {
        Ok(()) => host(app).autostart = mode,
        Err(error) => log(&format!("autostart change to {mode:?} failed: {error}")),
    }
}

/// Moves an enabled start at login over to the kind that matches the administrator setting.
/// Without elevation the task can be neither made nor removed, so that waits for an elevated run.
fn sync_autostart(app: &AppHandle) {
    let current = host(app).autostart;
    let want = autostart_mode(app);
    if DEV || current == Mode::Off {
        return;
    }
    // Moved or reinstalled elsewhere: point the task at this copy, which a normal start then
    // hands over to without a UAC prompt (see prepare_launch).
    if current == Mode::Task && want == Mode::Task && !autostart::task_runs_this() {
        return set_autostart(app, Mode::Task);
    }
    if current == want {
        return;
    }
    if want == Mode::Task || elevate::is_elevated() {
        set_autostart(app, want);
    }
}

/// Turning it on restarts KeyCat elevated behind the UAC prompt; turning it off takes effect the
/// next time KeyCat starts, since an elevated program cannot drop its rights.
fn toggle_admin(app: &AppHandle) {
    let on = !host(app).settings().run_as_admin;
    host(app).store.set("runAsAdmin", json!(on));
    if on && !elevate::is_elevated() {
        match elevate::relaunch(&format!("--after {}", std::process::id())) {
            Ok(()) => {
                log("restarting as administrator");
                return app.exit(0);
            }
            Err(error) => {
                log(&format!("administrator restart declined: {error}"));
                host(app).store.set("runAsAdmin", json!(false));
            }
        }
    }
    sync_autostart(app);
}

/// Before anything else starts: a restart waits for the copy that launched it to quit (or
/// single-instance would close it), and with the administrator setting on, a normal start hands
/// over to an elevated one: through the login task when there is one, which asks nothing,
/// otherwise behind the UAC prompt. Returns false when this process should quit at once.
fn prepare_launch() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if let Some(pid) = args.iter().position(|arg| arg == "--after").and_then(|i| args.get(i + 1)?.parse().ok()) {
        elevate::wait_for_exit(pid);
        return true;
    }
    if DEV || elevate::is_elevated() {
        return true;
    }
    let Some(dir) = std::env::var_os("APPDATA") else { return true };
    let store = Store::open(PathBuf::from(dir).join(IDENTIFIER).join("settings.json"));
    // Declined, KeyCat still runs, just without key presses from elevated windows.
    store.get("runAsAdmin") != Some(&Value::Bool(true)) || (!autostart::run_task() && elevate::relaunch("").is_err())
}

// MARK: Settings window

fn open_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let height = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| f64::from(monitor.work_area().size.height) / monitor.scale_factor() - 60.0)
        .unwrap_or(860.0)
        .min(860.0);
    let built = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("settings.html".into()))
        .title("KeyCat 调节")
        .inner_size(420.0, height)
        .resizable(false)
        .maximizable(false)
        .center()
        .additional_browser_args(BROWSER_ARGS)
        .initialization_script(BRIDGE)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let tune = host(window.app_handle()).settings().tune;
                let _ = window.eval(format!("initTune({tune})"));
            }
        })
        .build();
    if let Err(error) = built {
        log(&format!("settings window failed: {error}"));
    }
}

// MARK: Stats window

/// The 今日小结 window: web/stats.html shows today's counts from the cat's memory and a picture of
/// the cat. Opening or refreshing it asks the cat to save its memory first, so the numbers are current.
fn open_stats(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(STATS) {
        let _ = window.show();
        let _ = window.set_focus();
        refresh_stats(app);
        return;
    }
    let built = WebviewWindowBuilder::new(app, STATS, WebviewUrl::App("stats.html".into()))
        .title("KeyCat 今日小结")
        .inner_size(380.0, 720.0)
        .resizable(false)
        .maximizable(false)
        .center()
        .additional_browser_args(BROWSER_ARGS)
        .initialization_script(BRIDGE)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                refresh_stats(window.app_handle());
            }
        })
        .build();
    if let Err(error) = built {
        log(&format!("stats window failed: {error}"));
    }
}

/// The cat posts its memory and a portrait; both come back through `on_cat_message`.
fn refresh_stats(app: &AppHandle) {
    js_to(app, PANEL, "cat.saveMemory(); cat.portrait()");
    stats_memory_changed(app);
}

fn stats_memory_changed(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(STATS) {
        let _ = window.eval(format!("initStats({})", memory(app)));
    }
}

/// Saves a picture the page made (拍一张, the 今日小结 card) into Pictures\KeyCat and shows it in
/// Explorer.
fn save_picture(app: &AppHandle, name: &str, base64: &str) {
    let safe = name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "-");
    let ext = safe.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if safe.starts_with('.') || !["gif", "png"].contains(&ext.as_str()) {
        return;
    }
    let Some(bytes) = decode_base64(base64) else { return };
    let Ok(dir) = app.path().picture_dir().map(|dir| dir.join("KeyCat")) else { return };
    let path = dir.join(&safe);
    match fs::create_dir_all(&dir).and_then(|_| fs::write(&path, bytes)) {
        Ok(()) => {
            log(&format!("saved {safe}"));
            reveal(&path);
        }
        Err(error) => log(&format!("saving {safe} failed: {error}")),
    }
}

fn decode_base64(text: &str) -> Option<Vec<u8>> {
    let value = |c: u8| match c {
        b'A'..=b'Z' => Some(c - b'A'),
        b'a'..=b'z' => Some(c - b'a' + 26),
        b'0'..=b'9' => Some(c - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    };
    let clean: Vec<u8> = text.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=').collect();
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    for chunk in clean.chunks(4) {
        let v: Vec<u8> = chunk.iter().map(|&c| value(c)).collect::<Option<_>>()?;
        let n = v.iter().enumerate().fold(0u32, |acc, (i, &d)| acc | u32::from(d) << (18 - 6 * i));
        out.extend_from_slice(&n.to_be_bytes()[1..v.len()]);
    }
    Some(out)
}

/// The cat sometimes ended up behind ordinary windows (VS Code, say) although it is always on
/// top, until a setting change put it back (#22): Windows can drop a window out of the topmost
/// band without telling it. So whenever another window comes to the front, and whenever a cat
/// window has lost its topmost style, it goes back on top, without taking the focus.
#[cfg(windows)]
fn keep_on_top(windows: &[(&'static str, WebviewWindow)]) {
    use std::sync::atomic::AtomicIsize;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowLongW, SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOOWNERZORDER, SWP_NOSIZE, WS_EX_TOPMOST,
    };
    static FRONT: AtomicIsize = AtomicIsize::new(0);
    let front = unsafe { GetForegroundWindow() }.0 as isize;
    let switched = FRONT.swap(front, Ordering::Relaxed) != front;
    for (_, window) in windows {
        let Ok(hwnd) = window.hwnd() else { continue };
        let topmost = (unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32) & WS_EX_TOPMOST.0 != 0;
        if switched || !topmost {
            unsafe {
                let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
            }
        }
    }
}

#[cfg(not(windows))]
fn keep_on_top(_windows: &[(&'static str, WebviewWindow)]) {}

#[cfg(windows)]
fn reveal(path: &std::path::Path) {
    let _ = std::process::Command::new("explorer").arg(format!("/select,{}", path.display())).spawn();
}

#[cfg(not(windows))]
fn reveal(_path: &std::path::Path) {}

// MARK: Status & updates

fn start_status_reports(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(2));
        loop {
            // The page counts frames into cat.state.ticks; reset it, then read it a second later.
            let app2 = app.clone();
            let _ = app.run_on_main_thread(move || js(&app2, "cat.state.ticks = 0"));
            thread::sleep(Duration::from_secs(1));
            let app2 = app.clone();
            let _ = app.run_on_main_thread(move || {
                js(&app2, "window.webkit.messageHandlers.cat.postMessage({ ticks: cat.state.ticks })")
            });
            thread::sleep(Duration::from_secs(14));
        }
    });
}

fn write_status(app: &AppHandle, ticks: f64) {
    let (hook_ready, key_events) = {
        let h = host(app);
        (h.hook_ready, h.key_events)
    };
    let line = format!(
        "{} keyboard={} keyEvents={key_events} fps={}\n",
        timestamp(),
        if hook_ready { "active" } else { "missing" },
        ticks.round()
    );
    let _ = fs::write(data_dir().join("status.txt"), line);
}

fn set_update(app: &AppHandle, state: UpdateState) {
    let changed = {
        let mut h = host(app);
        let changed = h.update != state;
        h.update = state;
        changed
    };
    if changed {
        refresh_menu(app);
    }
}

/// The check gives up after 10 s, so a network that cannot reach GitHub (common in mainland
/// China) fails fast instead of hanging in 正在检查更新…. The download gets longer, a few MB on
/// a slow line.
const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(10);
const UPDATE_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// Checks for a new version and downloads it. `manual` is a click on 检查更新…: only then does a
/// failure show in the menu. The timed checks fail quietly and are retried sooner (see
/// start_update_checks). Returns false if the check or the download failed.
async fn check_for_updates(app: AppHandle, manual: bool) -> bool {
    if DEV {
        return true;
    }
    {
        let mut h = host(&app);
        if matches!(h.update, UpdateState::Checking | UpdateState::Downloading(..) | UpdateState::Ready(_)) {
            return true;
        }
        h.update = UpdateState::Checking;
    }
    refresh_menu(&app);
    let failed = if manual { UpdateState::Failed } else { UpdateState::Idle };
    let found = match app.updater_builder().timeout(UPDATE_CHECK_TIMEOUT).build() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    let mut update = match found {
        Ok(Some(update)) => update,
        Ok(None) => {
            set_update(&app, UpdateState::Current);
            return true;
        }
        Err(error) => {
            log(&format!("update check failed: {error}"));
            set_update(&app, failed);
            return false;
        }
    };
    update.timeout = Some(UPDATE_DOWNLOAD_TIMEOUT);
    let version = update.version.clone();
    log(&format!("update {version} available"));
    set_update(&app, UpdateState::Downloading(version.clone(), 0));
    let (progress_app, progress_version) = (app.clone(), version.clone());
    let mut received = 0u64;
    let downloaded = update
        .download(
            move |chunk, total| {
                received += chunk as u64;
                if let Some(total) = total.filter(|total| *total > 0) {
                    let percent = (received * 100 / total).min(100) as u32;
                    set_update(&progress_app, UpdateState::Downloading(progress_version.clone(), percent));
                }
            },
            || {},
        )
        .await;
    match downloaded {
        Ok(bytes) => {
            log(&format!("update {version} downloaded"));
            host(&app).downloaded = Some((update, bytes));
            set_update(&app, UpdateState::Ready(version.clone()));
            if let Some(tray) = app.tray_by_id(TRAY) {
                let _ = tray.set_tooltip(Some(format!("KeyCat：v{version} 已下载，可从菜单重启更新")));
            }
            true
        }
        Err(error) => {
            log(&format!("update download failed: {error}"));
            set_update(&app, failed);
            false
        }
    }
}

/// Runs the downloaded installer, which closes this process and starts the new version.
fn install_update(app: &AppHandle) {
    let Some((update, bytes)) = host(app).downloaded.take() else { return };
    log(&format!("installing update {}", update.version));
    if let Err(error) = update.install(bytes) {
        log(&format!("update install failed: {error}"));
        set_update(app, UpdateState::Failed);
    }
}

fn start_update_checks(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || {
        const EVERY: Duration = Duration::from_secs(6 * 60 * 60);
        thread::sleep(Duration::from_secs(15));
        // After a failure the next try comes in 30 min, then 1 h, 2 h, 4 h, and from then on
        // every 6 h as usual, so a short outage is caught up soon and a blocked network is not
        // asked over and over.
        let mut retry = Duration::from_secs(30 * 60);
        loop {
            let wait = if tauri::async_runtime::block_on(check_for_updates(app.clone(), false)) {
                retry = Duration::from_secs(30 * 60);
                EVERY
            } else {
                let wait = retry;
                retry = (retry * 2).min(EVERY);
                log(&format!("next update check in {} min", wait.as_secs() / 60));
                wait
            };
            thread::sleep(wait);
        }
    });
}

// MARK: Lifecycle

fn setup(app: &AppHandle) -> tauri::Result<()> {
    let dir = app.path().app_data_dir()?;
    let _ = DATA_DIR.set(dir.clone());
    app.manage(Mutex::new(Host {
        store: Store::open(dir.join("settings.json")),
        hook_ready: false,
        cats: HashMap::new(),
        petting: None,
        drag: None,
        pending_delta: (0.0, 0.0),
        last_pointer: None,
        size_fixes: 0,
        key_events: 0,
        held: HashMap::new(),
        last_held_check: Instant::now(),
        autostart: if DEV { Mode::Off } else { autostart::current() },
        update: UpdateState::Idle,
        downloaded: None,
        pomodoro: false,
        page_failed: false,
    }));
    // Without its window KeyCat still starts, so the tray menu can say what went wrong.
    if let Err(error) = create_panel(app, PANEL) {
        log(&format!("{PANEL} failed: {error}"));
        host(app).page_failed = true;
    }
    let settings = host(app).settings();
    if settings.second_cat {
        set_second_cat(app, true);
    }
    TrayIconBuilder::with_id(TRAY)
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .tooltip("KeyCat")
        .show_menu_on_left_click(true)
        .build(app)?;
    start_pump(app);
    // Built after the hook came up, so a failed hook shows in the menu.
    rebuild_menu(app);
    start_update_checks(app);
    sync_autostart(app);
    log(&format!("started v{} elevated={}", app.package_info().version, elevate::is_elevated()));
    Ok(())
}

fn main() {
    if !prepare_launch() {
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(panel) = panel(app) {
                let _ = panel.show();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![host_message])
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .setup(|app| Ok(setup(app.handle())?))
        .build(tauri::generate_context!())
        .expect("failed to start KeyCat")
        .run(|_app, event| {
            // The app lives in the tray; closing the settings window must not quit it.
            if let RunEvent::ExitRequested { api, code: None, .. } = event {
                api.prevent_exit();
            }
        });
}
