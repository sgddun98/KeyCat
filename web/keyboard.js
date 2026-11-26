// The 3D 60% keyboard, mouse and toys around the cat.
// The cat faces the camera, so its keyboard is seen from the far side: the
// space row is nearest the cat and the user's left-hand keys are on screen right.
'use strict';
(() => {
  const { V } = K;
  const U = 0.15;          // one key unit in world space
  const CAP = 0.129;       // keycap footprint for a 1u key
  const ROWS = [
    [['Escape', 1, 'esc', 'orange'], ['Digit1', 1, '1'], ['Digit2', 1, '2'], ['Digit3', 1, '3'], ['Digit4', 1, '4'],
     ['Digit5', 1, '5'], ['Digit6', 1, '6'], ['Digit7', 1, '7'], ['Digit8', 1, '8'], ['Digit9', 1, '9'],
     ['Digit0', 1, '0'], ['Minus', 1, '-'], ['Equal', 1, '='], ['Backspace', 2, '⌫', 'mod']],
    [['Tab', 1.5, '⇥', 'mod'], ['KeyQ', 1, 'Q'], ['KeyW', 1, 'W'], ['KeyE', 1, 'E'], ['KeyR', 1, 'R'], ['KeyT', 1, 'T'],
     ['KeyY', 1, 'Y'], ['KeyU', 1, 'U'], ['KeyI', 1, 'I'], ['KeyO', 1, 'O'], ['KeyP', 1, 'P'],
     ['BracketLeft', 1, '['], ['BracketRight', 1, ']'], ['Backslash', 1.5, '\\', 'mod']],
    [['CapsLock', 1.75, '⇪', 'mod'], ['KeyA', 1, 'A'], ['KeyS', 1, 'S'], ['KeyD', 1, 'D'], ['KeyF', 1, 'F'],
     ['KeyG', 1, 'G'], ['KeyH', 1, 'H'], ['KeyJ', 1, 'J'], ['KeyK', 1, 'K'], ['KeyL', 1, 'L'],
     ['Semicolon', 1, ';'], ['Quote', 1, "'"], ['Enter', 2.25, '⏎', 'orange']],
    [['ShiftLeft', 2.25, '⇧', 'mod'], ['KeyZ', 1, 'Z'], ['KeyX', 1, 'X'], ['KeyC', 1, 'C'], ['KeyV', 1, 'V'],
     ['KeyB', 1, 'B'], ['KeyN', 1, 'N'], ['KeyM', 1, 'M'], ['Comma', 1, ','], ['Period', 1, '.'],
     ['Slash', 1, '/'], ['ShiftRight', 1.75, '⇧', 'mod'], ['ArrowUp', 1, '↑', 'mod']],
    [['ControlLeft', 1.25, '⌃', 'mod'], ['AltLeft', 1.25, '⌥', 'mod'], ['MetaLeft', 1.25, '⌘', 'mod'],
     ['Space', 6.25, 'space'], ['MetaRight', 1, '⌘', 'mod'], ['ArrowLeft', 1, '←', 'mod'],
     ['ArrowDown', 1, '↓', 'mod'], ['ArrowRight', 1, '→', 'mod']],
  ];
  // Aliases for keys this board has no cap for.
  const ALIAS = {
    Backquote: 'Escape', Delete: 'Backspace', Fn: 'ControlLeft', ControlRight: 'MetaRight',
    AltRight: 'MetaRight', IntlBackslash: 'ShiftLeft', NumpadEnter: 'Enter', ContextMenu: 'MetaRight',
    // The edit keys: on a 60% board they are fn with the arrows, and Insert (Help on the Mac) sits
    // by Delete.
    Home: 'ArrowLeft', End: 'ArrowRight', PageUp: 'ArrowUp', PageDown: 'ArrowDown', Insert: 'Backspace', Help: 'Backspace',
  };
  for (let i = 1; i <= 12; i++) ALIAS['F' + i] = 'Digit' + (i === 10 ? 0 : i === 11 ? 'Minus' : i === 12 ? 'Equal' : i);
  ALIAS.F11 = 'Minus'; ALIAS.F12 = 'Equal';
  for (let i = 0; i <= 9; i++) ALIAS['Numpad' + i] = 'Digit' + i;
  Object.assign(ALIAS, { NumpadAdd: 'Equal', NumpadSubtract: 'Minus', NumpadMultiply: 'Digit8', NumpadDivide: 'Slash', NumpadDecimal: 'Period', NumpadEqual: 'Equal' });
  // The popped-up label names the key pressed, not the cap it went to.
  const LABEL = {
    Backquote: '`', Delete: '⌦', Home: '↖', End: '↘', PageUp: '⇞', PageDown: '⇟', Insert: 'ins', Help: 'ins',
    Fn: 'fn', ControlRight: '⌃', AltRight: '⌥', NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/',
  };

  // Keys the user types with the left hand; the cat presses them with the paw on screen right.
  const LEFT_HAND = new Set(['Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Tab', 'KeyQ', 'KeyW', 'KeyE',
    'KeyR', 'KeyT', 'CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV',
    'KeyB', 'ControlLeft', 'AltLeft', 'MetaLeft']);

  const board = new THREE.Group();
  // A little right of the cat (the mouse takes the left), far edge raised slightly like a real board.
  board.position.set(0.28, 0.02, 1.0);
  board.rotation.x = 0.06;
  K.scene.add(board);

  const W = 15 * U + 0.16, D = 5 * U + 0.16, H = 0.12;
  function slab(w, d, h, r, color, y) {
    const s = new THREE.Shape();
    const x0 = -w / 2, z0 = -d / 2;
    s.moveTo(x0 + r, z0); s.lineTo(x0 + w - r, z0); s.quadraticCurveTo(x0 + w, z0, x0 + w, z0 + r);
    s.lineTo(x0 + w, z0 + d - r); s.quadraticCurveTo(x0 + w, z0 + d, x0 + w - r, z0 + d);
    s.lineTo(x0 + r, z0 + d); s.quadraticCurveTo(x0, z0 + d, x0, z0 + d - r);
    s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(Math.PI / 2);
    g.translate(0, y + h, 0);
    return new THREE.Mesh(g, K.flat(color));
  }
  const caseMesh = slab(W, D, H, 0.07, '#252523', 0);
  const plate = slab(W - 0.05, D - 0.05, 0.01, 0.05, '#2b2b28', H);
  board.add(caseMesh, plate);

  // A keycap is a 4-sided frustum turned 45°: sloped sides, flat top. A wide key stretches the
  // middle and keeps the slopes of a 1u cap, so it reads as a long bar rather than a wedge.
  // `w` is the width in 1u caps.
  const capGeos = new Map();
  function capGeo(w) {
    if (!capGeos.has(w)) {
      const g = new THREE.CylinderGeometry(Math.SQRT1_2 * 0.8, Math.SQRT1_2, 1, 4, 1);
      g.rotateY(Math.PI / 4);
      g.translate(0, 0.5, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sign(p.getX(i)) * (w - 1) / 2);
      capGeos.set(w, g);
    }
    return capGeos.get(w);
  }
  const sideMat = K.flat('#e6e3d8'), modSide = K.flat('#cbc7ba'), orangeSide = K.flat('#d39a4e');
  // A short dark notch at the near edge of each cap, like the gap between rows seen from above.
  const dotGeo = new THREE.PlaneGeometry(0.014, 0.02);
  dotGeo.rotateX(-Math.PI / 2);
  const dotMat = K.flat('#2a2a27');
  const CAP_H = 0.058;
  const COLORS = { base: new THREE.Color('#f8f7ef'), mod: new THREE.Color('#e0ddd2'), orange: new THREE.Color('#e9b064') };
  // Colour schemes for the 键盘颜色 setting: key tops (letters, modifiers, accents), their sides in
  // the same order, and the case.
  const THEMES = {
    cream: { tops: ['#f8f7ef', '#e0ddd2', '#e9b064'], sides: ['#e6e3d8', '#cbc7ba', '#d39a4e'], case: '#252523', plate: '#2b2b28' },
    dark: { tops: ['#4a4a46', '#383835', '#e9b064'], sides: ['#353532', '#2a2a28', '#c08a42'], case: '#1b1b1a', plate: '#222221' },
    pink: { tops: ['#fdeef2', '#f6cdd9', '#ee8fb4'], sides: ['#efd5dd', '#e2b2c1', '#d6779d'], case: '#6b3f4e', plate: '#774857' },
    mint: { tops: ['#eef8f2', '#c9e8d9', '#72c3a1'], sides: ['#d4ebdf', '#aed6c4', '#55a585'], case: '#2f4a40', plate: '#375449' },
  };
  const HIT = new THREE.Color('#b9d84f');
  const keys = new Map();
  ROWS.forEach((row, r) => {
    let u = 0;
    for (const [code, width, label, kind = 'base'] of row) {
      const cx = u + width / 2;
      u += width;
      // user space → world: mirrored left/right, number row towards the camera.
      const x = (7.5 - cx) * U, z = (r - 2) * -U;
      const top = new THREE.MeshBasicMaterial({ color: COLORS[kind].clone() });
      const side = kind === 'mod' ? modSide : kind === 'orange' ? orangeSide : sideMat;
      const cap = new THREE.Mesh(capGeo((width * U - (U - CAP)) / CAP), [side, top, K.flat('#1f1f1d')]);
      cap.scale.set(CAP, CAP_H, CAP);
      const holder = new THREE.Group();
      holder.position.set(x, H + 0.01, z);
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(0, CAP_H + 0.001, -CAP * 0.36);
      holder.add(cap, dot);
      board.add(holder);
      keys.set(code, { code, label, holder, top, base: COLORS[kind], x, z, down: false, glow: 0, depth: 0, weight: 0 });
    }
  });

  const world = new THREE.Vector3();
  K.keyboard = {
    group: board,
    releaseAll() { for (const key of keys.values()) { key.down = false; key.weight = 0; } },
    // A cat lying on the board pushes the keys under it in a little, without lighting them up:
    // every key within `half` of world x `cx` (`half` 0 lets them all back up), and any key under
    // one of `points` (paws standing on it).
    weigh(cx, half, points = []) {
      for (const key of keys.values()) {
        const x = key.x + board.position.x, z = key.z + board.position.z;
        key.weight = Math.abs(x - cx) < half || points.some(p => Math.abs(p.x - x) < 0.1 && Math.abs(p.z - z) < 0.09) ? 1 : 0;
      }
    },
    setTheme(name) {
      const th = THEMES[name] || THEMES.cream;
      ['base', 'mod', 'orange'].forEach((kind, i) => COLORS[kind].set(th.tops[i]));
      [sideMat, modSide, orangeSide].forEach((m, i) => m.color.set(th.sides[i]));
      caseMesh.material.color.set(th.case);
      plate.material.color.set(th.plate);
      for (const key of keys.values()) key.top.color.copy(key.base).lerp(HIT, key.glow);
    },
    randomLetter() {
      const letters = [...keys.values()].filter(k => /^Key[A-Z]$/.test(k.code));
      return letters[Math.floor(Math.random() * letters.length)];
    },
    hitMeshes: [caseMesh, plate],
    // World height of the tops of the keys at (x, z), weighed down, falling away to the desk past
    // the edges of the board: what a cat lying here rests on.
    surfaceAt(x, z) {
      const lx = x - board.position.x, lz = z - board.position.z;
      const out = Math.max(Math.abs(lx) - W / 2, Math.abs(lz) - D / 2);
      const top = board.position.y + H + 0.01 + CAP_H - 0.024 - lz * Math.sin(board.rotation.x);
      return K.mix(top, board.position.y, K.smooth(-0.02, 0.06, out));
    },
    resolve(code) { return keys.get(code) || keys.get(ALIAS[code]) || null; },
    leftHand: code => LEFT_HAND.has(ALIAS[code] || code),
    label(code) { return LABEL[code] || (/^F\d+$/.test(code) ? code : this.resolve(code).label); },
    // World-space top centre of a key, including how far it is pushed in.
    keyTop(key, out = world) {
      board.updateMatrixWorld();
      return out.set(key.x, H + 0.01 + CAP_H - key.depth, key.z).applyMatrix4(board.matrixWorld);
    },
    update(dt) {
      for (const key of keys.values()) {
        const depthTarget = Math.max(key.down ? 0.032 : 0, 0.024 * key.weight);
        key.depth += (depthTarget - key.depth) * K.approach(key.down ? 60 : 24, dt);
        key.glow += ((key.down ? 1 : 0) - key.glow) * K.approach(key.down ? 40 : 5, dt);
        key.holder.position.y = H + 0.01 - key.depth;
        key.top.color.copy(key.base).lerp(HIT, key.glow);
      }
    },
  };

  // Mouse: a chubby white computer mouse lying on the desk, buttons and wheel at the front
  // (towards the viewer, the way the cat holds it), palm hump at the back under the cat's paw,
  // a dark sticker outline, and a cable trailing off to the side.
  const mouse = new THREE.Group();
  const MOUSE_HOME = V(-1.2, 0.02, 0.96);
  mouse.position.copy(MOUSE_HOME);
  // How far the mouse may slide right before its outline (0.19 from its centre, click squash
  // included) would touch the keyboard's cream edge.
  const MOUSE_ROOM = board.position.x - (W + 0.05) / 2 - 0.19 - MOUSE_HOME.x;
  const shape = new THREE.Group();
  shape.rotation.y = -0.18;
  mouse.add(shape);
  const MW = 0.145, MH = 0.1, ML = 0.21;
  const domeGeo = new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  {
    // Egg in plan (fuller at the back), highest just behind the middle, with a little side shading.
    const q = domeGeo.attributes.position, colors = [];
    const top = new THREE.Color('#fbfbf3'), side = new THREE.Color('#dedad0'), c = new THREE.Color();
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i), y = q.getY(i), z = q.getZ(i);
      q.setXYZ(i, x * (1 - 0.14 * z), y * (1 - 0.18 * z), z);
      c.copy(side).lerp(top, K.smooth(0.15, 0.75, y));
      colors.push(c.r, c.g, c.b);
    }
    domeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  // 3D style shades the sides from the vertex colours; 2D is one flat tone.
  const bodyMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: '#ffffff' });
  const dome = new THREE.Mesh(domeGeo, bodyMat);
  dome.scale.set(MW, MH, ML);
  const shell = (color, grow, order) => {
    const m = new THREE.Mesh(domeGeo, K.back(color));
    m.scale.set(MW + grow, MH + grow, ML + grow);
    m.position.y = -grow * 0.3;
    m.renderOrder = order;
    return m;
  };
  // Seam between the two buttons along the front half, and the scroll wheel in it.
  const onTop = (x, z) => MH * (1 - 0.18 * z / ML) * Math.sqrt(Math.max(0, 1 - (x / (MW * (1 - 0.14 * z / ML))) ** 2 - (z / ML) ** 2));
  const seam = new K.TaperTube(12, 4, new THREE.MeshBasicMaterial({ color: '#2a2a27', depthTest: false }), 6);
  seam.update((t, out) => { const z = K.mix(ML * 0.02, ML * 0.95, t); return out.set(0, onTop(0, z) + 0.002, z); }, () => 0.0045);
  const wheel = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: '#e9a94f', depthTest: false }));
  wheel.scale.set(0.016, 0.012, 0.03);
  wheel.position.set(0, onTop(0, ML * 0.5) + 0.004, ML * 0.5);
  wheel.renderOrder = 7;
  // The left button lights up on a click, like the keys do.
  const buttonGeo = new THREE.CircleGeometry(1, 24, 0, Math.PI / 2);
  buttonGeo.rotateX(Math.PI / 2);
  const buttonMat = new THREE.MeshBasicMaterial({ color: '#b9d84f', transparent: true, opacity: 0, depthTest: false });
  const button = new THREE.Mesh(buttonGeo, buttonMat);
  button.scale.set(MW * 0.78, 1, ML * 0.82);
  button.position.set(0.004, onTop(0.04, ML * 0.4) + 0.001, ML * 0.08);
  button.renderOrder = 5;
  shape.add(shell('#1d1d1b', 0.013, -1), dome, button, seam.mesh, wheel);
  // Each click sends a ring out across the desk from under the mouse, in the keys' lit green.
  const rippleMat = new THREE.MeshBasicMaterial({ color: '#b9d84f', transparent: true, opacity: 0, depthWrite: false });
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), rippleMat);
  ripple.position.y = 0.004;
  ripple.renderOrder = -3;
  ripple.visible = false;
  mouse.add(ripple);
  K.scene.add(mouse);
  const bodyWhite = new THREE.Color('#ffffff'), bodyFlat = new THREE.Color('#f8f7f0'), bodyLit = new THREE.Color('#dff09a');
  // Cable: leaves the front of the mouse and curls away to the left, off the desk.
  const cable = new K.TaperTube(24, 6, K.flat('#2a2a27'), 1);
  K.scene.add(cable.mesh);
  const cableStart = V(0, 0, 0), cableEnd = V(-1.6, 0.02, 1.7), cableMid = V(0, 0, 0);
  const faceTop = V(0, 0, 0);
  K.mouseProp = {
    group: mouse,
    home: MOUSE_HOME,
    hitMeshes: [dome],
    offset: V(0, 0, 0),
    kick: V(0, 0, 0),
    pressed: 0,
    rippleAge: 1,
    flat: true,
    // The disc follows the real mouse with a little lag and slides back home when let go.
    follow: new K.Spring(V(0, 0, 0), 4, 0.75),
    update(dt, down) {
      this.kick.multiplyScalar(1 - K.approach(3, dt));
      this.offset.copy(this.follow.step(this.kick, dt));
      // Rightward travel eases off as it nears the keyboard instead of running into it.
      if (this.offset.x > 0) this.offset.x = MOUSE_ROOM * Math.tanh(this.offset.x / MOUSE_ROOM);
      mouse.position.copy(MOUSE_HOME).add(this.offset);
      this.pressed += ((down ? 1 : 0) - this.pressed) * K.approach(30, dt);
      buttonMat.opacity = this.pressed;
      // A click squashes the mouse down under the paw and tints it green, like a lit key.
      shape.scale.set(1 + 0.06 * this.pressed, 1 - 0.2 * this.pressed, 1 + 0.03 * this.pressed);
      bodyMat.color.copy(this.flat ? bodyFlat : bodyWhite).lerp(bodyLit, 0.75 * this.pressed);
      this.rippleAge = Math.min(1, this.rippleAge + dt / 0.45);
      ripple.visible = this.rippleAge < 1 && mouse.visible;
      if (ripple.visible) {
        const u = this.rippleAge;
        ripple.scale.setScalar(K.mix(0.2, 0.4, 1 - (1 - u) ** 2));
        rippleMat.opacity = 0.85 * (1 - u);
      }
      // The cable hangs from the front of the mouse and sags on its way off the desk.
      mouse.updateMatrixWorld();
      cableStart.set(0, MH * 0.25, ML * 0.98).applyMatrix4(shape.matrixWorld);
      cableMid.set((cableStart.x + cableEnd.x) / 2 + 0.1, 0.02, (cableStart.z + cableEnd.z) / 2 + 0.12);
      cable.update((t, o) => o.set(
        (1 - t) ** 2 * cableStart.x + 2 * (1 - t) * t * cableMid.x + t * t * cableEnd.x,
        (1 - t) ** 2 * cableStart.y + 2 * (1 - t) * t * cableMid.y + t * t * cableEnd.y,
        (1 - t) ** 2 * cableStart.z + 2 * (1 - t) * t * cableMid.z + t * t * cableEnd.z), () => 0.011);
    },
    // `cable` off hides the cord (the 鼠标线 setting) while the mouse itself stays.
    cable: true,
    // A press: shown at once, so a click that is over before the next frame still shows.
    click() { this.pressed = 1; this.rippleAge = 0; },
    setVisible(on) { mouse.visible = on; cable.mesh.visible = on && this.cable; },
    setCable(on) { this.cable = on; cable.mesh.visible = on && mouse.visible; },
    setStyle(style) {
      const flat = style !== '3d';
      this.flat = flat;
      bodyMat.vertexColors = !flat;
      bodyMat.color.copy(flat ? bodyFlat : bodyWhite);
      bodyMat.needsUpdate = true;
    },
    // Where a paw rests on the mouse, in world space: on the palm hump at the back, so the
    // buttons, wheel and cable stay in view in front of it.
    top(out) {
      mouse.updateMatrixWorld();
      return out.copy(faceTop.set(0, MH + 0.045, -ML * 0.3)).applyMatrix4(shape.matrixWorld);
    },
  };

  // A mug of coffee on the desk by the cat's side, clear of the keyboard and the mouse, for the cat
  // to push off the edge. It has a dark ink line and a blue body. The handle faces out to the left,
  // so its loop shows in silhouette, and steam curls up while it sits there. Fades so it can fall
  // out of sight and come back later.
  const cup = new THREE.Group();
  const CUP_HOME = V(-1.0, 0.02, -0.28);
  cup.position.copy(CUP_HOME);
  const steam = [];
  {
    const fade = m => Object.assign(m, { transparent: true });
    const R_CUP = 0.15, H_CUP = 0.29;
    const mugMat = fade(K.flat('#9fcdea')), lipMat = fade(K.flat('#f8f7ef')), inkMat = fade(K.back('#1d1d1b')),
      coffeeMat = fade(K.flat('#6f4a30')), cremaMat = fade(K.flat('#a77a52')),
      printMat = fade(K.flat('#f8f7ef'));
    const mugGeo = new THREE.CylinderGeometry(R_CUP, R_CUP * 0.9, H_CUP, 36);
    mugGeo.translate(0, H_CUP / 2, 0);
    const mug = new THREE.Mesh(mugGeo, mugMat);
    const ink = new THREE.Mesh(mugGeo, inkMat);
    ink.scale.set(1.1, 1.04, 1.1);
    ink.position.y = -0.005;
    ink.renderOrder = -1;
    // The open top: a thick cream lip round dark coffee with a paler crema ring.
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R_CUP - 0.012, 0.014, 8, 36).rotateX(Math.PI / 2), lipMat);
    lip.position.y = H_CUP;
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(R_CUP - 0.02, 32), coffeeMat);
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = H_CUP + 0.002;
    const crema = new THREE.Mesh(new THREE.RingGeometry(R_CUP * 0.42, R_CUP * 0.62, 32), cremaMat);
    crema.rotation.x = -Math.PI / 2;
    crema.position.y = H_CUP + 0.004;
    // A D-shaped handle standing on edge, its loop facing the viewer.
    const handleArc = r => new THREE.TorusGeometry(0.078, r, 10, 24, Math.PI).rotateZ(Math.PI / 2);
    const handle = new THREE.Mesh(handleArc(0.019), mugMat);
    handle.position.set(-R_CUP + 0.012, H_CUP * 0.52, 0);
    const handleInk = new THREE.Mesh(handleArc(0.03), inkMat);
    handleInk.position.copy(handle.position);
    handleInk.renderOrder = -1;
    // A paw print on the side towards the viewer: one pad and three toes.
    const print = new THREE.Group();
    const dot = (x, y, rx, ry) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), printMat);
      m.position.set(x, y, 0); m.scale.set(rx, ry, 1);
      print.add(m);
    };
    dot(0, -0.012, 0.036, 0.03);
    dot(-0.038, 0.03, 0.014, 0.017); dot(0, 0.045, 0.014, 0.017); dot(0.038, 0.03, 0.014, 0.017);
    print.position.set(0.01, H_CUP * 0.47, R_CUP * 0.96 + 0.004);
    cup.add(handleInk, ink, mug, handle, lip, coffee, crema, print);
    // Steam: two thin wavy wisps rising off the coffee, drifting and fading on a loop.
    const steamMat = new THREE.MeshBasicMaterial({ color: '#fbfaf3', transparent: true, opacity: 0.85, depthWrite: false });
    for (const x of [-0.035, 0.04]) {
      const tube = new K.TaperTube(14, 5, steamMat.clone(), 3);
      cup.add(tube.mesh);
      steam.push({ tube, x, phase: x > 0 ? 1.7 : 0 });
    }
    cup.userData.mats = [mugMat, lipMat, inkMat, coffeeMat, cremaMat, printMat];
    cup.userData.hitMesh = mug;
    cup.userData.top = H_CUP;
  }
  K.scene.add(cup);
  K.cup = {
    group: cup,
    home: CUP_HOME,
    radius: 0.15,
    hitMeshes: [cup.userData.hitMesh],
    opacity: 1,
    setOpacity(a) {
      this.opacity = a;
      for (const m of cup.userData.mats) m.opacity = a;
      cup.visible = a > 0.01;
    },
    // Moves the steam; `calm` 0 hides it (the cup is sliding or falling).
    update(t, calm = 1) {
      for (const s of steam) {
        const life = (t * 0.45 + s.phase) % 1;
        s.tube.mesh.material.opacity = 0.8 * Math.sin(life * Math.PI) * calm * this.opacity;
        s.tube.mesh.visible = s.tube.mesh.material.opacity > 0.02;
        if (!s.tube.mesh.visible) continue;
        const rise = 0.06 + life * 0.08;
        s.tube.update((u, out) => out.set(s.x + Math.sin(u * 5 + t * 2 + s.phase) * 0.025 * u,
          cup.userData.top + rise + u * 0.2, 0), u => 0.012 * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05)));
      }
    },
  };

  // A ball of winding yarn, behind the right side of the keyboard.
  const yarn = new THREE.Group(), yarnRadius = 0.155;
  const yarnHome = V(0.94, 0.02 + yarnRadius, 0.31);
  const yarnGeo = new THREE.SphereGeometry(yarnRadius - 0.008, 28, 16);
  const yarnMaterials = [];
  const yarnColor = material => {
    material.transparent = true;
    yarnMaterials.push(material);
    return material;
  };
  const yarnRim = new THREE.Mesh(yarnGeo, yarnColor(K.back('#f6f3e8')));
  yarnRim.scale.setScalar(1.14);
  yarnRim.renderOrder = -1;
  yarn.add(yarnRim, new THREE.Mesh(yarnGeo, yarnColor(K.flat('#b974a0'))));
  // The strands wrap around different axes and rotate with the ball.
  for (const [angle, color] of [[0.52, '#eaa9cd'], [-0.75, '#d48ab5'], [1.35, '#f2bfd9']]) {
    const points = [];
    for (let i = 0; i <= 120; i++) {
      const u = i / 120, turn = u * Math.PI * 8;
      const y = K.mix(-0.055, 0.055, u) + 0.008 * Math.sin(turn * 2);
      const r = Math.sqrt(yarnRadius ** 2 - y * y);
      points.push(V(r * Math.cos(turn), y, r * Math.sin(turn)));
    }
    const wrap = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 120, 0.008, 6), yarnColor(K.flat(color)));
    wrap.rotation.set(0.55, angle * 0.45, angle);
    yarn.add(wrap);
  }
  yarn.position.copy(yarnHome);
  yarn.visible = false;
  K.scene.add(yarn);
  K.yarn = {
    group: yarn,
    home: yarnHome,
    radius: yarnRadius,
    opacity: 0,
    setOpacity(a) {
      this.opacity = a;
      for (const m of yarnMaterials) m.opacity = a;
      yarn.visible = a > 0.01;
    },
  };
})();
