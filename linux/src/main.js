// The Linux host for the web scene in ../web. Mirrors win/src/main.rs, which mirrors the mac
// build's mac/App.swift and mac/AppMenu.swift: a transparent, click-through floating window
// reports the pointer to the page, forwards global keyboard and mouse input, and offers the same
// tray menu. Electron draws the page: WebKitGTK, which Tauri would use here, leaves white
// blotches when a transparent window shows WebGL. Global input comes from ../input, a small
// X11 program (see there). electron-updater handles updates of the AppImage and the .deb.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app, BrowserWindow, Menu, Tray, ipcMain, screen, shell } = require('electron');
const { Store } = require('./store');
const autostart = require('./autostart');

const DESIGN = { width: 360, height: 368 }; // mac/App.swift designSize at scale 1
const PANEL = 'panel';
/** The second cat's window, when 第二只猫 is on. Its own settings carry the `cat2.` prefix. */
const PANEL2 = 'panel2';
const DEV = !app.isPackaged;
const WEB_DIR = DEV ? path.join(__dirname, '..', '..', 'web') : path.join(process.resourcesPath, 'web');
const INPUT = DEV ? path.join(__dirname, '..', 'input', 'target', 'release', 'keycat-input') : path.join(process.resourcesPath, 'keycat-input');
const ICONS = path.join(__dirname, '..', 'icons');
/** Wayland gives ordinary programs neither other windows' key presses nor the pointer. */
const WAYLAND = process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;

// Electron picks Wayland in a Wayland session, before this script runs. KeyCat needs X11
// (XWayland there): on Wayland a window can neither keep itself on top nor choose where it goes.
// The switch only counts on the command line, so start again with it.
function relaunchOnX11() {
  if (process.platform !== 'linux' || !WAYLAND || !process.env.DISPLAY || app.commandLine.hasSwitch('ozone-platform')) return false;
  app.relaunch({ execPath: process.env.APPIMAGE || process.execPath, args: [...process.argv.slice(1), '--ozone-platform=x11'] });
  app.exit(0);
  return true;
}

// Without a usable GPU (a virtual machine, a blocklisted driver) Chromium no longer falls back to
// drawing WebGL in software unless told to, and the page cannot start. The switch is "unsafe"
// for web pages from anywhere; KeyCat only loads its own.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

// settings.json, log.txt and status.txt live here: ~/.config/KeyCat. KEYCAT_DATA_DIR moves
// them, and Chromium's own files, elsewhere for tests.
if (process.env.KEYCAT_DATA_DIR) app.setPath('userData', path.resolve(process.env.KEYCAT_DATA_DIR));
const dataDir = app.getPath('userData');
const store = new Store(path.join(dataDir, 'settings.json'));

// MARK: State

const host = {
  inputReady: false,
  helper: null,
  helperRestarts: 0,
  /** What the host tracks per cat window, by PANEL / PANEL2. */
  cats: new Map(),
  /** The cat being petted, if any. */
  petting: null,
  drag: null,
  pendingDelta: { x: 0, y: 0 },
  lastPointer: null,
  keyEvents: 0,
  update: { state: 'idle' },
  /** Not remembered across restarts: a pomodoro started yesterday is over. */
  pomodoro: false,
  /** A cat window could not be made, or its page never answered (see watchPage). */
  pageFailed: false,
  tray: null,
  settingsWin: null,
  statsWin: null,
  quitting: false,
};

/** Settings with their defaults applied, the same keys and fallbacks as the mac and Windows builds. */
function settings() {
  const text = (key, fallback) => (typeof store.get(key) === 'string' ? store.get(key) : fallback);
  const number = key => (Number.isFinite(store.get(key)) ? store.get(key) : undefined);
  const on = key => store.get(key) === true;
  const notOff = key => store.get(key) !== false;
  const coat = text('coat', 'black');
  const scale = number('catScale');
  const opacity = number('opacity');
  const tune = store.get('tune');
  return {
    style: text('style', '2d'),
    coat,
    pattern: text(`pattern.${coat}`, 'auto'),
    eye: text('eyeColor', 'auto'),
    shine: text('eyeShine', 'classic'),
    collar: text('collar', 'none'),
    gloves: text('gloves', 'auto'),
    blush: on('blush'),
    whiskers: notOff('whiskers'),
    softPoints: notOff('softPoints'),
    mouseCable: notOff('mouseCable'),
    keyboardColor: text('keyboardColor', 'cream'),
    opacity: opacity >= 0.3 && opacity <= 1 ? opacity : 1,
    privacy: on('privacy'),
    clickThrough: on('clickThrough'),
    sleepAfter: number('sleepAfter') ?? 60,
    tune: tune && typeof tune === 'object' && !Array.isArray(tune) ? tune : {},
    scale: scale > 0.3 ? scale : 0.9,
    sound: on('sound'),
    festival: notOff('festival'),
    cup: notOff('cup'),
    secondCat: on('secondCat'),
    /** "play": both cats have a keyboard and mouse; "split": the main cat types, the second works the mouse. */
    pairMode: text('pairMode', 'play'),
    coat2: text('cat2.coat', 'orange'),
  };
}

/** The cat windows that exist, main cat first. */
function liveCats() {
  return [PANEL, PANEL2].map(id => host.cats.get(id)).filter(cat => cat && cat.win && !cat.win.isDestroyed());
}

/** Prefix of a cat's own keys in the store (position, coat). */
const prefix = id => (id === PANEL ? '' : 'cat2.');

// MARK: Logging

const timestamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

function log(text) {
  // Logging must never take the app down.
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, 'log.txt');
    // Past 1 MB the log moves to log.old.txt, replacing the one before, so the two stay small.
    try {
      if (fs.statSync(file).size > 1 << 20) fs.renameSync(file, path.join(dataDir, 'log.old.txt'));
    } catch {
      // No log yet.
    }
    fs.appendFileSync(file, `${timestamp()} ${text}\n`);
  } catch {
    // Nowhere to write.
  }
}

// MARK: Page

/** Input and anything else every cat should hear. */
function js(script) {
  for (const cat of liveCats()) jsTo(cat.id, script);
}

function jsTo(id, script) {
  const cat = host.cats.get(id);
  if (!cat || !cat.pageReady || !cat.win || cat.win.isDestroyed()) return;
  cat.win.webContents.executeJavaScript(script, false).catch(() => {});
}

function options(id) {
  const s = settings();
  const main = id === PANEL;
  const role = !(s.secondCat && s.pairMode === 'split') ? 'both' : main ? 'keys' : 'mouse';
  return {
    style: s.style,
    coat: main ? s.coat : s.coat2,
    pattern: main ? s.pattern : 'auto',
    eye: s.eye,
    shine: s.shine,
    blush: s.blush,
    whiskers: s.whiskers,
    collar: s.collar,
    softPoints: s.softPoints,
    gloves: s.gloves,
    cable: s.mouseCable,
    board: s.keyboardColor,
    opacity: s.opacity,
    privacy: s.privacy,
    sleepAfter: s.sleepAfter > 0 ? s.sleepAfter : 1e9,
    tune: s.tune,
    sound: s.sound,
    festival: s.festival,
    cup: s.cup,
    pomodoro: main && host.pomodoro,
    role,
    persist: main,
  };
}

function pushOptions() {
  for (const cat of liveCats()) pushOptionsTo(cat.id);
}

function pushOptionsTo(id) {
  jsTo(id, `cat.options(${JSON.stringify(options(id))})`);
}

/** What the cat remembers (web/life.js), as the page posted it. */
function memory() {
  const saved = store.get('memory');
  return saved && typeof saved === 'object' ? saved : null;
}

function onPageReady(id) {
  const cat = host.cats.get(id);
  if (!cat) return;
  const first = !cat.everReady && id === PANEL;
  cat.pageReady = cat.everReady = true;
  cat.lastFriend = null;
  log(`page loaded for ${id}`);
  // The main cat keeps the memory; hand it over before anything else happens.
  if (id === PANEL) jsTo(id, `cat.memory(${JSON.stringify(memory())})`);
  pushOptionsTo(id);
  if (first) startStatusReports();
}

// Every page window: the bridge, no Node, and nothing but the local pages.
function pagePrefs(extra = {}) {
  return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, ...extra };
}

function lockDown(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
}

// MARK: Window

const windowSize = scale => ({ width: Math.round(DESIGN.width * scale), height: Math.round(DESIGN.height * scale) });

function savedOrigin(id) {
  const x = store.get(`${prefix(id)}originX`);
  const y = store.get(`${prefix(id)}originY`);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // Only if an 80 px corner of the cat would still land on a connected screen.
  const visible = screen.getAllDisplays().some(({ bounds: b }) => x < b.x + b.width && b.x < x + 80 && y < b.y + b.height && b.y < y + 80);
  return visible ? { x: Math.round(x), y: Math.round(y) } : null;
}

/** Bottom-right of the primary screen's work area (panels excluded), like the mac build. The
 * second cat sits just left of the main one. */
function defaultOrigin(id, size) {
  const main = host.cats.get(PANEL);
  if (id !== PANEL && main && main.win && !main.win.isDestroyed()) {
    const [x, y] = main.win.getPosition();
    return { x: x - Math.round(size.width * 0.72), y };
  }
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - size.width - 20, y: area.y + area.height - size.height };
}

function saveOrigin(id, origin) {
  store.set(`${prefix(id)}originX`, origin.x);
  store.set(`${prefix(id)}originY`, origin.y);
}

function applyScale(value, keepOrigin) {
  const scale = Math.min(2, Math.max(0.4, value));
  store.set('catScale', scale);
  const size = windowSize(scale);
  for (const cat of liveCats()) {
    const [x, y] = cat.win.getPosition();
    const origin = (keepOrigin ? { x, y } : null) || savedOrigin(cat.id) || defaultOrigin(cat.id, size);
    cat.win.setBounds({ ...origin, ...size });
  }
}

function createPanel(id) {
  const size = windowSize(settings().scale);
  const cat = { id, win: null, pageReady: false, everReady: false, answered: false, hit: 'none', lastCursor: null, lastFriend: null };
  host.cats.set(id, cat);
  const origin = savedOrigin(id) || defaultOrigin(id, size);
  // Not focusable: on X11 that also takes it out of the window manager's hands, so it stays on
  // top on every workspace and never takes the focus from what you are typing in. Resizable
  // only so setBounds can change its size from the 大小 menu; it has no edges to drag.
  const win = new BrowserWindow({
    ...origin,
    ...size,
    title: 'KeyCat',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    // The purr is Web Audio and starts without a click on the page.
    webPreferences: pagePrefs({ backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }),
  });
  cat.win = win;
  lockDown(win);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true);
  win.webContents.on('did-finish-load', () => onPageReady(id));
  win.webContents.on('render-process-gone', (_event, details) => {
    log(`${id} page process gone (${details.reason}), reloading`);
    cat.pageReady = false;
    if (!win.isDestroyed()) win.reload();
  });
  win.once('ready-to-show', () => win.showInactive());
  win.loadFile(path.join(WEB_DIR, 'index.html'));
  log(`${id} created`);
  watchPage(id);
}

/** A page that has not sent a single message 30 s after its window was made (it answers the
 * frame count every 15 s, see startStatusReports) goes in the log, and the menu says so until
 * it answers. */
function watchPage(id) {
  setTimeout(() => {
    const cat = host.cats.get(id);
    if (!cat || cat.answered) return;
    host.pageFailed = true;
    log(`${id} page has not answered 30 s after start (load finished: ${cat.pageReady})`);
    rebuildMenu();
  }, 30e3);
}

/** Adds or removes the second cat. */
function setSecondCat(on) {
  store.set('secondCat', on);
  const cat = host.cats.get(PANEL2);
  if (on && !cat) {
    try {
      createPanel(PANEL2);
    } catch (error) {
      log(`second cat failed: ${error.message}`);
      host.cats.delete(PANEL2);
    }
  } else if (!on && cat) {
    host.cats.delete(PANEL2);
    if (!cat.win.isDestroyed()) cat.win.destroy();
    jsTo(PANEL, 'cat.friend(null)');
  }
  pushOptions();
}

// MARK: Frame loop

function tick() {
  if (!host.cats.get(PANEL)?.pageReady) return;
  const pointer = screen.getCursorScreenPoint();
  const drag = host.drag;
  if (drag) drag.last = { x: Math.round(drag.origin.x + pointer.x - drag.cursor.x), y: Math.round(drag.origin.y + pointer.y - drag.cursor.y) };
  // Where each window is, for turning screen points into page pixels; both are DIPs here.
  const frames = liveCats().map(cat => {
    if (drag && drag.id === cat.id) {
      cat.win.setPosition(drag.last.x, drag.last.y);
      return { cat, x: drag.last.x, y: drag.last.y };
    }
    const [x, y] = cat.win.getPosition();
    return { cat, x, y };
  });
  // The helper reports no pointer moves, so the movement is the pointer's change between frames.
  // It drives the mouse paw and the pointer speed that makes the cat curious.
  if (host.lastPointer) {
    host.pendingDelta.x += pointer.x - host.lastPointer.x;
    host.pendingDelta.y += pointer.y - host.lastPointer.y;
  }
  host.lastPointer = pointer;
  const delta = host.pendingDelta;
  host.pendingDelta = { x: 0, y: 0 };
  const size = windowSize(settings().scale);
  frames.forEach((frame, i) => {
    const { cat } = frame;
    const cursor = { x: Math.round(pointer.x - frame.x), y: Math.round(pointer.y - frame.y) };
    const calls = [];
    if (!cat.lastCursor || cursor.x !== cat.lastCursor.x || cursor.y !== cat.lastCursor.y) {
      cat.lastCursor = cursor;
      calls.push(`cat.cursor(${cursor.x},${cursor.y})`);
    }
    // Each cat knows where the other one's head is, to look at it and play: the scene puts the
    // head at the same place in the window at any size.
    const other = frames.length > 1 ? frames[1 - i] : null;
    if (other) {
      const at = { x: Math.round(other.x + size.width * 0.49 - frame.x), y: Math.round(other.y + size.height * 0.36 - frame.y) };
      if (!cat.lastFriend || Math.abs(cat.lastFriend.x - at.x) + Math.abs(cat.lastFriend.y - at.y) > 2) {
        cat.lastFriend = at;
        calls.push(`cat.friend(${at.x},${at.y})`);
      }
    }
    if (delta.x || delta.y) calls.push(`cat.mouseMove(${delta.x.toFixed(1)},${delta.y.toFixed(1)})`);
    if (calls.length) jsTo(cat.id, calls.join(';'));
  });
}

// MARK: Input

function startInput() {
  if (process.platform !== 'linux') {
    log('global input only on Linux');
    return;
  }
  if (!fs.existsSync(INPUT)) {
    log(`input helper missing: ${INPUT}`);
    return;
  }
  const child = spawn(INPUT, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  host.helper = child;
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        onInput(JSON.parse(line));
      } catch {
        // Not a whole event.
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', text => log(`input: ${text.trim()}`));
  child.on('error', error => log(`input helper failed: ${error.message}`));
  child.on('exit', (code, signal) => {
    host.helper = null;
    if (host.quitting) return;
    host.inputReady = false;
    log(`input helper exited (code ${code}, signal ${signal})`);
    rebuildMenu();
    // Once listening it should run until KeyCat quits; try again a few times, say after the X
    // server restarted. It exits at once without an X server, and then retrying does not help.
    if (host.helperRestarts++ < 3) setTimeout(startInput, 5e3);
  });
}

function onInput(event) {
  switch (event && event.t) {
    case 'ready':
      host.inputReady = true;
      log('global input started');
      rebuildMenu();
      break;
    case 'key':
      host.keyEvents += 1;
      if (typeof event.code === 'string' && /^[A-Za-z0-9]+$/.test(event.code)) js(`cat.key('${event.code}',${event.down === true})`);
      break;
    case 'button':
      onButton(event.button, event.down === true);
      break;
    case 'wheel':
      // Fed like a vertical mouse move, as the mac build does.
      if (Number.isFinite(event.notches)) host.pendingDelta.y += -event.notches * 0.4;
      break;
    default:
  }
}

/** The cat window under the pointer, if the pointer is on the cat itself. */
function catUnderPointer() {
  const pointer = screen.getCursorScreenPoint();
  const cat = liveCats().find(c => {
    const b = c.win.getBounds();
    return c.win.isVisible() && pointer.x >= b.x && pointer.x < b.x + b.width && pointer.y >= b.y && pointer.y < b.y + b.height;
  });
  return cat && cat.hit !== 'none' ? { cat, pointer } : null;
}

function onButton(button, down) {
  if (down) {
    const under = settings().clickThrough ? null : catUnderPointer();
    if (under) {
      if (button === 'right') showContextMenu(under.cat.win);
      else if (button === 'left' && under.cat.hit === 'pet') startPet(under.cat, under.pointer);
      else if (button === 'left') startDrag(under.cat, under.pointer);
    }
  } else {
    stopPet();
    stopDrag();
  }
  js(`cat.mouseButton(${down})`);
}

function startPet(cat, pointer) {
  if (host.petting) return;
  host.petting = cat.id;
  jsTo(cat.id, `cat.pet(true, ${Math.round(pointer.x - cat.win.getPosition()[0])})`);
}

function stopPet() {
  if (!host.petting) return;
  jsTo(host.petting, 'cat.pet(false, 0)');
  host.petting = null;
}

function startDrag(cat, pointer) {
  if (host.drag) return;
  const [x, y] = cat.win.getPosition();
  host.drag = { id: cat.id, cursor: pointer, origin: { x, y }, last: { x, y } };
  cat.win.setIgnoreMouseEvents(false);
}

function stopDrag() {
  const drag = host.drag;
  if (!drag) return;
  host.drag = null;
  saveOrigin(drag.id, drag.last);
  updateClickTargets();
}

/** Only the cat itself takes clicks, and in click-through mode not even that: everything goes to
 * the window underneath, and the menu is reached from the tray. */
function updateClickTargets() {
  const clickThrough = settings().clickThrough;
  for (const cat of liveCats()) {
    if (host.drag && host.drag.id === cat.id) continue;
    cat.win.setIgnoreMouseEvents(cat.hit === 'none' || clickThrough);
  }
}

// MARK: Bridge

ipcMain.on('host-message', (event, channel, message) => {
  if (!message || typeof message !== 'object') return;
  const win = BrowserWindow.fromWebContents(event.sender);
  const cat = liveCats().find(c => c.win === win);
  if (cat && channel === 'cat') onCatMessage(cat, message);
  else if (win && win === host.settingsWin && channel === 'settings') onSettingsMessage(message);
  else if (win && win === host.statsWin && channel === 'stats') onStatsMessage(message);
});

/** Messages from a cat's page: what is under the pointer, the memory to keep, a file to save, a
 * picture for the 今日小结 card, something to pass on to the other cat. */
function onCatMessage(cat, message) {
  cat.answered = true;
  if (host.pageFailed && liveCats().every(c => c.answered) && host.cats.has(PANEL)) {
    host.pageFailed = false;
    log(`${cat.id} page answered`);
    rebuildMenu();
  }
  if (typeof message.hit === 'string') {
    cat.hit = message.hit;
    updateClickTargets();
  } else if (Number.isFinite(message.ticks)) {
    writeStatus(message.ticks);
  } else if (message.memory && typeof message.memory === 'object' && cat.id === PANEL) {
    store.set('memory', message.memory);
    statsMemoryChanged();
  } else if (message.saveFile && typeof message.saveFile === 'object') {
    savePicture(message.saveFile.name, message.saveFile.base64);
  } else if (typeof message.portrait === 'string') {
    if (message.portrait.startsWith('data:image/png;base64,') && host.statsWin && !host.statsWin.isDestroyed()) {
      host.statsWin.webContents.executeJavaScript(`showPortrait(${JSON.stringify(message.portrait)})`).catch(() => {});
    }
  } else if (message.friend === 'swat' || message.friend === 'blink') {
    jsTo(cat.id === PANEL ? PANEL2 : PANEL, `cat.friendEvent('${message.friend}')`);
  }
}

function onSettingsMessage(body) {
  if (body.tune && typeof body.tune === 'object') {
    store.set('tune', { ...settings().tune, ...body.tune });
    pushOptions();
  } else if (body.preset && typeof body.preset === 'object') {
    // A personality replaces every saved value at once.
    store.set('tune', body.preset);
    pushOptions();
  } else if (body.reset === true) {
    store.set('tune', {});
    pushOptions();
  } else if (typeof body.test === 'string' && /^[A-Za-z]+$/.test(body.test)) {
    jsTo(PANEL, `cat.test('${body.test}')`);
  }
}

function onStatsMessage(body) {
  if (body.save && typeof body.save === 'object') savePicture(body.save.name, body.save.base64);
  else if (body.refresh) refreshStats();
}

// MARK: Menu

const COATS = [
  ['黑猫', 'black'],
  ['奶牛猫', 'tuxedo'],
  ['橘猫', 'orange'],
  ['蓝灰猫', 'grey'],
  ['白猫', 'white'],
  ['三花猫', 'calico'],
  ['暹罗猫', 'siamese'],
  ['布偶猫', 'ragdoll'],
  ['德文卷毛猫', 'devon'],
  ['美短银虎斑', 'silver'],
  ['狸花猫', 'lihua'],
];

const separator = { type: 'separator' };
const note = label => ({ label, enabled: false });
const action = (label, click) => ({ label, click: () => afterMenu(click) });
const check = (label, checked, click) => ({ label, type: 'checkbox', checked, click: () => afterMenu(click) });
const submenu = (label, items) => ({ label, submenu: items });

/** Saves a look setting, sends it to the cats and redraws the menu so the checkmarks follow. */
function set(key, value) {
  store.set(key, value);
  pushOptions();
  updateClickTargets();
}

/** Radio-style items: each saves `key = value` when clicked. */
const choice = (key, current, list) => list.map(([label, value]) => check(label, current === value, () => set(key, value)));
const toggle = (label, key, on) => check(label, on, () => set(key, !on));

function afterMenu(click) {
  click();
  rebuildMenu();
}

function updateItem() {
  const version = app.getVersion();
  if (DEV) return note(`开发模式 v${version}`);
  if (!updater()) return note(`KeyCat v${version}`);
  const u = host.update;
  switch (u.state) {
    case 'ready':
      return action(`重启并更新到 v${u.version}`, installUpdate);
    case 'downloading':
      return note(`正在下载更新 ${u.percent}%`);
    case 'checking':
      return note('正在检查更新…');
    case 'current':
      return note(`已是最新版本 v${version}`);
    case 'failed':
      return action('检查更新失败，点击重试', () => checkForUpdates(true));
    default:
      return action('检查更新…', () => checkForUpdates(true));
  }
}

function buildMenu() {
  const s = settings();
  const coat = s.coat;
  // Things to do first, then the settings in three groups (the cat, the desk, its habits), then
  // window and app items. Same order and wording as the mac and Windows menus.
  const items = [
    check(host.pomodoro ? '结束番茄钟' : '开始番茄钟', host.pomodoro, () => {
      host.pomodoro = !host.pomodoro;
      pushOptions();
    }),
    action('今日小结…', openStats),
    action('拍一张动图（3 秒）', () => jsTo(PANEL, 'cat.record(3)')),
    separator,
  ];
  const look = [submenu('毛色', choice('coat', coat, COATS))];
  // Only coats whose stripes would show get the choice; black and white stay plain.
  if (coat === 'orange' || coat === 'grey') {
    const striped = s.pattern === 'tabby' || (s.pattern === 'auto' && coat === 'orange');
    look.push(submenu('花纹', choice(`pattern.${coat}`, striped ? 'tabby' : 'solid', [['纯色', 'solid'], ['虎斑条纹', 'tabby']])));
  }
  // Colourpoint coats get the soft-points choice; the second cat shares the look, so its coat counts too.
  const points = c => c === 'siamese' || c === 'ragdoll';
  if (points(coat) || (s.secondCat && points(s.coat2))) look.push(toggle('重点色柔和渐变', 'softPoints', s.softPoints));
  const sizes = [['特小', 0.5], ['小', 0.7], ['中', 0.9], ['大', 1.1], ['特大', 1.35]];
  look.push(submenu('大小', sizes.map(([label, value]) => check(label, s.scale === value, () => applyScale(value, true)))));
  look.push(check('立体效果（3D）', s.style === '3d', () => set('style', s.style === '3d' ? '2d' : '3d')));
  look.push(separator);
  look.push(submenu('眼睛颜色', choice('eyeColor', s.eye, [
    ['跟随毛色', 'auto'],
    ['金色', 'gold'],
    ['绿色', 'green'],
    ['蓝色', 'blue'],
    ['琥珀色', 'amber'],
    ['鸳鸯眼（一蓝一金）', 'odd'],
  ])));
  look.push(submenu('眼睛高光', choice('eyeShine', s.shine, [['无', 'none'], ['经典', 'classic'], ['闪亮', 'sparkle']])));
  look.push(submenu('手套颜色', choice('gloves', s.gloves, [['跟随毛色', 'auto'], ['白色', 'white'], ['黑色', 'black'], ['粉色', 'pink']])));
  look.push(submenu('项圈', choice('collar', s.collar, [
    ['无', 'none'],
    ['红色铃铛', 'red'],
    ['蓝色铃铛', 'blue'],
    ['粉色铃铛', 'pink'],
    ['绿色铃铛', 'green'],
  ])));
  look.push(toggle('腮红', 'blush', s.blush));
  look.push(toggle('胡须', 'whiskers', s.whiskers));
  look.push(toggle('节日装扮', 'festival', s.festival));
  items.push(submenu('外观', look));
  items.push(submenu('桌面', [
    submenu('键盘颜色', choice('keyboardColor', s.keyboardColor, [['奶白', 'cream'], ['黑灰', 'dark'], ['樱粉', 'pink'], ['薄荷', 'mint']])),
    toggle('鼠标线', 'mouseCable', s.mouseCable),
    toggle('桌上的杯子（它会推下去）', 'cup', s.cup),
    submenu('透明度', choice('opacity', s.opacity, [['不透明', 1], ['85%', 0.85], ['70%', 0.7], ['55%', 0.55]])),
  ]));
  items.push(submenu('习性', [
    submenu('多久睡着', choice('sleepAfter', s.sleepAfter, [['30 秒', 30], ['1 分钟', 60], ['3 分钟', 180], ['10 分钟', 600], ['不睡', 0]])),
    toggle('声音（摸它时呼噜）', 'sound', s.sound),
    action('调节反应…', openSettings),
  ]));
  items.push(submenu('第二只猫', [
    check('陪着它', s.secondCat, () => setSecondCat(!s.secondCat)),
    submenu('它的毛色', choice('cat2.coat', s.coat2, COATS)),
    submenu('怎么相处', choice('pairMode', s.pairMode, [
      ['一起玩（各有键盘鼠标，会互相打闹）', 'play'],
      ['分工（一只打字，一只管鼠标）', 'split'],
    ])),
  ]));
  items.push(separator);
  items.push(toggle('隐私模式（不显示键名）', 'privacy', s.privacy));
  items.push(toggle('鼠标穿透（点击直接落到下层窗口）', 'clickThrough', s.clickThrough));
  items.push(action('回到右下角', () => {
    for (const key of ['originX', 'originY', 'cat2.originX', 'cat2.originY']) store.remove(key);
    applyScale(settings().scale, false);
  }));
  const main = host.cats.get(PANEL);
  const visible = !!(main && main.win && !main.win.isDestroyed() && main.win.isVisible());
  items.push(action(visible ? '隐藏' : '显示', () => {
    for (const cat of liveCats()) {
      if (visible) cat.win.hide();
      else cat.win.showInactive();
    }
  }));
  items.push(separator);
  if (DEV) {
    items.push(note('开机自启（开发模式不可用）'));
  } else {
    const on = autostart.enabled();
    items.push(check('开机自启', on, () => {
      try {
        autostart.set(!on);
      } catch (error) {
        log(`autostart change failed: ${error.message}`);
      }
    }));
  }
  items.push(separator);
  items.push(updateItem());
  if (WAYLAND) items.push(note('Wayland 会话收不到其他程序的按键，请在登录界面改用 Xorg'));
  else if (!DEV && !host.inputReady) items.push(note('键盘监听未启动（详见 log.txt）'));
  if (host.pageFailed) items.push(note('猫的页面未加载（详见 log.txt）'));
  items.push(separator);
  items.push(action('退出 KeyCat', () => app.quit()));
  return Menu.buildFromTemplate(items);
}

/** The tray shows a menu, not a click: on Linux it has to be handed a new one after each change. */
function rebuildMenu() {
  if (!host.tray) return;
  try {
    host.tray.setContextMenu(buildMenu());
  } catch (error) {
    log(`menu build failed: ${error.message}`);
  }
}

function showContextMenu(win) {
  try {
    buildMenu().popup({ window: win });
  } catch (error) {
    log(`menu build failed: ${error.message}`);
  }
}

// MARK: Settings and stats windows

function openPage(key, file, title, size, onLoad) {
  const open = host[key];
  if (open && !open.isDestroyed()) {
    open.show();
    open.focus();
    return open;
  }
  const win = new BrowserWindow({
    ...size,
    title,
    resizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    icon: path.join(ICONS, 'icon.png'),
    webPreferences: pagePrefs(),
  });
  host[key] = win;
  win.setMenu(null);
  lockDown(win);
  win.on('page-title-updated', event => event.preventDefault());
  win.on('closed', () => {
    if (host[key] === win) host[key] = null;
  });
  win.webContents.on('did-finish-load', onLoad);
  win.loadFile(path.join(WEB_DIR, file));
  return null;
}

function openSettings() {
  const height = Math.min(860, screen.getPrimaryDisplay().workAreaSize.height - 60);
  openPage('settingsWin', 'settings.html', 'KeyCat 调节', { width: 420, height }, () => {
    host.settingsWin.webContents.executeJavaScript(`initTune(${JSON.stringify(settings().tune)})`).catch(() => {});
  });
}

/** The 今日小结 window: web/stats.html shows today's counts from the cat's memory and a picture
 * of the cat. Opening or refreshing it asks the cat to save its memory first, so the numbers are
 * current. */
function openStats() {
  if (openPage('statsWin', 'stats.html', 'KeyCat 今日小结', { width: 380, height: 720 }, refreshStats)) refreshStats();
}

/** The cat posts its memory and a portrait; both come back through onCatMessage. */
function refreshStats() {
  jsTo(PANEL, 'cat.saveMemory(); cat.portrait()');
  statsMemoryChanged();
}

function statsMemoryChanged() {
  const win = host.statsWin;
  if (win && !win.isDestroyed()) win.webContents.executeJavaScript(`initStats(${JSON.stringify(memory())})`).catch(() => {});
}

/** Saves a picture the page made (拍一张, the 今日小结 card) into Pictures/KeyCat and shows it in
 * the file manager. */
function savePicture(name, base64) {
  if (typeof name !== 'string' || typeof base64 !== 'string') return;
  const safe = name.replace(/[/\\:*?"<>|]/g, '-');
  const ext = safe.split('.').pop().toLowerCase();
  if (safe.startsWith('.') || !['gif', 'png'].includes(ext)) return;
  const dir = path.join(app.getPath('pictures'), 'KeyCat');
  const file = path.join(dir, safe);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, Buffer.from(base64, 'base64'));
    log(`saved ${safe}`);
    shell.showItemInFolder(file);
  } catch (error) {
    log(`saving ${safe} failed: ${error.message}`);
  }
}

// MARK: Status & updates

function startStatusReports() {
  setTimeout(function report() {
    // The page counts frames into cat.state.ticks; reset it, then read it a second later.
    js('cat.state.ticks = 0');
    setTimeout(() => js('window.webkit.messageHandlers.cat.postMessage({ ticks: cat.state.ticks })'), 1e3);
    setTimeout(report, 15e3);
  }, 2e3);
}

function writeStatus(ticks) {
  const line = `${timestamp()} keyboard=${host.inputReady ? 'active' : 'missing'} keyEvents=${host.keyEvents} fps=${Math.round(ticks)}\n`;
  try {
    fs.writeFileSync(path.join(dataDir, 'status.txt'), line);
  } catch {
    // Nowhere to write.
  }
}

let autoUpdater;
/** electron-updater, for the AppImage (replaces the file) and the .deb (installs it with pkexec).
 * A copy run some other way, from the unpacked folder say, does not update. It reads
 * latest-linux.yml from the latest release (publish in package.json). */
function updater() {
  if (autoUpdater !== undefined) return autoUpdater;
  autoUpdater = null;
  if (DEV) return null;
  let deb = false;
  try {
    deb = fs.readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim() === 'deb';
  } catch {
    // Not from the .deb.
  }
  if (!process.env.APPIMAGE && !deb) return null;
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = { info() {}, debug() {}, warn: text => log(`updater: ${text}`), error: text => log(`updater: ${text}`) };
  autoUpdater.on('download-progress', progress => {
    if (host.update.state !== 'downloading') return;
    const percent = Math.min(100, Math.round(progress.percent));
    if (percent !== host.update.percent) setUpdate({ ...host.update, percent });
  });
  return autoUpdater;
}

function setUpdate(state) {
  host.update = state;
  rebuildMenu();
}

/** The check gives up after 10 s, so a network that cannot reach GitHub (common in mainland
 * China) fails fast instead of hanging in 正在检查更新…. The download gets longer, the AppImage
 * is about 100 MB. */
const UPDATE_CHECK_TIMEOUT = 10e3;
const UPDATE_DOWNLOAD_TIMEOUT = 30 * 60e3;

const timeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1e3} s`)), ms))]);

/** Checks for a new version and downloads it. `manual` is a click on 检查更新…: only then does a
 * failure show in the menu. Returns false if the check or the download failed. */
async function checkForUpdates(manual) {
  const u = updater();
  if (!u || ['checking', 'downloading', 'ready'].includes(host.update.state)) return true;
  setUpdate({ state: 'checking' });
  let version;
  try {
    const found = await timeout(u.checkForUpdates(), UPDATE_CHECK_TIMEOUT);
    if (!found || !found.isUpdateAvailable) {
      setUpdate({ state: 'current' });
      return true;
    }
    version = found.updateInfo.version;
    log(`update ${version} available`);
    setUpdate({ state: 'downloading', version, percent: 0 });
    await timeout(u.downloadUpdate(), UPDATE_DOWNLOAD_TIMEOUT);
    log(`update ${version} downloaded`);
    setUpdate({ state: 'ready', version });
    if (host.tray) host.tray.setToolTip(`KeyCat：v${version} 已下载，可从菜单重启更新`);
    return true;
  } catch (error) {
    log(`update ${version ? 'download' : 'check'} failed: ${error.message}`);
    setUpdate({ state: manual ? 'failed' : 'idle' });
    return false;
  }
}

/** Replaces the AppImage, or installs the .deb behind the password prompt, and starts the new version. */
function installUpdate() {
  if (host.update.state !== 'ready') return;
  log(`installing update ${host.update.version}`);
  host.quitting = true;
  updater().quitAndInstall(true, true);
}

function startUpdateChecks() {
  if (!updater()) return;
  const EVERY = 6 * 60 * 60e3;
  // After a failure the next try comes in 30 min, then 1 h, 2 h, 4 h, and from then on every
  // 6 h as usual, so a short outage is caught up soon and a blocked network is not asked over and over.
  let retry = 30 * 60e3;
  const run = async () => {
    let wait = EVERY;
    if (await checkForUpdates(false)) {
      retry = 30 * 60e3;
    } else {
      wait = retry;
      retry = Math.min(retry * 2, EVERY);
      log(`next update check in ${wait / 60e3} min`);
    }
    setTimeout(run, wait);
  };
  setTimeout(run, 15e3);
}

// MARK: Lifecycle

function start() {
  // Without its window KeyCat still starts, so the tray menu can say what went wrong.
  try {
    createPanel(PANEL);
  } catch (error) {
    log(`${PANEL} failed: ${error.message}`);
    host.pageFailed = true;
  }
  if (settings().secondCat) setSecondCat(true);
  try {
    host.tray = new Tray(path.join(ICONS, 'tray.png'));
    host.tray.setToolTip('KeyCat');
  } catch (error) {
    log(`tray failed: ${error.message}`);
  }
  startInput();
  rebuildMenu();
  setInterval(tick, 16);
  startUpdateChecks();
  if (!DEV) autostart.sync();
  log(`started v${app.getVersion()} session=${process.env.XDG_SESSION_TYPE || 'unknown'}`);
}

if (!relaunchOnX11()) {
  if (!app.requestSingleInstanceLock()) {
    app.exit(0);
  } else {
    app.on('second-instance', () => {
      for (const cat of liveCats()) cat.win.showInactive();
    });
    // The app lives in the tray; closing the settings window must not quit it.
    app.on('window-all-closed', () => {});
    app.on('before-quit', () => {
      host.quitting = true;
      if (host.helper) host.helper.kill();
    });
    // A transparent window made right at startup can come up opaque on some X11 setups; the
    // compositor needs a moment after the app is ready.
    app.whenReady().then(() => setTimeout(start, 300));
  }
}

// For linux/check.js, which drives the host from Playwright in place of the input helper and the tray.
module.exports = { host, store, buildMenu, onInput };
