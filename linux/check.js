// Checks the Linux host end to end: starts it from Playwright with its own data folder, clicks
// through the menu and checks what each item did to the settings, the windows and the page.
//
//   node check.js                  the unpacked host (npm start), on Linux or macOS
//   KEYCAT_APP=<binary> node check.js   a packaged build, e.g. the AppImage's extracted keycat
//
// On Linux with xdotool on the PATH (CI runs it under Xvfb) it also types and clicks for real,
// so key presses, petting and dragging go through the input helper and the X server.
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { _electron: electron } = require('playwright-core');

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'keycat-check-'));
const pictures = path.join(data, 'Pictures');
const xdotool = process.platform === 'linux' && (() => {
  try {
    execFileSync('xdotool', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const x = (...args) => execFileSync('xdotool', args.map(String));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(what, test, ms = 15e3) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await test();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(200);
  }
}

function step(text) {
  console.log(`- ${text}`);
}

(async () => {
  const sandbox = process.platform === 'linux' ? ['--no-sandbox'] : [];
  const app = await electron.launch({
    // Ubuntu 24.04 lets no unprivileged program make the user namespaces Chromium's sandbox
    // needs; the AppImage's launcher and the .deb's AppArmor profile sort that out for users.
    ...(process.env.KEYCAT_APP ? { executablePath: process.env.KEYCAT_APP, args: sandbox } : { executablePath: require('electron'), args: [__dirname, ...sandbox] }),
    env: { ...process.env, KEYCAT_DATA_DIR: data },
  });
  // What the pages print, shown when a step fails.
  const consoleLines = [];
  const listen = page => {
    page.on('console', m => consoleLines.push(`${page.url().split('/').pop()}: ${m.type()}: ${m.text()}`));
    page.on('pageerror', e => consoleLines.push(`${page.url().split('/').pop()}: error: ${e.message}`));
  };
  app.windows().forEach(listen);
  app.on('window', listen);
  // The host's internals, from the main process: main.js exports them for this script. Playwright
  // starts the app through a loader of its own, so main.js is found in the module cache.
  await app.evaluate(() => {
    const cache = process.mainModule.constructor._cache;
    const file = Object.keys(cache).find(name => /[\\/]src[\\/]main\.js$/.test(name));
    globalThis.keycat = cache[file].exports;
  });
  const main = (fn, arg) => app.evaluate(fn, arg);
  const hostState = () => main(() => {
    const { host, store } = globalThis.keycat;
    return {
      inputReady: host.inputReady,
      keyEvents: host.keyEvents,
      cats: [...host.cats.values()].filter(c => c.win && !c.win.isDestroyed()).map(c => ({ id: c.id, ready: c.pageReady, hit: c.hit, bounds: c.win.getBounds() })),
      settings: store.values,
      petting: host.petting,
      drag: !!host.drag,
      settingsWin: !!host.settingsWin,
      statsWin: !!host.statsWin,
    };
  });
  // Clicks the menu item at `labels`, e.g. ['外观', '毛色', '暹罗猫'], in a freshly built menu.
  const click = labels => main(({ app: _ }, labels) => {
    let items = globalThis.keycat.buildMenu().items;
    for (const [i, label] of labels.entries()) {
      const item = items.find(it => it.label === label);
      if (!item) throw new Error(`no menu item ${labels.slice(0, i + 1).join(' > ')}`);
      if (i === labels.length - 1) item.click();
      else items = item.submenu.items;
    }
  }, labels);
  const menuLabels = () => main(() => {
    const walk = items => items.flatMap(it => [it.label, ...(it.submenu ? walk(it.submenu.items) : [])]);
    return walk(globalThis.keycat.buildMenu().items).filter(Boolean);
  });
  const pageOf = async url => until(url, () => app.windows().find(w => w.url().endsWith(url)));

  try {
    await main(({ app: a }, dir) => a.setPath('pictures', dir), pictures);

    step('the cat page loads and reports its frame rate');
    await until('the page', async () => (await hostState()).cats.some(c => c.id === 'panel' && c.ready));
    const status = await until('status.txt', () => fs.existsSync(path.join(data, 'status.txt')) && fs.readFileSync(path.join(data, 'status.txt'), 'utf8'));
    assert.match(status, /fps=[1-9]/, status);
    const cat = await pageOf('index.html');
    assert.strictEqual(await cat.evaluate(() => typeof window.webkit.messageHandlers.cat.postMessage), 'function');

    step('the menu changes the look, saves it and sends it to the page');
    await click(['外观', '毛色', '暹罗猫']);
    assert.strictEqual((await hostState()).settings.coat, 'siamese');
    await until('the coat on the page', () => cat.evaluate(() => K.cat.look.coat === 'siamese'));
    assert.ok((await menuLabels()).includes('重点色柔和渐变'), 'soft points shows for siamese');
    assert.strictEqual(await cat.evaluate(() => K.cat.look.softPoints), true, 'soft points on by default');
    await click(['外观', '重点色柔和渐变']);
    await until('soft points off', () => cat.evaluate(() => K.cat.look.softPoints === false));
    await click(['习性', '多久睡着', '3 分钟']);
    assert.strictEqual((await hostState()).settings.sleepAfter, 180);
    await click(['外观', '大小', '大']);
    const big = (await hostState()).cats[0].bounds;
    assert.deepStrictEqual([big.width, big.height], [Math.round(360 * 1.1), Math.round(368 * 1.1)]);
    assert.ok(fs.readFileSync(path.join(data, 'settings.json'), 'utf8').includes('"catScale": 1.1'));

    step('key presses reach the page');
    await main(() => globalThis.keycat.onInput({ t: 'key', code: 'KeyF', down: true }));
    await until('the key on the page', () => cat.evaluate(() => cat.state.lastKey > 0));
    await main(() => globalThis.keycat.onInput({ t: 'key', code: 'KeyF', down: false }));

    step('a second cat comes and goes');
    await click(['第二只猫', '陪着它']);
    await until('the second cat', async () => (await hostState()).cats.some(c => c.id === 'panel2' && c.ready));
    const second = app.windows().filter(w => w.url().endsWith('index.html')).find(w => w !== cat);
    await until('the second cat seeing the first', () => second.evaluate(() => !!cat.state.friend));
    await click(['第二只猫', '陪着它']);
    await until('the second cat gone', async () => (await hostState()).cats.length === 1);

    step('调节反应… opens with the saved values and saves changes');
    await click(['习性', '调节反应…']);
    const tune = await pageOf('settings.html');
    await tune.waitForLoadState();
    await tune.evaluate(() => window.webkit.messageHandlers.settings.postMessage({ tune: { typeRate: 13 } }));
    await until('the tune saved', async () => (await hostState()).settings.tune?.typeRate === 13);
    await until('the tune on the page', () => cat.evaluate(() => TUNING.typeRate === 13));

    step('今日小结… gets the memory and a picture of the cat');
    await click(['今日小结…']);
    const stats = await pageOf('stats.html');
    await until('the portrait', () => stats.evaluate(() => (document.getElementById('portrait').src || '').startsWith('data:image/png')));

    if (xdotool) {
      step('real input: typing, petting, dragging (xdotool)');
      await until('the input helper', async () => (await hostState()).inputReady);
      const before = (await hostState()).keyEvents;
      x('key', '--delay', '80', 'a', 's', 'd');
      await until('three key presses', async () => (await hostState()).keyEvents >= before + 3);
      // Points on the head and on the body, from the page's own hit test.
      const spots = await cat.evaluate(() => {
        const out = {};
        for (let y = 10; y < innerHeight; y += 6) {
          for (let xx = 10; xx < innerWidth; xx += 6) {
            const hit = cat.hitTest(xx, y);
            if (hit !== 'none' && !out[hit]) out[hit] = [xx, y];
          }
        }
        return out;
      });
      assert.ok(spots.pet && spots.drag, JSON.stringify(spots));
      const b = (await hostState()).cats[0].bounds;
      x('mousemove', b.x + spots.pet[0], b.y + spots.pet[1]);
      await until('the head under the pointer', async () => (await hostState()).cats[0].hit === 'pet');
      x('mousedown', '1');
      await until('petting', () => cat.evaluate(() => cat.state.petting === true));
      x('mouseup', '1');
      await until('petting over', () => cat.evaluate(() => cat.state.petting === false));
      x('mousemove', b.x + spots.drag[0], b.y + spots.drag[1]);
      await until('the body under the pointer', async () => (await hostState()).cats[0].hit === 'drag');
      x('mousedown', '1');
      await until('dragging', async () => (await hostState()).drag);
      x('mousemove_relative', '--', '-60', '-40');
      await sleep(300);
      x('mouseup', '1');
      await until('the new place saved', async () => (await hostState()).settings.originX === b.x - 60);

      step('拍一张动图 saves a GIF in Pictures/KeyCat');
      await click(['拍一张动图（3 秒）']);
      await until('the GIF', () => fs.existsSync(path.join(pictures, 'KeyCat')) && fs.readdirSync(path.join(pictures, 'KeyCat')).some(f => f.endsWith('.gif')), 30e3);
    }

    const log = fs.readFileSync(path.join(data, 'log.txt'), 'utf8');
    assert.doesNotMatch(log, /failed/, log);
    console.log('ok');
  } catch (error) {
    for (const name of ['log.txt', 'status.txt']) {
      const file = path.join(data, name);
      console.error(`--- ${name}\n${fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '(none)'}`);
    }
    console.error(`--- page console\n${consoleLines.join('\n')}`);
    throw error;
  } finally {
    // 退出 KeyCat should end it within seconds. Only the process itself counts: app.close() also
    // waits for its output pipes, which whatever shell.showItemInFolder opened (拍一张动图) keeps.
    const proc = app.process();
    const exited = proc.exitCode !== null || proc.signalCode !== null
      || await Promise.race([new Promise(resolve => proc.once('exit', () => resolve(true))), sleep(15e3).then(() => false)].concat(app.close().then(() => true, () => true)));
    if (!exited) {
      console.error('KeyCat did not quit within 15 s');
      proc.kill('SIGKILL');
      process.exitCode = 1;
    }
    if (!process.env.KEYCAT_KEEP) fs.rmSync(data, { recursive: true, force: true });
    else console.log(`data in ${data}`);
  }
})().then(() => process.exit(), error => {
  console.error(error);
  process.exit(1);
});
