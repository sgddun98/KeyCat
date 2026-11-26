// settings.json in the data folder, the same keys as the mac and Windows builds
// (win/src/store.rs lists them). Every change is written at once to a temporary file that then
// replaces the old one, so a crash or power cut never leaves a truncated file.
'use strict';

const fs = require('fs');
const path = require('path');

class Store {
  constructor(file) {
    this.file = file;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.values = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch {
      this.values = {};
    }
  }

  get(key) {
    return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : undefined;
  }

  set(key, value) {
    this.values[key] = value;
    this.save();
  }

  remove(key) {
    delete this.values[key];
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(this.values, null, 2));
      fs.renameSync(temp, this.file);
    } catch {
      // A read-only home still runs the cat, just without remembering.
    }
  }
}

module.exports = { Store };
