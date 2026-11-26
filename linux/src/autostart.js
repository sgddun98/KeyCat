// 开机自启: a desktop entry in ~/.config/autostart, which GNOME, KDE, Xfce and the rest start at
// login. It names the program to run, so it has to follow the AppImage when that is moved.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const file = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'keycat.desktop');

// The AppImage file itself, not the copy mounted under /tmp while it runs; the .deb's binary in /opt.
const program = () => process.env.APPIMAGE || process.execPath;

// Desktop entry Exec quoting: inside double quotes, ", `, $ and \ take a backslash.
const quote = text => `"${text.replace(/["`$\\]/g, '\\$&')}"`;

function entry() {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=KeyCat',
    'Comment=一只趴在键盘上的桌面猫',
    `Exec=${quote(program())}`,
    'Icon=keycat',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

function enabled() {
  return fs.existsSync(file());
}

function set(on) {
  if (on) {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), entry());
  } else {
    fs.rmSync(file(), { force: true });
  }
}

// Points an existing entry at this copy, after the AppImage was moved or replaced.
function sync() {
  try {
    if (enabled() && fs.readFileSync(file(), 'utf8') !== entry()) set(true);
  } catch {
    // Not worth failing the start over.
  }
}

module.exports = { enabled, set, sync };
