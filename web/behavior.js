// Input → animation state → render. The native app calls `window.cat.*`.
'use strict';
(() => {
  const { V, mix, clamp, approach, smooth } = K;
  const { camera, scene, renderer, keyboard, mouseProp, cat, cup, yarn, life, sound } = K;
  // In dev the clock can be frozen and stepped (`cat.freeze()` / `cat.step(s)`) to film motion frame by frame.
  let frozen = null;
  const now = () => frozen ?? performance.now() / 1000;

  const { Spring } = K;
  // `role`: 'both', or with two cats 'keys' (this one only types) and 'mouse' (this one only works
  // the mouse). `persist`: whether this cat writes the shared memory.
  const opts = { privacy: false, sleepAfter: 60, sound: false, festival: true, cup: true, pomodoro: false,
    role: 'both', persist: true, outfit: null };
  const S = {
    lastInput: now(), lastKey: -100, lastMouse: -100, mouseDown: false,
    keyGaze: null,
    cursor: null, cursorSeen: -100, petting: false, petUntil: 0, petX: 0,
    sleep: 0, asleep: false, wakeAt: -100, nextBlink: now() + 3, nextZ: 0,
    breathPhase: 0, lieBreathPhase: 0,
    rub: 0, busyUntil: now() + 2, lastPaw: 'R', hit: 'none',
    // How worked up the cat is (fast typing, quick mouse moves): wider pupils, livelier tail.
    excite: 0, strokes: [], tailPhase: 0,
    // An idle fidget: { kind, t0, dur, side }.
    act: null, nextAct: now() + 4,
    // Irritation, 0..1, from key mashing, very fast typing, petting for too long or being woken
    // up. Past a threshold the cat is `cross`: it thumps its tail on the desk until it calms.
    annoy: 0, cross: false, crossSince: 0, thumpPhase: 0, thumpLift: 0, lastSlam: 0, petStart: -1,
    // Fast pointer movement makes the cat curious instead, like a cat watching a laser dot: eyes
    // wide, round pupils, ears up and forward, head cocked, tail tip twitching. `moves` holds
    // recent [time, dx, dy, distance] samples for pointer speed and reversals. `curiousUntil` keeps it watching a
    // while after the pointer stops.
    moves: [], mouseSpeed: 0, curiousUntil: -100,
    dizzyAt: null, nextDizzy: 0,
    // A longer scripted episode (push the cup, play with yarn, stretch, nudge, swat): { kind, t0, dur, ... }.
    // Only one runs at a time; most end early on input.
    scene: null, nextPush: now() + 90, nextYarn: now() + 24, nextNudge: 0, keysQuietSince: now(),
    // Yawning runs alongside everything else, since it only moves the face.
    yawn: null, yawnAt: 0, stretchUntil: 0, nextNightYawn: now() + 60, nightSaidAt: 0,
    // Lying down: over the keys ('board') or beside them after a head rub ('cuddle').
    // `sleepPose` starts as loaf, curl or tuck, then can switch to a keyboard pose.
    lieAt: 'board', sleepPose: 'loaf', cuddleUntil: 0,
    // Purring when petted (or, once you are close, when the pointer rests by its head).
    purr: 0, breath: 0, nextHeart: 0, rubCursor: false, lastPetDown: -100, blinkAskAt: 0,
    // Breathing phases (radians), sitting and lying.
    breathSit: 0, breathLie: 0,
    // Keyboard shortcuts it recognises.
    mods: new Set(), backs: [], lastOops: -100, clip: null,
    // Wall-clock bookkeeping (Date.now(), ms) for breaks, greetings and the memory.
    lastInputWall: 0, workStart: Date.now(), nag: null, lastWall: Date.now(),
    greetPending: false, sulkUntil: 0, sulkPet: 0,
    pomo: null, friend: null, rec: null, lying: null,
    // Small signs of life that run under everything else: an ear flicking at nothing, the weight
    // moving from one haunch to the other now and then.
    twitch: null, nextTwitch: now() + 3, lean: 0, nextLean: now() + 6, dream: null, nextDream: 0,
    // At the keyboard: when you last typed, the paw held up at you ({ t0, last }), its own go at
    // typing ({ t0, dur, next, side, up }), and when it may have another.
    lastUserKey: -100, stop: null, play: null, nextPlay: 0,
  };
  const effects = [];
  // Pose springs. Gaze is quickest, then the head, then the body, like a real cat whose eyes
  // lock on first and whose body catches up last; damping under 1 gives a touch of follow-through.
  const P = {
    shift: new Spring(0, 1.8, 0.72),     // sideways bend of the chest towards the busy paw
    hunch: new Spring(0, 1.6, 0.8),      // leaning forward over the board
    squash: new Spring(0, 2.2, 0.55),    // loafing down, plus the little dip on each key strike
    yaw: new Spring(0, 2.6, 0.7),
    pitch: new Spring(-0.28, 2.4, 0.68),
    roll: new Spring(0, 2.2, 0.6),
    gazeX: new Spring(0, 7, 0.9),
    gazeY: new Spring(0, 7, 0.9),
    ears: new Spring(0, 5, 0.35),
    cross: new Spring(0, 1.6, 0.9),
    curious: new Spring(0, 3.5, 0.75),   // quick to light up, a slight overshoot reads as a start
    desk: new Spring(0, 9, 0.35),        // the desk hop when the tail slams down
    impactRoll: new Spring(0, 5, 0.36),   // a quick shoulder recoil when Enter lands
    lie: new Spring(0, 1.5, 0.8),        // 0 sitting up, 1 lying on its side
    tailLie: new Spring(0, 1.4, 0.7),    // the tail flops down after the body
    melt: new Spring(0, 0.3, 1),         // lying, 0 still holding itself, 1 settled into the pose (see LIE)
    doze: new Spring(0, 0.4, 1),         // lying, 0 the awake pose, 1 the asleep one
    purr: new Spring(0, 1.2, 1),
    flinch: new Spring(0, 4, 0.5),       // swatted by the other cat
    hunt: new Spring(0, 3, 0.8),         // locked onto something it means to bat: still, ears up
  };
  // Paw 'L' is on screen left (the cat's right) and also works the mouse.
  const paws = {
    L: { side: -1, pos: V(-0.36, 0.26, 0.68), from: V(), key: null, t0: -100, dur: 0.08, down: false },
    R: { side: 1, pos: V(0.36, 0.26, 0.68), from: V(), key: null, t0: -100, dur: 0.08, down: false },
  };
  for (const p of Object.values(paws)) {
    Object.assign(p, { spring: new Spring(p.pos, 3.2, 0.78), last: p.pos.clone(), hang: 0, limp: 0, elbow: { at: V(), k: 0 }, elbowWant: null,
      aim: { toes: V(0, 0, 1), top: V(0, 1, 0), k: 0 }, aimWant: null, keyPose: 0, keyPoseFrom: 0 });
  }
  // The paw held up to stop you typing: toes up, the sole to you.
  const STOP_AIM = { toes: V(0.1, 1, 0.15), top: V(0, -0.3, -1) };
  // Washing: the right paw held up to the mouth, toes up and in, the beans to the face and its
  // back to you. `lick` is each lick, 0..1: the head dips into it as the paw presses up.
  const GROOM_AIM = { toes: V(-0.35, 1, -0.2), top: V(0.3, 0, 1) };
  const lick = t => 0.5 - 0.5 * Math.cos(t * 11);
  // Where its elbow rests meanwhile, on the left end of the keys.
  const STOP_ELBOW = V(-0.62, 0.32, 0.86);
  // The tail presses the space bar: it swings over in `dur`, the key goes down when the tip lands
  // (`landAt`), and the tip lifts as the tail curls back when the key is released.
  const TAIL_RETURN_SECONDS = 0.38;
  const tailTap = { key: null, t0: -100, dur: 0.18, from: 0, down: false, landAt: -100, returnAt: null, reach: 0, hover: 0.12, tip: V() };
  const popups = [], zs = [];
  const tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), tmp3 = V(0, 0, 0);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const MODS = new Set(['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight']);
  // The lying pose, drawn from the user's sticker sheet (黑猫键盘日常贴纸图鉴): a chibi black
  // cat whose lying body is one round soft shape, with short stubby legs ending in big white
  // mittens, pink beans on the soles, and the tail standing up out of it in a hooked curl.
  // What makes them read: the outline stays one round mound with the head, the paws and the tail
  // standing out of it; whatever it lies on flattens the underside (cat.js does that against
  // `floor`); and the paws say what it is doing: spread on the keys, or one held up so you see
  // the beans.
  // A cat gets into it in stages: it lies down still holding itself (`loaf`), then settles into
  // the pose over a few seconds, one part after another (MELT): `awake` or `asleep`, which it
  // blends between as it dozes off. Each stage gives, in world space:
  // - `path`: the spine, from the end of the rump to past the neck; `side`: the cat's left at the
  //   hips and at the neck; `kS`, `kF`: the cross-section (see cat.js `lying`).
  // - `head`: where the middle of the head rests; `roll`: how far it is tipped over (+ is towards
  //   screen left), face still turned to you; `pitch`: how far it looks down.
  // - `paws`: the front paws (the wrists) [screen left, screen right]; `hang`: how limp each wrist
  //   is; `aims`, for paws turned on purpose: where their toes point and their tops face.
  // - `hind`: where each hind leg bends (`knee`) and its `paw`, optionally `toes` and `top` as
  //   above; `tail`: where the tail lies, after the root.
  // 'board', 霸占键盘: lying on the desk right behind the keyboard, facing you, chin on the keys
  // and a front paw on each end of the board, so the keyboard is plainly its now; the body a loaf
  // going back to the right, tail up with a hook at the tip. It gets there from 盯着键盘: down on
  // its elbows over the keys, rump and tail up, looking at the keys (`loaf`). Asleep it lies the
  // same way, the head a little lower and the tail down round its side.
  const LIE = {
    board: {
      lead: 0.6,
      loaf: {
        path: [V(0.5, 0.86, -0.5), V(0.42, 0.9, -0.34), V(0.3, 0.84, -0.12), V(0.17, 0.7, 0.1), V(0.06, 0.55, 0.3),
          V(-0.02, 0.46, 0.45), V(-0.06, 0.43, 0.54)],
        side: [V(1, 0, 0), V(1, 0, 0)], kS: [1.0, 0.95], kF: [0.88, 0.85],
        head: V(-0.14, 0.64, 0.86), roll: 0.22, pitch: 0.28,
        paws: [V(-0.4, 0.25, 0.98), V(0.26, 0.25, 1.04)], hang: [0, 0],
        hind: [{ knee: V(0.1, 0.3, 0.02), paw: V(0.05, 0.06, -0.08) }, { knee: V(0.78, 0.3, -0.05), paw: V(0.74, 0.06, -0.12) }],
        tail: [V(0.8, 0.94, -0.58), V(0.98, 1.14, -0.58), V(1.02, 1.38, -0.56), V(0.9, 1.55, -0.54), V(0.73, 1.52, -0.52)],
      },
      awake: {
        path: [V(0.8, 0.44, -0.55), V(0.66, 0.5, -0.4), V(0.48, 0.52, -0.2), V(0.3, 0.5, 0.02), V(0.14, 0.47, 0.24),
          V(0.03, 0.45, 0.4), V(-0.03, 0.45, 0.5)],
        side: [V(0.87, 0, 0.5), V(0.95, 0, 0.3)], kS: [1.1, 1.0], kF: [0.84, 0.82],
        head: V(0.0, 0.67, 0.84), roll: 0, pitch: -0.05,
        paws: [V(-0.52, 0.25, 1.0), V(0.58, 0.25, 1.04)], hang: [0, 0],
        hind: [{ knee: V(0.24, 0.28, -0.05), paw: V(0.2, 0.06, -0.16) }, { knee: V(0.96, 0.28, -0.12), paw: V(0.94, 0.06, -0.24) }],
        tail: [V(1.1, 0.58, -0.62), V(1.24, 0.8, -0.62), V(1.26, 1.04, -0.6), V(1.14, 1.2, -0.58), V(0.98, 1.17, -0.56)],
      },
    },
    cuddle: {
      lead: 0.12,
      // Lowers onto its side, then settles face up with its paws relaxed.
      loaf: {
        path: [V(1.19, 0.49, -0.52), V(1.01, 0.51, -0.49), V(0.77, 0.51, -0.44), V(0.5, 0.48, -0.39),
          V(0.18, 0.45, -0.30), V(-0.09, 0.43, -0.21), V(-0.32, 0.44, -0.13)],
        side: [V(0, 0.94, -0.34), V(0, 0.96, -0.28)], kS: [0.96, 0.84], kF: [0.93, 0.82],
        paws: [V(0.36, 0.18, 0.43), V(0.37, 0.80, 0.08)], hang: [0, 0],
        aims: [{ toes: V(-0.8, 0.35, 0.15), top: V(0, 0.5, -1) }, { toes: V(-0.85, 0.4, -0.1), top: V(0, 0.2, -1) }],
        hind: [
          { knee: V(0.88, 0.3, 0.09), paw: V(0.98, 0.20, 0.34), toes: V(0.75, 0.1, 0.22), top: V(0, -0.34, -0.94) },
          { knee: V(1.04, 0.64, -0.32), paw: V(1.21, 0.61, -0.08), toes: V(0.65, 0.22, 0.12), top: V(0, -0.34, -0.94) },
        ],
        tail: [V(1.35, 0.28, -0.55), V(1.51, 0.17, -0.44), V(1.62, 0.15, -0.25), V(1.65, 0.2, -0.08), V(1.57, 0.29, 0.04)],
      },
    },
  };
  // Asleep on the board the head sinks a little between the paws and the tail comes down round
  // its side.
  LIE.board.asleep = { ...LIE.board.awake, head: V(0.0, 0.64, 0.82), pitch: 0.04, kF: [0.8, 0.78],
    tail: [V(0.98, 0.3, -0.5), V(1.12, 0.2, -0.28), V(1.16, 0.16, -0.02), V(1.06, 0.15, 0.2), V(0.88, 0.15, 0.3)] };
  LIE.boardSide = {
    ...LIE.board,
    asleep: {
      ...LIE.board.asleep,
      // Roll the flank onto the board and bring the neck forward under the resting cheek.
      path: [V(0.96, 0.44, 0.09), V(0.76, 0.48, 0.19), V(0.52, 0.49, 0.32), V(0.28, 0.47, 0.45),
        V(0.08, 0.44, 0.55), V(-0.07, 0.43, 0.65), V(-0.13, 0.44, 0.72)],
      side: [V(0.43, 0.87, 0.25), V(0.55, 0.78, 0.3)],
      kS: [1.43, 1.15], kF: [1.09, 0.91],
      head: V(-0.29, 0.59, 0.99), roll: 0.83, pitch: 0.04,
      paws: [V(-0.65, 0.26, 1.08), V(0.16, 0.26, 1.11)],
      hind: [{ knee: V(0.68, 0.31, 0.61), paw: V(0.78, 0.26, 0.77) }, { knee: V(0.91, 0.53, 0.43), paw: V(1.02, 0.31, 0.69) }],
      // Let the tail follow the rump down and rest in a long arc beside the keyboard.
      tail: [V(1.04, 0.49, 0.04), V(1.28, 0.33, 0.02), V(1.49, 0.20, -0.09), V(1.65, 0.14, -0.24), V(1.76, 0.17, -0.42)],
    },
  };
  const isBoardSleep = pose => pose === 'board' || pose === 'boardSide';
  LIE.cuddle.awake = {
    ...LIE.cuddle.loaf,
    side: [V(0, 0.41, -0.91), V(0, 0.64, -0.77)],
    paws: [V(0.45, 0.73, 0.50), V(0.49, 1.03, -0.10)],
    // Follow the chest and hips as they roll belly-up, keeping the limbs extended.
    aims: [
      { toes: V(-0.8, 0.12, 0.06), top: V(0, -0.86, -0.51) },
      { toes: V(-0.85, 0.15, -0.07), top: V(0, -0.86, -0.51) },
    ],
    hind: [
      { knee: V(0.83, 0.68, 0.13), paw: V(1.02, 0.73, 0.45), toes: V(0.75, -0.11, 0.22), top: V(0, -1, -0.32) },
      { knee: V(0.98, 0.89, -0.30), paw: V(1.28, 1.02, -0.17), toes: V(0.65, -0.07, 0.12), top: V(0, -1, -0.32) },
    ],
    tail: [V(1.16, 0.46, -0.60), V(1.36, 0.45, -0.64), V(1.55, 0.49, -0.65), V(1.66, 0.67, -0.60), V(1.56, 0.86, -0.51)],
  };
  // Lying and cross: the tail along the desk out to the right of the rump (see `update`).
  const THUMP_LIE = [V(1.18, 0.3, -0.52), V(1.36, 0.12, -0.38), V(1.48, 0.06, -0.2), V(1.54, 0.05, -0.02), V(1.56, 0.05, 0.14)];
  // When each part lets go, over the settling (0..1): the body first, then the head goes down, a
  // front paw slides into place, the other, the tail and last the hind legs.
  const MELT = { body: [0, 0.7], head: [0, 0.6], near: [0.15, 0.55], far: [0.35, 0.8], tail: [0.25, 0.85], hind: [0.4, 0.95] };
  const melted = (part, m) => smooth(MELT[part][0], MELT[part][1], m);
  const stageOf = () => ({
    path: LIE.board.loaf.path.map(() => V()), side: [V(), V()], kS: [1, 1], kF: [1, 1], head: V(), roll: 0, pitch: 0,
    paws: [V(), V()], hang: [0, 0], aims: [0, 1].map(() => ({ toes: V(), top: V() })), aimed: false,
    hind: [0, 1].map(() => ({ knee: V(), paw: V(), toes: V(), top: V(), aimed: false })), tail: LIE.board.loaf.tail.map(() => V()),
  });
  // Writes stage A blended towards B into `out`; `k` gives the blend for each part.
  function blendStage(A, B, k, out) {
    const kb = k('body'), kh = k('hind'), kt = k('tail'), kd = k('head');
    // A stage blended earlier carries its flags; a stage from LIE has them if it has the parts.
    out.aimed = 'aimed' in A ? A.aimed : !!A.aims;
    A.path.forEach((q, i) => out.path[i].lerpVectors(q, B.path[i], kb));
    for (const j of [0, 1]) {
      out.side[j].lerpVectors(A.side[j], B.side[j], kb).normalize();
      out.kS[j] = mix(A.kS[j], B.kS[j], kb);
      out.kF[j] = mix(A.kF[j], B.kF[j], kb);
      const a = A.hind[j], b = B.hind[j], o = out.hind[j];
      for (const q of ['knee', 'paw']) o[q].lerpVectors(a[q], b[q], kh);
      o.aimed = 'aimed' in a ? a.aimed : !!a.toes;
      if (o.aimed) { o.toes.lerpVectors(a.toes, b.toes, kh); o.top.lerpVectors(a.top, b.top, kh); }
      const kp = k(j ? 'near' : 'far');
      out.paws[j].lerpVectors(A.paws[j], B.paws[j], kp);
      out.hang[j] = mix(A.hang[j], B.hang[j], kp);
      if (out.aimed) for (const q of ['toes', 'top']) out.aims[j][q].lerpVectors(A.aims[j][q], B.aims[j][q], kp);
    }
    A.tail.forEach((q, i) => out.tail[i].lerpVectors(q, B.tail[i], kt));
    // Only the keyboard pose puts the head down at a particular spot.
    if (A.head) {
      out.head.lerpVectors(A.head, B.head, kd);
      out.roll = mix(A.roll, B.roll, kd);
      out.pitch = mix(A.pitch, B.pitch, kd);
    }
    return out;
  }
  // The pose it is settling into (awake or asleep, as far as it has dozed off), and where it is now.
  // Lying down already asleep (`calm`) it goes straight into the pose.
  const restStage = stageOf(), lieStage = stageOf();
  function poseNow(L, m, doze, calm) {
    if (L === LIE.cuddle) {
      const roll = smooth(0, 1, m);
      return blendStage(L.loaf, L.awake, () => roll, lieStage);
    }
    blendStage(L.awake, L.asleep, () => doze, restStage);
    return blendStage(calm ? restStage : L.loaf, restStage, part => melted(part, m), lieStage);
  }
  const cuddleAxis = V(1, 0, -0.23).normalize();
  const CUDDLE_SWAY_RATE = 5;
  function rotateCuddlePoint(point, pivot, angle) {
    point.sub(pivot).applyAxisAngle(cuddleAxis, angle).add(pivot);
  }
  function cuddlePawClench(age) {
    const beat = Math.max(0, age - 0.12) % 1.12;
    return smooth(0, 0.32, beat) * (1 - smooth(0.45, 1.04, beat));
  }
  function spreadCuddlePaws(st, age, lie) {
    const stretch = smooth(0.32, 0.78, age) * (1 - smooth(1.04, 1.5, age)) * smooth(0.45, 0.98, lie);
    for (const i of [0, 1]) {
      const side = i === 0 ? -stretch : stretch;
      st.paws[i].addScaledVector(st.side[1], 0.09 * side);
      st.hind[i].knee.addScaledVector(st.side[0], 0.045 * side);
      st.hind[i].paw.addScaledVector(st.side[0], 0.085 * side).addScaledVector(cuddleAxis, 0.055 * stretch);
    }
  }
  function swayCuddle(st, age, amount) {
    const strength = amount * smooth(0, 0.55, age);
    const beat = age * CUDDLE_SWAY_RATE;
    const hipRoll = 0.20 * Math.sin(beat) * strength;
    const chestRoll = 0.16 * Math.sin(beat - 0.30) * strength;
    const hips = st.path[1], chest = st.path[5];
    st.side[0].applyAxisAngle(cuddleAxis, hipRoll);
    st.side[1].applyAxisAngle(cuddleAxis, chestRoll);
    // The paws sway with the chest and hips.
    for (const i of [0, 1]) {
      const hind = st.hind[i];
      rotateCuddlePoint(st.paws[i], chest, chestRoll);
      rotateCuddlePoint(hind.knee, hips, hipRoll);
      rotateCuddlePoint(hind.paw, hips, hipRoll);
      for (const axis of ['toes', 'top']) {
        st.aims[i][axis].applyAxisAngle(cuddleAxis, chestRoll);
        hind[axis].applyAxisAngle(cuddleAxis, hipRoll);
      }
    }
    st.tail.forEach(q => rotateCuddlePoint(q, hips, 0.6 * hipRoll));
  }
  Object.assign(cat.lying, {
    path: lieStage.path.map(() => V()), side: [V(), V()], kS: [1, 1], kF: [1, 1],
    hind: [0, 1].map(() => ({ knee: V(), paw: V(), toes: null, top: null })), tail: lieStage.tail.map(() => V()),
    floor: (x, z) => keyboard.group.visible ? keyboard.surfaceAt(x, z) : 0,
  });
  // Writes a stage into `cat.lying`, in body space about `origin`.
  function shapeLying(st, lead, origin) {
    const o = cat.lying;
    o.lead = lead;
    st.path.forEach((q, i) => o.path[i].subVectors(q, origin));
    for (const j of [0, 1]) {
      o.side[j].copy(st.side[j]);
      o.kS[j] = st.kS[j];
      o.kF[j] = st.kF[j];
      const h = o.hind[j], s = st.hind[j];
      for (const q of ['knee', 'paw']) h[q].subVectors(s[q], origin);
      h.toes = s.aimed ? s.toes : null;
      h.top = s.aimed ? s.top : null;
    }
    st.tail.forEach((q, i) => o.tail[i].subVectors(q, origin));
  }
  const headLie = new THREE.Quaternion(), headLieEuler = new THREE.Euler();
  const chinAt = [V(), V(), V()];
  // Lying down takes steps, as a cat does it. At the keyboard: it leans over and puts its front
  // paws out onto the keys one after the other, then lowers itself, chest first, stays down on
  // its elbows staring at the keys a moment (STARE) and only then settles. `BOARD_FLOP` is when the
  // body goes down, in seconds from the start.
  const BOARD_FLOP = 0.6, STARE = 2.2;
  const CUDDLE_HOLD = 0.6, CUDDLE_LOWER = 0.64, CUDDLE_ROLL = 0.18, CUDDLE_TIME = 5.4;
  const SHAKE_WINDOW = 0.34, SHAKE_TURN = 22, SHAKE_TRAVEL = 170;
  const DIZZY_CLOSE_AT = 0.9, DIZZY_FALL_AT = 2.15, DIZZY_LOWER = 1.22;
  const DIZZY_TIME = DIZZY_FALL_AT + 3.75, DIZZY_COOLDOWN = 8;
  const DIZZY_BRACE_AIMS = [-1, 1].map(side => ({ toes: V(side * 0.14, 0, 1), top: V(0, 1, 0) }));
  const post = message => window.webkit?.messageHandlers?.cat?.postMessage(message);

  function shookPointer(axis) {
    // Count a reversal only after the pointer has moved far enough back from the last extreme.
    let position = 0, extreme = 0, direction = 0, turns = 0, travel = 0;
    for (const move of S.moves) {
      position += move[axis];
      if (!direction) {
        if (Math.abs(position) < SHAKE_TURN) continue;
        direction = Math.sign(position);
      }
      if ((position - extreme) * direction >= 0) {
        travel += Math.abs(position - extreme);
        extreme = position;
      } else if (Math.abs(position - extreme) >= SHAKE_TURN) {
        turns++;
        direction = -direction;
        travel += Math.abs(position - extreme);
        extreme = position;
      }
    }
    return turns >= 2 && travel >= SHAKE_TRAVEL;
  }

  // Adds irritation; it only starts to fade a couple of seconds after the last poke. Switched off
  // in the settings, nothing irritates the cat (the 试试 button still forces it).
  function poke(amount, t, force = false) {
    if (!TUNING.annoyOn && !force) return;
    S.annoy = clamp(S.annoy + amount, 0, 1);
    S.lastPoke = t;
  }

  function wake(t) {
    if (S.asleep || S.sleep > 0.3) {
      S.wakeAt = t;
      poke(TUNING.wakeAnnoy / 100, t);
      // Woken up it yawns, and if you then leave it be, stretches.
      S.yawnAt = t + 0.35;
    }
    S.asleep = false;
    S.lastInput = t;
    // Springs need a couple of seconds at full frame rate to settle after any input.
    S.busyUntil = t + 3;
    S.act = null;
    S.nextAct = t + 4 + Math.random() * 4;
    if (S.scene && !catchPush(t)) endScene(t, true);
  }

  // Bookkeeping for any real input: the work session for break reminders, greetings, stats.
  function noteInput(kind) {
    const w = Date.now();
    if (S.lastInputWall && w - S.lastInputWall > 3 * 3600e3) S.greetPending = true;
    // A gap of three minutes or more counts as a break; the work session starts over.
    if (!S.lastInputWall || w - S.lastInputWall > 180e3) S.workStart = w;
    S.lastInputWall = w;
    if (kind === 'key') life.add('keys');
    if (S.greetPending && S.sulkUntil < now()) {
      S.greetPending = false;
      say(new Date().getHours() < 11 ? '早呀' : '回来啦', 2.4);
      heart(now());
    }
  }

  function mousing(t) { return opts.role !== 'keys' && (S.mouseDown || t - S.lastMouse < 1.4); }
  // Lying over the keys to make you take a break: your keys still go in under it, its paws stay put.
  function blocking() { return !!S.nag; }
  // 敲键盘 (see `update`) holds down one key at a time; whatever ends the play lets it back up,
  // or the key stays down and its label never fades.
  function releasePlayKey(pl) { pl.up.k.down = false; paws[pl.up.side].down = false; pl.up = null; }
  function endPlay() { if (S.play && S.play.up) releasePlayKey(S.play); S.play = null; }
  // Holding a paw up at you because you typed while it has the keyboard (see `key`).
  const STOP_HOLD = 1.1;
  function stopping(t) { return !!S.stop && t - S.stop.last < STOP_HOLD && S.lying && S.lieAt === 'board' && !S.lying.up; }

  function key(code, down) {
    const t = now();
    if (MODS.has(code)) { if (down) S.mods.add(code); else S.mods.delete(code); }
    if (down) { noteInput('key'); S.lastUserKey = t; S.cuddleUntil = 0; S.dizzyAt = null; }
    // The mouse cat of a pair notices the typing but leaves it to the other one.
    if (opts.role === 'mouse') { if (down) wake(t); return; }
    const k = keyboard.resolve(code);
    if (!k) return;
    // Caps lock sends no key-up on the Mac (it is often the input source switch too); let it
    // spring back by itself, whatever the press ends up doing, or its label never fades.
    if (down && code === 'CapsLock') setTimeout(() => key(code, false), 120);
    if (!down) {
      if (S.keyGaze?.key === k) S.keyGaze.until = t + 0.36;
      if (tailTap.key === k) { tailTap.down = false; return; }
      k.down = false;
      for (const p of Object.values(paws)) if (p.key === k) p.down = false;
      return;
    }
    // Typing ends a cup push outright: the paw is needed on the keys.
    if (S.scene && S.scene.kind === 'push') endScene(t, true);
    wake(t);
    S.keysQuietSince = t;
    if (k.down || (tailTap.key === k && tailTap.down)) return;
    if (blocking()) {
      k.down = true;
      S.lastKey = t;
      S.strokes.push(t);
      if (!opts.privacy) popup(k, t, 1, keyboard.label(code));
      // 阻止打字: with the keyboard taken, typing gets a paw held up at you and a wink.
      if (S.lying && S.lieAt === 'board' && P.lie.x > 0.6) {
        if (!stopping(t)) {
          S.stop = { t0: t, last: t };
          effect('marks', lieStage.head.clone().add(V(-0.92, 0.7, 0.26)), 0.7, 0.26, V(-0.05, 0.12, 0), 44);
          P.squash.kick(0.2);
        } else S.stop.last = t;
        endPlay();
      }
      return;
    }
    S.keyGaze = { key: k, at: t, until: Infinity };
    // Easter egg: space goes to the tail, unless the tail is busy thumping in a huff.
    if (k.code === 'Space' && !S.cross) {
      tailPat(k, t, true);
      // Not a paw key: the paws stay where they are rather than curling up to type.
      S.strokes.push(t);
      if (S.strokes.filter(s => t - s < 0.15).length >= TUNING.mashKeys) poke(0.3, t);
      return;
    }
    let side = keyboard.leftHand(code) ? 'R' : 'L';
    if (mousing(t)) side = 'R';
    const paw = strike(k, side, t, k.code === 'Enter');
    S.strokes.push(t);
    // Mashing the keyboard (four or more keys inside 150 ms) is upsetting.
    if (S.strokes.filter(s => t - s < 0.15).length >= TUNING.mashKeys) poke(0.3, t);
    if (!opts.privacy) popup(k, t, paw.side, keyboard.label(code));
    shortcut(k.code, code, t, paw);
  }

  function tailPat(k, t, held) {
    tailTap.from = tailTap.reach;
    tailTap.dur = mix(0.18, 0.07, tailTap.reach);
    tailTap.key = k;
    tailTap.t0 = t;
    tailTap.down = held;
    tailTap.returnAt = null;
  }

  // A paw comes down on key `k`. Also used when the cat presses a key on its own.
  function strike(k, side, t, heavy = false) {
    const paw = paws[side];
    paw.from.copy(paw.pos);
    paw.keyPoseFrom = paw.keyPose;
    paw.key = k;
    paw.t0 = t;
    paw.dur = clamp(paw.pos.distanceTo(keyboard.keyTop(k, tmp)) * 0.09, 0.05, 0.1);
    paw.down = true;
    paw.heavy = heavy;
    // No two strikes alike: a little more or less lift and jolt each time.
    paw.lift = heavy ? 2.65 : mix(0.8, 1.25, Math.random());
    k.down = true;
    S.lastKey = t;
    S.lastPaw = side;
    // Ordinary strikes give a small nod. The stronger recoil starts on contact.
    if (!heavy) {
      P.squash.kick(0.35);
      P.pitch.kick(mix(0.2, 0.35, Math.random()));
    }
    return paw;
  }

  // A run of Backspace makes it sweat, Save gets a nod, and Copy has it hold the copied thing
  // up until you paste it.
  function shortcut(name, code, t) {
    const mod = S.mods.size > 0;
    if (name === 'Backspace') {
      S.backs.push(t);
      while (S.backs.length && t - S.backs[0] > 1.6) S.backs.shift();
      if (S.backs.length >= 5 && t - S.lastOops > 3) {
        S.lastOops = t;
        S.backs = [];
        S.act = { kind: 'oops', t0: t, dur: 1.4, side: Math.random() < 0.5 ? -1 : 1 };
        cat.head.getWorldPosition(tmp3);
        effect('sweat', tmp3.clone().add(V(0.5, 0.35, 0.1)), 1.2, 0.2, V(0, -0.12, 0), 44);
      }
    } else if (mod && name === 'KeyS') {
      S.act = { kind: 'nod', t0: t + 0.05, dur: 0.7, side: 1 };
      cat.head.getWorldPosition(tmp3);
      effect('check', tmp3.clone().add(V(-0.55, 0.4, 0.1)), 0.9, 0.2, V(0, 0.2, 0), 44);
    } else if (mod && name === 'KeyC') {
      if (S.clip) scene.remove(S.clip.sprite);
      const sprite = fxSprite('card', 44);
      keyboard.keyTop(keyboard.resolve(code), sprite.position);
      S.clip = { sprite, t0: t, from: sprite.position.clone(), pasteAt: -1 };
      scene.add(sprite);
    } else if (mod && name === 'KeyV' && S.clip && S.clip.pasteAt < 0) {
      S.clip.pasteAt = t;
      S.clip.from = S.clip.sprite.position.clone();
      S.clip.to = keyboard.keyTop(keyboard.resolve(code), V());
    }
  }

  const fxSprite = (kind, order) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.fxTexture(kind), depthTest: false, transparent: true }));
    sprite.renderOrder = order;
    return sprite;
  };
  const angerMark = fxSprite('anger', 45);
  angerMark.visible = false;
  scene.add(angerMark);
  const dizzyStars = Array.from({ length: 3 }, () => {
    const star = fxSprite('dizzyStar', 46);
    star.visible = false;
    scene.add(star);
    return star;
  });

  // A sticker that drifts with `vel` and fades over `life` seconds.
  function effect(kind, at, life, size, vel, order) {
    const sprite = fxSprite(kind, order);
    sprite.position.copy(at);
    scene.add(sprite);
    effects.push({ kind, sprite, t0: now(), life, size, from: at.clone(), vel });
  }

  // The tail lands: a burst and puffs of dust where it hits, the desk jumps, the body flinches.
  function slam(t) {
    S.lastSlam = t;
    const tip = cat.tailTip(V());
    tip.y = keyboard.surfaceAt(tip.x, tip.z) + 0.08;
    effect('bang', tip, 0.24, 0.36, V(0, 0.15, 0), 42);
    for (const s of [-1, 0, 1]) effect('dust', tip, 0.5, 0.13 + 0.04 * Math.random(), V(s * 0.5 + 0.1, 0.3 + 0.15 * Math.random(), 0.1), 41);
    P.desk.kick(0.35);
    P.squash.kick(0.25);
  }

  // The label floats beside the striking arm, on its outer side, like the reference.
  function popup(k, t, side, label = k.label) {
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i].key === k) { scene.remove(popups[i].sprite); popups.splice(i, 1); }
    const { tex, aspect } = K.labelTexture(label);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.renderOrder = 40;
    keyboard.keyTop(k, sprite.position).add(V(side * 0.3, 0.2, -0.1));
    sprite.userData.base = sprite.position.clone();
    sprite.userData.aspect = aspect;
    scene.add(sprite);
    popups.push({ key: k, sprite, t0: t, upAt: null });
  }

  // What the cat says, in a bubble by its head. One at a time.
  let bubble = null;
  function say(text, dur = 2.6) {
    if (bubble) scene.remove(bubble.sprite);
    const { tex, aspect } = K.bubbleTexture(text);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.renderOrder = 46;
    scene.add(sprite);
    bubble = { sprite, aspect, t0: now(), dur };
    S.busyUntil = Math.max(S.busyUntil, now() + 0.6);
  }

  // The pomodoro badge in the top left corner.
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  badge.renderOrder = 46;
  badge.visible = false;
  scene.add(badge);

  // The tail's reach is scripted like a paw strike so the tip lands on time; the key goes down and
  // its label pops up only when the tip touches it.
  function updateTailTap(t, dt) {
    const k = tailTap.key;
    if (!k) return;
    const age = t - tailTap.t0, swinging = age < tailTap.dur;
    if (swinging) tailTap.reach = mix(tailTap.from, 1, smooth(0, 1, age / tailTap.dur));
    else if (tailTap.landAt < tailTap.t0) {
      tailTap.reach = 1;
      tailTap.landAt = t;
      // A tail pat is lighter than a paw strike: a small dip and nod.
      P.squash.kick(0.15);
      P.pitch.kick(0.4);
      if (!opts.privacy) popup(k, t, 1);
    }
    const pressing = !swinging && (tailTap.down || t - tailTap.landAt < 0.09);
    k.down = pressing;
    // Up in an arc while swinging over, down onto the cap, then a little bounce back up.
    let hover = 0.12;
    if (swinging) hover = 0.12 + Math.sin(age / tailTap.dur * Math.PI) * 0.1 * (1 - tailTap.from);
    else if (pressing) hover = 0;
    tailTap.hover += (hover - tailTap.hover) * approach(swinging ? 60 : pressing ? 70 : 18, dt);
    // Ease back from the cap while the tip lifts; the render step smooths the reach weight.
    if (!pressing && !swinging) {
      tailTap.returnAt ??= t;
      const progress = (t - tailTap.returnAt) / TAIL_RETURN_SECONDS;
      tailTap.reach = Math.max(0, 1 - progress);
      if (tailTap.reach === 0) { tailTap.key = null; return; }
    }
    S.busyUntil = Math.max(S.busyUntil, t + 1);
  }

  // Where the paws go when they are not striking a key, if something other than the usual
  // resting places applies: a scene, lying down, kneading, a tucked-in sleep. Returns the target
  // and the stiffness of the paw's spring, or null.
  function pawPose(name, paw, t) {
    const sc = S.scene, u = sc ? (t - sc.t0) / sc.dur : 0;
    if (sc && sc.kind === 'push' && name === 'L') {
      const pose = pushPaw(sc, t);
      if (pose) return pose;
    }
    if (sc?.kind === 'yarn' && !S.lying) {
      const pose = yarnPaw(sc, name, paw, t - sc.t0);
      if (pose) return pose;
    }
    if (sc && sc.kind === 'swat' && name === sc.paw && u < 0.6) {
      const arm = cat.arms[paw.side < 0 ? 0 : 1];
      cat.attach(arm.shoulderLocal, arm.shoulder);
      return [tmp.copy(arm.shoulder).add(V(paw.side * 0.85, -0.38 + 0.15 * Math.sin(u / 0.6 * Math.PI), 0.35)), 12];
    }
    const lie = P.lie.x;
    const LS = S.lying;
    if (LS?.at === 'cuddle') {
      const k = paw.side < 0 ? 0 : 1;
      if (LS.dizzy && !LS.up) {
        // The higher paw lets go first as the chest rolls off the lower one.
        const releaseAt = k ? 0.15 : 0.25;
        const release = smooth(releaseAt, k ? 0.73 : 0.83, lie);
        if (lie < releaseAt) paw.aimWant = DIZZY_BRACE_AIMS[k];
        return [tmp.lerpVectors(LS.brace[k], lieStage.paws[k], release), 4];
      }
      // Relax the wrists into the side pose as the chest turns, with the higher paw following later.
      const fold = smooth(k ? 0.22 : 0.06, k ? 0.96 : 0.85, lie);
      return [restPaw(paw, tmp).lerp(lieStage.paws[k], fold), 4];
    }
    if (LS && !LS.up && LS.at === 'board' && lie < 0.45) {
      // Reaching out onto the keys before it lies down: one paw, then the other.
      if (t - LS.t0 < (paw.side < 0 ? 0.05 : 0.25)) return null;
      return [tmp.copy(LIE.board.loaf.paws[paw.side < 0 ? 0 : 1]), 6];
    }
    if (lie > 0.45) {
      // Lying, the paws go where the pose puts them as the cat lets go (see LIE): the near one
      // first. Asleep, now and then one twitches in a dream, and a hanging one swings a little
      // after it.
      const k = paw.side < 0 ? 0 : 1;
      if (k === 0 && stopping(t)) {
        // 阻止打字: the elbow stays down on the keys at the end of the board and the forearm
        // comes up from it beside the face, the beans to you, wagging "no".
        paw.hang = 0;
        paw.aimWant = STOP_AIM;
        paw.elbowWant = STOP_ELBOW;
        return [tmp.copy(STOP_ELBOW).add(V(-0.1 + 0.04 * Math.sin(t * 13), 0.49 + 0.02 * Math.sin(t * 26), 0.07)), 7];
      }
      tmp.copy(lieStage.paws[k]);
      paw.hang = lieStage.hang[k];
      const d = S.dream;
      if (d && d.part === k) {
        const u = (t - d.t0) / 0.9;
        if (u < 1) tmp.add(V(0.05 * Math.sin(u * 26) * (1 - u), 0.03 * Math.max(0, Math.sin(u * 26)) * (1 - u), 0.03 * Math.sin(u * 13) * (1 - u)));
      }
      return [tmp, paw.hang > 0.5 ? 3 : 4];
    }
    if (name === 'L' && mousing(t)) return null;
    const act = S.act, actU = act ? (t - act.t0) / act.dur : 0;
    if (act && act.kind === 'groom' && name === 'R' && actU > 0.08 && actU < 0.86) {
      cat.head.getWorldPosition(tmp2);
      paw.aimWant = GROOM_AIM;
      return [tmp.copy(tmp2).add(V(0.12, -0.35 + 0.025 * lick(t), 0.5)), 4.5];
    }
    if (sc && sc.kind === 'stretch') {
      const env = smooth(0, 0.3, u) * (1 - smooth(0.7, 1, u));
      return [restPaw(paw, tmp).add(V(paw.side * 0.08 * env, 0.06 * env, 0.62 * env)), 2.4];
    }
    if (S.purr > 0.6 && t - S.lastKey > 1.2 && !sc) {
      // Kneading: each paw in turn presses down onto the keyboard edge and lifts again.
      const beat = Math.sin(S.breath * Math.PI * 4 + (paw.side < 0 ? 0 : Math.PI));
      return [restPaw(paw, tmp).add(V(0, 0.07 * Math.max(0, beat), -0.03 * Math.max(0, beat))), 5];
    }
    if (S.sleep > 0.5 && S.sleepPose === 'tuck') {
      // 揣手: paws tucked under the chest, only the white tips showing.
      return [cat.attach(tmp2.set(paw.side * 0.13, 0.1, 0.56), tmp), 2];
    }
    return null;
  }

  // Where a paw rests: hanging over the far edge of the keyboard, or on the desk without one.
  function restPaw(paw, out) {
    const arm = cat.arms[paw.side < 0 ? 0 : 1];
    cat.attach(arm.shoulderLocal, arm.shoulder);
    return out.set(arm.shoulder.x + paw.side * 0.02, keyboard.group.visible ? 0.26 : 0.07, 0.68);
  }

  // A strike is scripted (it has to land on time); every other paw move goes through the paw's
  // spring so it eases out, carries momentum from the strike, and settles with a small bob.
  function updatePaw(name, paw, t, dt) {
    const k = paw.key;
    const strikeAge = t - paw.t0;
    if (k && (paw.heavy || paw.down || strikeAge < paw.dur + 0.06)) {
      // Unroll the wrist as it reaches for the key, even while the chest is still lying down.
      paw.keyPose = mix(paw.keyPoseFrom, 1, smooth(0, paw.dur, strikeAge));
      const top = keyboard.keyTop(k, tmp2);
      const hover = tmp.copy(top).add(V(0, 0.12, 0));
      const press = top.clone().add(V(0, 0.07, 0));
      if (strikeAge < paw.dur) {
        // Lift first, then come down onto the key: the arc peaks early. Enter gets a bigger swing.
        const u = smooth(0, 1, strikeAge / paw.dur);
        paw.pos.lerpVectors(paw.from, hover, u);
        paw.pos.y += Math.sin(Math.sqrt(u) * Math.PI) * clamp(paw.from.distanceTo(hover) * 0.3, 0.04, 0.2) * (paw.lift || 1);
      } else if (paw.down || paw.heavy) {
        const landing = clamp((strikeAge - paw.dur) / 0.035, 0, 1);
        paw.pos.lerpVectors(hover, press, landing);
        if (paw.heavy && landing === 1) {
          paw.heavy = false;
          P.squash.kick(1.25);
          P.pitch.kick(1.55);
          P.impactRoll.kick(-paw.side * 4.3);
          P.desk.kick(0.44);
          effect('bang', top.add(V(0, 0.12, 0)), 0.28, 0.34, V(0, 0.2, 0), 42);
        }
      } else {
        paw.pos.lerp(hover, approach(30, dt));
      }
      paw.spring.x.copy(paw.pos);
      if (dt > 0) paw.spring.v.subVectors(paw.pos, paw.last).divideScalar(dt).multiplyScalar(0.5);
      paw.last.copy(paw.pos);
      return;
    }
    // A quick tap can end before the cat has rolled back up. Keep that wrist turned for the rise.
    if (S.lying?.at !== 'cuddle' || !S.lying.up) paw.keyPose *= 1 - approach(12, dt);
    let target, hz = 3.2, damping = 0.78;
    paw.hang = 0;
    // A paw the lying pose turns on purpose turns that way.
    paw.elbowWant = null;
    paw.aimWant = S.lying && lieStage.aimed ? lieStage.aims[paw.side < 0 ? 0 : 1] : null;
    const pose = pawPose(name, paw, t);
    if (pose) {
      [target, hz] = pose;
    } else if (name === 'L' && mousing(t)) {
      // Holding the mouse the paw sticks to it, so this spring is stiff.
      target = mouseProp.top(tmp);
      hz = t - S.lastMouse < 0.05 || S.mouseDown ? 9 : 6;
      damping = 0.9;
    } else if (k && t - paw.t0 < 0.45) {
      // Hovers over the key it just hit, ready for the next one.
      target = keyboard.keyTop(k, tmp).add(V(0, 0.13, 0));
      hz = 5;
    } else if (t - S.lastKey < 1.2) {
      // While typing, the free paw curls up against the side of the belly.
      target = cat.attach(tmp2.set(paw.side * 0.55, 0.6, 0.44), tmp);
      hz = 3.6;
    } else {
      // At rest both paws hang straight down onto the far edge of the keyboard.
      target = restPaw(paw, tmp);
      hz = 2.4;
    }
    paw.spring.hz = hz;
    paw.spring.damping = damping;
    paw.pos.copy(paw.spring.step(target, dt));
    paw.last.copy(paw.pos);
    paw.limp += (paw.hang - paw.limp) * approach(3, dt);
    // An elbow put down somewhere on purpose (see pawPose) eases there, and back again after.
    const el = paw.elbow;
    el.k += ((paw.elbowWant ? 1 : 0) - el.k) * approach(7, dt);
    if (paw.elbowWant) el.at.lerp(paw.elbowWant, el.k < 0.05 ? 1 : approach(9, dt));
    const aim = paw.aim, want = paw.aimWant;
    let aimWeight = want ? 1 : 0;
    if (want && S.lying?.at === 'cuddle' && S.lying.up) {
      // Let the wrists return to their resting angle while the chest is still rising.
      aimWeight = smooth(0.15, 0.65, P.lie.x);
    }
    aim.k += (aimWeight - aim.k) * approach(7, dt);
    if (want) { aim.toes.lerp(want.toes, approach(9, dt)); aim.top.lerp(want.top, approach(9, dt)); }
  }

  // Screen position (canvas CSS pixels) of a world point.
  function screen(p, out) {
    tmp.copy(p).project(camera);
    return out.set((tmp.x + 1) / 2 * window.innerWidth, (1 - tmp.y) / 2 * window.innerHeight, 0);
  }

  const aimedPupil = V();
  function aimPupil(eye, focus, room, horizontalGain = 1) {
    // Map the screen direction to the eye's tilted plane, where the pupil actually moves.
    const group = eye.group, depth = eye.pupil.position.z, step = 0.1;
    const centre = screen(group.localToWorld(tmp2.set(0, 0, depth)), V());
    const right = screen(group.localToWorld(tmp2.set(step, 0, depth)), V()).sub(centre);
    const up = screen(group.localToWorld(tmp2.set(0, step, depth)), V()).sub(centre);
    const det = right.x * up.y - right.y * up.x;
    if (Math.abs(det) < 1e-3) return aimedPupil.set(0, 0, 0);
    const dx = focus.x - centre.x, dy = focus.y - centre.y;
    const x = horizontalGain * step * (dx * up.y - dy * up.x) / det;
    const y = step * (right.x * dy - right.y * dx) / det;
    const scale = Math.max(1, Math.hypot(x / Math.max(room, 0.001), y / 0.026));
    return aimedPupil.set(x / scale, y / scale, 0);
  }

  const headEuler = new THREE.Euler(), headTurn = new THREE.Quaternion();

  // MARK: Scenes

  function startScene(kind, t, extra = {}) {
    const dur = { push: 7.2, yarn: 5.15, stretch: 2.4, nudge: 2.6, swat: 1 }[kind];
    S.scene = { kind, t0: t, dur, ...extra };
    if (kind === 'push') planPush(S.scene, t, freshPush());
    if (kind === 'yarn') planYarn(S.scene);
    S.act = null;
    S.busyUntil = Math.max(S.busyUntil, t + S.scene.dur + 1);
  }

  function endScene(t, interrupted = false) {
    const sc = S.scene;
    S.scene = null;
    if (!sc) return;
    if (sc.kind === 'yarn') S.nextYarn = t + 100;
    if (sc.kind === 'push') {
      const fell = S.cupFall || S.cupBackAt;
      S.nextPush = t + (fell ? 600 : 120);
      // Job done: a long, satisfied blink at you, or a quick wash as if nothing happened. Caught
      // and backing down, it looks off to one side.
      if (fell && !interrupted) S.act = Math.random() < 0.55 ? { kind: 'slowBlink', t0: t, dur: 1.8, side: 1 } : { kind: 'groom', t0: t, dur: 2.6, side: 1 };
      else if (sc.caught && !interrupted) S.act = { kind: 'look', t0: t, dur: 2, side: -1 };
    }
  }

  const YARN_ARRIVAL = 1.45;
  const yarnNext = V(), yarnAxis = V(), yarnSpin = new THREE.Quaternion();

  function yarnHeight(x, z) {
    return keyboard.group.visible ? keyboard.surfaceAt(x, z) + yarn.radius : yarn.home.y;
  }

  function planYarn(sc) {
    const flank = new THREE.Plane().setFromCoplanarPoints(camera.position,
      V(1, -1, 0).unproject(camera), V(1, 1, 0).unproject(camera));
    if (flank.normal.x < 0) flank.negate();
    sc.yarnFlank = flank;
    const viewEdge = p => p.x - flank.distanceToPoint(p) / flank.normal.x;
    sc.yarnRim = viewEdge(yarn.home);
    sc.yarnStart = yarn.home.clone().setX(sc.yarnRim + yarn.radius * 1.4);
    const middle = V(cat.home.x + 0.08, 0, 0.72);
    middle.y = yarnHeight(middle.x, middle.z);
    const exit = V(middle.x, yarn.home.y, middle.z);
    exit.x = viewEdge(exit) + yarn.radius * 1.4;
    // The cat faces the camera, so its left paw is 'R' (screen right).
    sc.pats = [
      { paw: 'R', at: 2.03, from: yarn.home, to: middle, roll: 0.84, pulling: true },
      { paw: 'L', at: 3.65, from: middle, to: exit, roll: 1.05 },
    ];
    yarn.group.position.copy(sc.yarnStart);
    yarn.group.rotation.set(0, 0, (yarn.home.x - sc.yarnStart.x) / yarn.radius);
    yarn.setOpacity(0);
  }
  function yarnRoll(pat, age, out) {
    const u = clamp((age - pat.at) / pat.roll, 0, 1);
    const travel = 1 - (1 - u) ** 3 * (1 + 3 * u);
    out.lerpVectors(pat.from, pat.to, travel);
    if (pat.pulling) {
      // Guide the ball over the back of the keyboard into the space between the paws.
      out.y = mix(pat.from.y, pat.to.y, smooth(0, 0.45, travel));
    } else {
      out.y = yarnHeight(out.x - yarn.radius * 0.5, out.z);
    }
    return out;
  }
  function yarnPaw(sc, name, paw, age) {
    const pat = sc.pats.find(p => p.paw === name && age >= p.at - 0.59 && age < p.at + 0.62);
    if (!pat) return null;
    const beat = age - pat.at;
    const follow = pat.pulling ? 0.38 : 0.20;
    const lift = smooth(-0.59, -0.23, beat) * (1 - smooth(follow, 0.62, beat));
    const dip = smooth(-0.28, -0.07, beat) * (1 - smooth(follow, follow + 0.14, beat));
    const target = yarnRoll(pat, Math.min(age, pat.at + follow), tmp2);
    target.x += paw.side * mix(pat.pulling ? 0.12 : 0.29, pat.pulling ? 0.17 : 0.22, dip);
    target.y += mix(pat.pulling ? 0.40 : 0.28, pat.pulling ? 0.13 : 0.075, dip);
    target.z += 0.065;
    return [restPaw(paw, tmp).lerp(target, lift), 7];
  }
  function updateYarn(sc, age, dt) {
    if (sc) {
      yarnNext.lerpVectors(sc.yarnStart, yarn.home, smooth(0, YARN_ARRIVAL, age));
      for (const pat of sc.pats) {
        if (age < pat.at) break;
        yarnRoll(pat, age, yarnNext);
      }
      const ball = yarn.group, dx = yarnNext.x - ball.position.x, dz = yarnNext.z - ball.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0) {
        yarnSpin.setFromAxisAngle(yarnAxis.set(dz, 0, -dx).divideScalar(distance), distance / yarn.radius);
        ball.quaternion.premultiply(yarnSpin).normalize();
      }
      ball.position.copy(yarnNext);
      if (sc.noticedAt === undefined && ball.position.x <= sc.yarnRim) sc.noticedAt = age;
      // The outline extends beyond the ball's rolling radius.
      if (sc.noticedAt !== undefined && sc.yarnLeftAt === undefined
        && sc.yarnFlank.distanceToPoint(ball.position) > yarn.radius * 1.1) sc.yarnLeftAt = age;
      if (yarn.opacity !== 1) yarn.setOpacity(1);
    } else if (yarn.opacity) {
      const opacity = yarn.opacity * (1 - approach(18, dt));
      yarn.setOpacity(opacity < 0.01 ? 0 : opacity);
    }
  }

  // Cup pushing, the way cats do it: it locks onto the cup and goes still, checks that you are
  // watching, lifts a paw and holds it there, gives a tentative pat, then a few harder ones at
  // uneven intervals, glancing back at you between them with the paw still raised. One last look,
  // a big shove, and it watches the cup go over the edge before turning back to you all innocence.
  // The plan is a list of beats with randomised lengths, so no two pushes play out the same. The
  // cup is moved by the paw touching it (see `slideCup`), not on a timer.
  const CUP_EDGE = -1.5;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function planPush(sc, t, list) {
    let at = 0;
    sc.beats = list.map(([kind, dur, extra]) => { const b = { kind, t: at, dur, ...extra }; at += dur; return b; });
    sc.t0 = t;
    sc.dur = at;
  }
  function freshPush() {
    const list = [['notice', rnd(0.9, 1.5)], ['check', rnd(0.6, 1)], ['reach', 0.55], ['hover', rnd(0.3, 0.8)],
      ['tap', 0.6, { d: 0.015, slow: true }]];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      list.push(Math.random() < 0.5 ? ['check', rnd(0.5, 0.9)] : ['hover', rnd(0.2, 0.6)]);
      list.push(['tap', rnd(0.4, 0.5), { d: 0.05 + 0.035 * i }]);
      if (Math.random() < 0.3) list.push(['tap', 0.3, { d: 0.04 }]);
    }
    list.push(['hover', rnd(0.3, 0.6)], ['check', rnd(0.6, 0.9)], ['shove', 0.55], ['watch', 1.2], ['innocent', 1.4]);
    return list;
  }
  // The beat playing now and how far into it (0..1).
  function beatOf(sc, t) {
    const age = t - sc.t0;
    let b = sc.beats[0];
    for (const x of sc.beats) if (x.t <= age) b = x;
    return { b, u: clamp((age - b.t) / b.dur, 0, 1), age };
  }
  // Caught in the act (you moved the mouse): it freezes, paw in the air, and stares at you. Then
  // either it holds your gaze and shoves the cup off anyway, or it lowers the paw slowly and
  // looks away as if nothing happened. Only before the shove, and only once.
  function catchPush(t) {
    const sc = S.scene;
    if (!sc || sc.kind !== 'push') return false;
    if (sc.caught) return true;
    const { b } = beatOf(sc, t);
    if (!['reach', 'hover', 'tap', 'check'].includes(b.kind) || !sc.raised) return false;
    sc.caught = t;
    sc.hold = paws.L.pos.clone();
    planPush(sc, t, Math.random() < 0.5
      ? [['caught', rnd(0.7, 1.1)], ['shove', 0.4], ['watch', 1.1], ['innocent', 1.4]]
      : [['caught', rnd(0.7, 1.1)], ['retreat', 1.1]]);
    return true;
  }
  // Where the paw goes during the push, and how stiff its spring is: snappy pats, slow lifts.
  function pushPaw(sc, t) {
    const { b, u } = beatOf(sc, t);
    const c = cup.group.position, R = cup.radius;
    // Touching the cup on its front right, a little below the rim, so the paw shows in front of
    // it; hovering, raised and drawn back.
    // A pat aims at where the cup was when it began, so the cup moves by the pat's own depth.
    if (b.cx === undefined) b.cx = c.x;
    const contact = tmp3.set((b.kind === 'tap' ? b.cx : c.x) + R * 0.7 + 0.09, c.y + 0.12, c.z + R * 0.7 + 0.06);
    const hover = V(contact.x + 0.07, contact.y + 0.22, contact.z + 0.05);
    const tremble = V(0, Math.sin(t * 9) * 0.008, 0);
    switch (b.kind) {
      case 'reach': sc.raised = true; return [tmp.copy(hover), 5];
      case 'hover': return [tmp.copy(hover).add(tremble), 6];
      case 'check': return sc.raised ? [tmp.copy(hover).add(tremble), 6] : null;
      case 'tap':
        // The spring carries the paw a little past its aim, so it aims short; and it always leaves
        // the cup some way from the edge for the final shove.
        if (u < (b.slow ? 0.5 : 0.28)) return [tmp.copy(contact).add(V(-Math.min(b.d * 0.6, Math.max(0, (b.cx - CUP_EDGE - 0.12) * 0.3)), 0, 0)), b.slow ? 5 : 16];
        return [tmp.copy(hover), 5];
      case 'shove':
        if (u < 0.3) return [tmp.copy(hover).add(V(0.06, 0.12, 0)), 8];
        return [tmp.set(CUP_EDGE - 0.08 + R * 0.7 + 0.09, contact.y, contact.z), 13];
      case 'caught': return [tmp.copy(sc.hold), 20];
      case 'retreat': return [restPaw(paws.L, tmp), 1.6];
      case 'watch': return u < 0.35 ? [tmp.copy(paws.L.pos), 3] : null;
      default: return null;
    }
  }
  // The paw shoves the cup when it presses on its side; let go, the cup slides on a little and
  // stops. It tips in the direction it moves.
  function slideCup(dt) {
    const c = cup.group.position, paw = paws.L.pos, R = cup.radius;
    const edge = paw.x - 0.09 - R * 0.7;
    const touching = Math.abs(paw.y - (c.y + 0.12)) < 0.16 && Math.abs(paw.z - c.z - R * 0.7 - 0.06) < 0.25 && edge < c.x;
    if (touching && dt > 0) {
      // Heavy and grippy: it keeps only a little of the paw's speed once let go.
      S.cupV = Math.max(-0.9, Math.min(S.cupV || 0, (edge - c.x) / dt));
      c.x = edge;
    } else {
      c.x += (S.cupV || 0) * dt;
      S.cupV = (S.cupV || 0) * Math.exp(-14 * dt);
    }
    cup.group.rotation.z += (clamp(-(S.cupV || 0) * 0.12, 0, 0.22) - cup.group.rotation.z) * approach(14, dt);
    if (c.x < CUP_EDGE && !S.cupFall) {
      S.cupFall = { t0: now(), from: c.clone(), vx: Math.min(-0.4, S.cupV || 0) };
      S.cupV = 0;
      life.add('pushes');
      // Over it goes: skip ahead to watching it fall.
      const sc = S.scene;
      if (sc && sc.kind === 'push' && sc.beats) {
        const { b } = beatOf(sc, now());
        if (b.kind !== 'watch' && b.kind !== 'innocent') planPush(sc, now(), [['watch', 1.2], ['innocent', 1.4]]);
      }
    }
  }

  function updateCup(t, dt) {
    if (!opts.cup) { cup.setOpacity(0); return; }
    if (S.cupFall) {
      const f = S.cupFall, age = t - f.t0;
      cup.group.position.set(f.from.x + f.vx * age, f.from.y - 4.5 * age * age, f.from.z);
      cup.group.rotation.z = age * 4;
      cup.setOpacity(1 - smooth(0.25, 0.6, age));
      cup.update(t, 0);
      if (age > 0.6 && !f.landed) {
        f.landed = true;
        effect('bang', V(f.from.x - 0.3, f.from.y - 1.3, f.from.z), 0.3, 0.3, V(0, 0.1, 0), 42);
      }
      if (age > 0.7) { S.cupFall = null; S.cupBackAt = t + 90; cup.group.rotation.set(0, 0, 0); }
      S.busyUntil = Math.max(S.busyUntil, t + 0.5);
      return;
    }
    if (S.cupBackAt) {
      cup.setOpacity(0);
      if (t > S.cupBackAt && !S.scene) { S.cupBackAt = 0; S.cupIn = t; cup.group.position.copy(cup.home); }
      return;
    }
    slideCup(dt);
    cup.setOpacity(S.cupIn ? smooth(0, 1, t - S.cupIn) : 1);
    // Steam rises while the cup stands still.
    cup.update(t, 1 - clamp(Math.abs(S.cupV || 0) * 5, 0, 1));
  }

  // The cat presses a key by itself, or pats the space bar with its tail, then looks at you: are
  // you going to pay it some attention?
  function updateNudge(sc, t) {
    const age = t - sc.t0;
    if (!sc.pressed && age > 0.2) {
      sc.pressed = true;
      if (Math.random() < 0.4) tailPat(keyboard.resolve('Space'), t, false);
      else {
        const k = keyboard.randomLetter();
        const paw = strike(k, mousing(t) || keyboard.leftHand(k.code) ? 'R' : 'L', t);
        if (!opts.privacy) popup(k, t, paw.side);
        setTimeout(() => { k.down = false; if (paw.key === k) paw.down = false; }, 130);
      }
    }
    if (!sc.said && age > 0.8) { sc.said = true; say('喵?', 1.8); }
  }

  // Swatting at the other cat when it sits close by.
  function swatFriend(t) {
    const hs = screen(cat.head.getWorldPosition(tmp2), V());
    const side = S.friend.x < hs.x ? 'L' : 'R';
    startScene('swat', t, { paw: side });
    setTimeout(() => post({ friend: 'swat' }), 250);
  }

  // MARK: Frame

  function update(t, dt) {
    const idle = t - S.lastInput;
    const wall = Date.now(), wallDt = clamp((wall - S.lastWall) / 1000, 0, 5);
    S.lastWall = wall;
    if (!S.asleep && !S.petting && !S.nag && t >= S.cuddleUntil && idle > opts.sleepAfter) {
      S.asleep = true;
      // Picks how to sleep this time.
      const r = Math.random();
      S.sleepPose = r < 0.5 ? 'loaf' : r < 0.75 ? 'curl' : 'tuck';
    }
    // Left alone long enough, it goes and lies down across the keyboard.
    if (S.asleep && !isBoardSleep(S.sleepPose) && TUNING.sprawlAfter > 0 && idle > opts.sleepAfter + TUNING.sprawlAfter * 60 && opts.role !== 'mouse') {
      S.sleepPose = Math.random() < 0.5 ? 'board' : 'boardSide';
    }
    S.sleep += ((S.asleep ? 1 : 0) - S.sleep) * approach(S.asleep ? 1.2 : 6, dt);
    if (S.asleep) life.add('napSec', wallDt);
    if (S.petting) S.petUntil = t + 0.25;
    const pet = t < S.petUntil;
    if (S.petting) { life.add('petSec', dt); life.addBond(dt / 10); }

    keyboard.update(dt);
    mouseProp.update(dt, S.mouseDown);
    updateCup(t, dt);
    updatePaw('L', paws.L, t, dt);
    updatePaw('R', paws.R, t, dt);
    updateTailTap(t, dt);

    // Excitement: how busy the last two seconds were.
    while (S.strokes.length && t - S.strokes[0] > 2) S.strokes.shift();
    const busyness = clamp(S.strokes.length / 8, 0, 1);
    S.excite = Math.max(S.excite * Math.exp(-dt / 1.5), busyness, mousing(t) ? 0.6 : 0);

    // Irritation builds from sustained very fast typing and petting that goes on too long, and
    // fades once things are quiet again. Thresholds come from the 调节 window. The closer you
    // are, the longer it puts up with being petted.
    const level = life.level().level;
    const rate = S.strokes.length / 2;
    if (rate > TUNING.typeRate) poke((rate - TUNING.typeRate) * 0.05 * dt, t);
    // Petted too long before it has started purring, it gets fed up; once it purrs it is happy
    // for as long as you keep going.
    if (S.petting && S.petStart >= 0 && S.purr < 0.2 && t - S.petStart > TUNING.petLimit * (1 + 0.25 * (level - 1))) poke(0.3 * dt, t);
    if (t - (S.lastPoke || 0) > 2) S.annoy = Math.max(0, S.annoy - TUNING.calmRate / 100 * dt);
    const crossAt = TUNING.crossAt / 100;
    if (!S.cross && S.annoy >= crossAt) { S.cross = true; S.crossSince = t; S.thumpPhase = 0; S.act = null; if (S.scene) endScene(t, true); }
    if (S.cross && S.annoy < crossAt * 0.42 && t - S.crossSince > 3) S.cross = false;
    if (S.asleep) S.cross = false;

    // Pointer speed over the last 0.2 s, in screen points per second. Fast enough, the cat
    // gets curious and keeps watching for a moment after the pointer stops.
    while (S.moves.length && t - S.moves[0][0] > SHAKE_WINDOW) S.moves.shift();
    S.mouseSpeed = S.moves.reduce((sum, m) => sum + (t - m[0] <= 0.2 ? m[3] : 0), 0) / 0.2;
    if (S.dizzyAt !== null && (S.asleep || S.cross || S.nag || t - S.dizzyAt >= DIZZY_TIME)) S.dizzyAt = null;
    if (opts.role !== 'keys' && t >= S.nextDizzy && !S.asleep && !S.cross && !S.nag && !pet && !S.mouseDown &&
      !S.scene && !S.lying && !S.yawn && !S.yawnAt && t >= S.cuddleUntil && t >= S.sulkUntil && t - S.lastUserKey > SHAKE_WINDOW &&
      (shookPointer(1) || shookPointer(2))) {
      S.dizzyAt = t;
      S.nextDizzy = t + DIZZY_COOLDOWN;
      S.curiousUntil = t;
    }
    const dizzy = S.dizzyAt !== null;
    const dizzyAge = dizzy ? t - S.dizzyAt : 0;
    const dizzyIntensity = dizzy ? smooth(0, 0.18, dizzyAge) * (1 - smooth(DIZZY_TIME - 0.52, DIZZY_TIME, dizzyAge)) : 0;
    const dizzyClosing = smooth(DIZZY_CLOSE_AT, DIZZY_FALL_AT, dizzyAge);
    const headWobble = smooth(0.28, 0.72, dizzyAge) * (1 - smooth(1.45, DIZZY_FALL_AT, dizzyAge))
      * Math.sin((dizzyAge - 0.28) * 6.5);
    const bodyTip = smooth(DIZZY_FALL_AT - 0.4, DIZZY_FALL_AT, dizzyAge);
    const bodySway = smooth(DIZZY_CLOSE_AT, 1.55, dizzyAge) * (1 - smooth(DIZZY_FALL_AT, DIZZY_FALL_AT + 0.55, dizzyAge))
      * mix(Math.sin((dizzyAge - DIZZY_CLOSE_AT) * 5.6), 0.8, bodyTip);
    if (!dizzy && TUNING.curiousOn && !S.asleep && S.mouseSpeed > TUNING.curiousSpeed) S.curiousUntil = t + TUNING.curiousHold;
    const curiousNow = !dizzy && t < S.curiousUntil && !S.asleep;
    P.curious.step(curiousNow ? 1 : 0, dt);
    // Something fascinating beats a grudge: curiosity eases the cross face while it lasts.
    const curious = clamp(P.curious.x, 0, 1);
    P.cross.step(S.cross && !curiousNow ? 1 : 0, dt);
    const cross = clamp(P.cross.x, 0, 1);
    if (S.cross || curiousNow) S.busyUntil = Math.max(S.busyUntil, t + 1);

    // The break reminder: after a long stretch of work, it lies down across the keys.
    const pomoOn = !!S.pomo;
    if (!S.nag && TUNING.breakAfter > 0 && !pomoOn && !S.asleep && opts.role !== 'mouse'
      && wall - S.workStart > TUNING.breakAfter * 60e3 && wall - S.lastInputWall < 10e3) {
      S.nag = { t0: t, lastSay: t };
      if (S.scene) endScene(t, true);
      say(['起来活动一下吧', '该休息一下啦', '眼睛也要休息哦'][Math.floor(Math.random() * 3)], 4);
    }
    if (S.nag) {
      if (t - S.nag.lastSay > 40 && t - S.lastUserKey < 5) { S.nag.lastSay = t; say(['休息一下嘛', '喵！起来走走', '不让你打字了'][Math.floor(Math.random() * 3)], 3); }
      if (idle > 45) endNag('rested', t);
      else if (t - S.nag.t0 > 180) endNag('gaveup', t);
      S.busyUntil = Math.max(S.busyUntil, t + 1);
    }

    // Late at night it gets sleepy while you are still at it, and says so now and then.
    const hours = new Date().getHours() + new Date().getMinutes() / 60;
    const night = TUNING.nightOn && (hours < 12 ? hours + 24 : hours) >= TUNING.nightAt && hours < 6 + (hours < 12 ? 0 : 24)
      && wall - S.lastInputWall < 60e3 && !S.asleep;
    if (night) {
      if (t > S.nextNightYawn) { S.nextNightYawn = t + 70 + Math.random() * 80; S.yawnAt = t; }
      if (wall - S.nightSaidAt > 30 * 60e3) { S.nightSaidAt = wall; say('该睡觉啦', 3); }
    }

    // Pomodoro: focus, then a short break, round and round until switched off.
    if (S.pomo) {
      const left = S.pomo.until - wall;
      if (left <= 0) {
        if (S.pomo.phase === 'focus') {
          life.add('focus');
          S.pomo = { phase: 'break', until: wall + TUNING.pomoBreak * 60e3 };
          say(`专注完成！休息 ${TUNING.pomoBreak} 分钟`, 4);
          heart(t);
          if (!S.scene) startScene('stretch', t);
        } else {
          S.pomo = { phase: 'focus', until: wall + TUNING.pomoFocus * 60e3 };
          say('继续专注吧', 3);
        }
      }
      const mins = Math.max(1, Math.ceil((S.pomo.until - wall) / 60e3));
      const { tex } = K.badgeTexture(String(mins), S.pomo.phase);
      if (badge.material.map !== tex) { badge.material.map = tex; badge.material.needsUpdate = true; }
      badge.visible = true;
      badge.position.set(-1.12, 1.82, 0.3);
      badge.scale.set(0.5, 0.25, 1);
    } else badge.visible = false;
    const quiet = S.pomo && S.pomo.phase === 'focus';

    // Sulking after you stayed away for days: face turned away until petted for a while.
    const sulking = t < S.sulkUntil;
    if (sulking && S.petting) {
      S.sulkPet += dt;
      if (S.sulkPet > 3) { S.sulkUntil = 0; say('好吧，原谅你了', 2.4); heart(t); }
    }

    // A yawn: woken up, or sleepy late at night, or now and then when idle for a long time.
    if (S.yawnAt && t > S.yawnAt) { S.yawnAt = 0; S.yawn = { t0: t, dur: 2.4 }; S.stretchUntil = t + 7; }
    let yawnOpen = 0;
    if (S.yawn) {
      const u = (t - S.yawn.t0) / S.yawn.dur;
      if (u >= 1) S.yawn = null;
      // Wide open and held there, quivering a little at the top of the yawn, then shut.
      else yawnOpen = smooth(0, 0.25, u) * (1 - smooth(0.75, 1, u)) * (1 + 0.05 * Math.sin(t * 22) * smooth(0.3, 0.45, u) * (1 - smooth(0.6, 0.75, u)));
      S.busyUntil = Math.max(S.busyUntil, t + 0.5);
    }
    cat.setYawn(yawnOpen);
    // After a wake-up yawn, if left alone, it stretches its front legs out over the keys.
    if (!S.yawn && t < S.stretchUntil && !S.scene && idle > 1.2 && !S.asleep && !S.lying && !S.nag && !dizzy) {
      S.stretchUntil = 0;
      startScene('stretch', t);
    }

    // Scenes run their course; a few check for their end conditions.
    let sc = S.scene;
    if (sc?.kind === 'yarn' && (S.asleep || S.nag)) endScene(t, true);
    else if (sc?.kind === 'yarn' && S.lying) sc.t0 = t;
    else if (sc && t > sc.t0 + sc.dur) {
      endScene(t);
    }
    sc = S.scene;
    if (sc && sc.kind === 'nudge') updateNudge(sc, t);

    // Give break reminders and sleep over the keyboard priority over either side flop.
    let lieWant = null;
    if (S.nag || (S.asleep && isBoardSleep(S.sleepPose))) lieWant = 'board';
    if (S.nag || S.asleep || S.cross) S.cuddleUntil = 0;
    const dizzyFlop = dizzy && dizzyAge >= DIZZY_FALL_AT && !S.nag;
    if (!lieWant && (dizzyFlop || t < S.cuddleUntil)) lieWant = 'cuddle';
    if (lieWant && lieWant !== S.lieAt && P.lie.x > 0.05) lieWant = null;     // get up first, then move
    else if (lieWant) S.lieAt = lieWant;
    if (lieWant && (S.lying?.at !== lieWant || S.lying.up)) {
      S.lying = { at: lieWant, t0: t, calm: S.asleep, dizzy: dizzyFlop };
      if (dizzyFlop) S.lying.brace = [paws.L.pos.clone(), paws.R.pos.clone()];
    }
    const LS = S.lying;
    const sideFlop = lieWant === 'cuddle';
    const cuddling = sideFlop && !LS.dizzy;
    const cuddleRise = !lieWant && LS?.at === 'cuddle' && !LS.dizzy && LS.landed && S.cuddleUntil > 0;
    const lieAge = LS ? t - LS.t0 : 0;
    const cuddleRestAge = LS?.at === 'cuddle' && !LS.dizzy && LS.landed ? t - LS.landed : 0;
    const clenchStrength = cuddling ? smooth(0, 0.42, S.cuddleUntil - t) : 0;
    const frontClench = clenchStrength * cuddlePawClench(cuddleRestAge);
    const hindClench = clenchStrength * cuddlePawClench(cuddleRestAge - 0.12);
    let rollWant = 0, meltWant = 0;
    if (LS && lieWant) {
      rollWant = sideFlop ? smooth(0, LS.dizzy ? DIZZY_LOWER : CUDDLE_LOWER, lieAge) : Number(lieAge >= BOARD_FLOP);
      P.lie.hz = LS.dizzy ? 1.8 : sideFlop ? 2.6 : 1.4;
      P.lie.damping = 0.85;
      if (!LS.landed && P.lie.x > (sideFlop ? 0.98 : 0.9) && (!LS.dizzy || P.melt.x > 0.88)) {
        LS.landed = t;
        if (cuddling) heart(t);
        else if (!sideFlop) P.squash.kick(0.25);
      }
      // Roll through the side pose while lowering. On the keys, keep the pause to stare.
      meltWant = sideFlop ? smooth(LS.dizzy ? 0.28 : CUDDLE_ROLL, LS.dizzy ? DIZZY_LOWER + 0.18 : 0.78, lieAge)
        : Number(!!LS.landed && (LS.calm || t - LS.landed > STARE));
      // Asleep, it wakes enough to move, and only dozes off again once down.
      if (!LS.landed || t - LS.landed < 1) S.sleep = Math.min(S.sleep, 0.3);
    } else if (LS) {
      LS.up = true;
      P.lie.hz = LS.at === 'cuddle' && !LS.dizzy ? 0.78 : 1.1;
      P.lie.damping = 0.85;
      // It gathers its limbs first, then up (chest first, as going down), and a stretch.
      rollWant = Number(P.melt.x > 0.3 && (LS.at !== 'cuddle' || !!LS.landed));
      if (P.lie.x < 0.02) {
        if (LS.at === 'board' && !S.asleep) S.stretchUntil = t + 4;
        if (cuddleRise) S.nextAct = Math.max(S.nextAct, t + 1);
        S.lying = null;
      }
    }
    P.lie.step(rollWant, dt);
    P.melt.hz = meltWant > P.melt.x ? (sideFlop ? 0.95 : 0.3) : 1.8;
    P.melt.step(meltWant, dt);
    P.doze.step(S.asleep ? 1 : 0, dt);
    P.tailLie.step(P.lie.x, dt);
    const lie = clamp(P.lie.x, 0, 1.12);
    if (S.lying) S.busyUntil = Math.max(S.busyUntil, t + 0.5);
    // Purring: petted past the 呼噜 threshold, or the pointer resting by its head once close.
    const hs = screen(cat.head.getWorldPosition(tmp2), V());
    S.rubCursor = level >= 3 && !pet && !dizzy && !LS?.dizzy && !S.asleep && !S.cross && !sc && S.cursor && t - S.cursorSeen > 1.2
      && Math.hypot(S.cursor.x - hs.x, S.cursor.y - hs.y) < 85 && !sulking;
    const purring = cuddling || (pet && !S.cross && S.petStart >= 0 && t - S.petStart > TUNING.purrAfter && !sulking) || S.rubCursor;
    P.purr.step(purring ? 1 : 0, dt);
    S.purr = clamp(P.purr.x, 0, 1);
    S.breath += dt * mix(0.45, 0.38, S.purr);
    sound.enabled = opts.sound;
    sound.purr(S.purr, S.breath);
    if (S.purr > 0.7 && t > S.nextHeart) { S.nextHeart = t + 1.4; heart(t, 0.16); }
    if (S.purr > 0.02) S.busyUntil = Math.max(S.busyUntil, t + 0.5);

    // Slow blink back when you slow-blink at it (double-click its head).
    if (S.blinkAskAt && t > S.blinkAskAt) {
      S.blinkAskAt = 0;
      if (Math.random() < clamp(TUNING.blinkBack / 100 + 0.08 * (level - 1), 0, 0.98) && !sulking) {
        S.act = { kind: 'slowBlink', t0: t, dur: 1.8, side: 1 };
        heart(t);
        life.add('blinks');
        life.addBond(2);
      } else {
        S.act = { kind: 'look', t0: t, dur: 2.2, side: Math.random() < 0.5 ? -1 : 1 };
      }
    }

    // Idle fidgets, only when nothing else is going on.
    const idleFor = t - S.lastInput;
    const friendNear = S.friend && Math.abs(S.friend.x - hs.x) < 520 && Math.abs(S.friend.y - hs.y) < 300;
    if (S.act && t > S.act.t0 + S.act.dur) S.act = null;
    if (!S.act && !sc && !S.lying && !dizzy && t > S.nextAct && idleFor > 2.5 && !S.asleep && !pet && !S.cross && !curiousNow && !quiet && !S.nag && !sulking) {
      S.nextAct = t + 4 + Math.random() * 5;
      const r = Math.random();
      if (opts.cup && !S.cupFall && !S.cupBackAt && idleFor > 20 && t > S.nextPush && r < 0.25 && opts.role !== 'keys') {
        startScene('push', t);
      } else if (friendNear && r >= 0.32 && r < 0.55) {
        if (Math.random() < 0.6) swatFriend(t);
        else { S.act = { kind: 'slowBlink', t0: t, dur: 1.6, side: 1 }; post({ friend: 'blink' }); }
      } else if (idleFor > 20 && t > S.nextYarn && r >= 0.55 && r < 0.80 && opts.role !== 'keys' && !mousing(t)) {
        startScene('yarn', t);
      } else {
        const kinds = ['tilt', 'tilt', 'ear', 'slowBlink', 'look', 'tail', 'groom'];
        if (idleFor > 40) kinds.push('yawn');
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        if (kind === 'yawn') S.yawnAt = t;
        else S.act = { kind, t0: t, dur: { tilt: 1.8, ear: 0.4, slowBlink: 1.4, look: 2.2, tail: 1, groom: 2.6 }[kind], side: Math.random() < 0.5 ? -1 : 1 };
      }
      S.busyUntil = Math.max(S.busyUntil, t + (S.act ? S.act.dur : 1) + 0.8);
    }
    // Only using the mouse for a long while, it comes looking for attention.
    if (!S.scene && !S.lying && !dizzy && TUNING.needyAfter > 0 && !quiet && !S.asleep && !S.nag && opts.role !== 'mouse' && t - S.lastMouse < 5
      && t - S.keysQuietSince > TUNING.needyAfter * 60 && t > S.nextNudge) {
      S.nextNudge = t + TUNING.needyAfter * 60;
      S.keysQuietSince = t;
      startScene('nudge', t);
    }
    sc = S.scene;
    const scAge = sc ? t - sc.t0 : 0;
    const scU = sc ? scAge / sc.dur : 0;
    const yarnPlaying = sc?.kind === 'yarn' && !S.lying;
    updateYarn(yarnPlaying ? sc : null, scAge, dt);
    const yarnNoticed = yarnPlaying && sc.noticedAt !== undefined;
    const noticeAge = yarnNoticed ? scAge - sc.noticedAt : 0;
    const yarnStartle = smooth(0, 0.10, noticeAge) * (1 - smooth(0.18, 0.47, noticeAge));
    const yarnExitAge = yarnNoticed && sc.yarnLeftAt !== undefined ? scAge - sc.yarnLeftAt : 0;
    const yarnSurprise = smooth(0, 0.10, noticeAge) * (1 - smooth(0, 0.36, yarnExitAge));
    const act = S.act, actU = act ? (t - act.t0) / act.dur : 0;
    // Smooth in, hold, smooth out over the fidget's duration.
    const actEnv = act && actU >= 0 ? smooth(0, 0.25, actU) * (1 - smooth(0.7, 1, actU)) : 0;
    const scEnv = sc ? smooth(0, 0.15, scU) * (1 - smooth(0.85, 1, scU)) : 0;
    const yarnInterest = yarnNoticed ? smooth(0, 0.34, noticeAge) * scEnv : 0;
    let yarnTilt = 0, yarnPeek = 0, yarnBlink = 0;
    if (yarnNoticed) {
      const [pull, bat] = sc.pats;
      const handoff = pull.at + pull.roll;
      // Tip an ear toward the incoming ball, then lean in as it settles between the paws.
      yarnTilt = smooth(0.06, 0.45, noticeAge) * (1 - smooth(pull.at - 0.50, pull.at - 0.05, scAge));
      yarnPeek = smooth(handoff - 0.32, handoff + 0.11, scAge) * (1 - smooth(bat.at - 0.33, bat.at + 0.10, scAge));
      // Blink once while the ball is still between the paws.
      const peekAge = scAge - handoff;
      yarnBlink = smooth(0.24, 0.33, peekAge) * (1 - smooth(0.40, 0.54, peekAge));
    }

    // Body: the haunches stay planted; the spine bends towards whatever the busy paw reaches for.
    const striking = Object.values(paws).find(p => p.key && (p.down || t - p.t0 < 0.3));
    let shift = 0, hunch = 0, squash = 0;
    const push = sc && sc.kind === 'push' ? beatOf(sc, t) : null;
    // Reaching for the cup counts from the lift until it has watched the cup go.
    const pushing = push && sc.raised && ['reach', 'hover', 'tap', 'check', 'shove', 'caught', 'watch'].includes(push.b.kind);
    if ((mousing(t) && !dizzy) || pushing) {
      // Reaching left for the mouse: chest over to the left, a little forward. The arm does most
      // of the reaching; leaning further would tip the collar and bib off the chest.
      shift = (paws.L.pos.x - cat.home.x + 0.3) * 0.45;
      hunch = 0.1;
      squash = 0.07;
    } else if (striking) {
      const arm = cat.arms[striking.side < 0 ? 0 : 1];
      shift = (keyboard.keyTop(striking.key, tmp2).x - cat.home.x - arm.shoulderLocal.x) * (striking.heavy ? 0.32 : 0.14);
      hunch = 0.16;
    }
    if (yarnNoticed) shift += 0.14 * yarnInterest * (1 - smooth(2.18, 2.9, scAge));
    hunch += 0.085 * yarnPeek;
    squash += 0.055 * yarnPeek - 0.035 * yarnStartle;
    // A burst of typing settles the cat into a rounder, lower loaf over the keys.
    if (t - S.lastKey < 1.2) { hunch = Math.max(hunch, 0.12 + 0.06 * busyness); squash = Math.max(squash, 0.09 + 0.04 * busyness); }
    hunch += 0.1 * S.sleep;
    squash += 0.08 * S.sleep;
    // Yawning it stretches up tall.
    squash -= 0.07 * yawnOpen;
    // Curled up asleep it sinks lower still.
    if (S.sleepPose === 'curl') squash += 0.06 * S.sleep;
    // Curious: leans in a little towards what it is watching, chest up rather than loafed.
    hunch += 0.06 * curious;
    squash -= 0.04 * curious;
    // Sitting about, it shifts its weight from time to time.
    if (t > S.nextLean) {
      S.nextLean = t + mix(5, 12, Math.random());
      S.lean = Math.random() < 0.3 ? 0 : mix(-0.07, 0.07, Math.random());
    }
    if (!sc && !S.lying && !mousing(t) && t - S.lastKey > 2) shift += S.lean;
    // Patting with the tail, the hips shift a touch towards it.
    shift += 0.06 * smooth(0, 1, tailTap.reach);
    // A cold winter cat sits fluffed up and low.
    const winter = opts.festival && life.winter() && opts.outfit !== 'none';
    if (winter) squash += 0.03;
    if (sc && sc.kind === 'stretch') { hunch += 0.3 * scEnv; squash += 0.12 * scEnv; }
    // 敲键盘: settled on the keys and left alone a while, it has a go at typing itself, both paws
    // pattering on the keys, eyes squeezed shut with glee. Your typing stops it.
    const hogging = !!(S.nag && S.lying && S.lying.landed && !S.lying.up && S.lieAt === 'board' && P.melt.x > 0.85);
    if (hogging && !S.play && t - S.lastUserKey > 6 && t - S.lying.landed > 8 && t > S.nextPlay) {
      S.play = { t0: t, dur: 2.6, next: t + 0.15, side: 'L', up: null };
      S.nextPlay = t + mix(14, 22, Math.random());
    }
    if (S.play) {
      const pl = S.play;
      if (pl.up && (t > pl.up.at || !hogging)) releasePlayKey(pl);
      if (!hogging || t - pl.t0 > pl.dur) { if (!pl.up) S.play = null; }
      else if (t >= pl.next && !pl.up) {
        const near = lieStage.paws[pl.side === 'L' ? 0 : 1];
        let k = null;
        for (let i = 0; i < 30 && !k; i++) {
          const c = keyboard.randomLetter();
          if (keyboard.keyTop(c, tmp3).distanceTo(near) < 0.32 && !c.down) k = c;
        }
        if (k) {
          // Its own keys do not count as you typing.
          const lastKey = S.lastKey;
          strike(k, pl.side, t);
          S.lastKey = lastKey;
          paws[pl.side].lift = 1.6;
          if (!opts.privacy) popup(k, t, pl.side === 'L' ? -1 : 1);
          pl.up = { k, side: pl.side, at: t + 0.09 };
        }
        pl.side = pl.side === 'L' ? 'R' : 'L';
        pl.next = t + mix(0.15, 0.24, Math.random());
      }
      S.busyUntil = Math.max(S.busyUntil, t + 0.5);
    }
    // Reaching out onto the keys it leans well forward.
    if (LS && !LS.up && LS.at === 'board' && t - LS.t0 < BOARD_FLOP + 0.3) hunch += 0.3 * smooth(0, 0.3, t - LS.t0);
    if (sideFlop) {
      // Shift the weight onto the cheek side before the hips follow the shoulders down.
      const lean = smooth(0, 0.18, lieAge) * (1 - smooth(CUDDLE_ROLL, LS.dizzy ? DIZZY_LOWER : CUDDLE_LOWER, lieAge));
      shift -= 0.13 * lean;
      squash += 0.07 * lean;
    }
    shift -= 0.22 * bodySway;
    // Locked onto the cup it sinks a little and leans in; watching it fall, it peers after it.
    P.hunt.step(push && ['notice', 'reach', 'hover', 'tap', 'shove'].includes(push.b.kind) ? 1 : 0, dt);
    const hunt = clamp(P.hunt.x, 0, 1);
    hunch += 0.06 * hunt;
    squash += 0.04 * hunt;
    if (push && push.b.kind === 'watch') { hunch += 0.16; shift -= 0.12; }
    const caught = push && push.b.kind === 'caught';
    const innocent = push && push.b.kind === 'innocent';
    if (S.purr > 0.6) squash += 0.015 * Math.sin(S.breath * Math.PI * 4);
    P.shift.step(shift, dt);
    P.hunch.step(hunch, dt);
    P.squash.step(squash, dt);
    P.flinch.step(0, dt);
    // Breathing slows as it falls asleep. The phase is summed frame by frame: `t` times a changing
    // rate would jump by `t` times the change, so the longer it had run the harder it shook.
    S.breathSit += dt * mix(2.1, 1.1, S.sleep);
    const breathe = Math.sin(S.breathSit) * mix(0.012, 0.02, S.sleep);
    cat.bend.x = P.shift.x;
    cat.bend.z = P.hunch.x;
    cat.bend.squash = P.squash.x - 0.1 * P.flinch.x;
    // Lying down: the spine itself lies down (chest first, then the hips), so the outline becomes
    // a lying cat's.
    const boardSide = LS?.at === 'board' && LS.calm && S.sleepPose === 'boardSide';
    const L = boardSide ? LIE.boardSide : LIE[S.lieAt];
    const melt = clamp(P.melt.x, 0, 1), doze = clamp(P.doze.x, 0, 1);
    const st = poseNow(L, melt, doze, !!S.lying?.calm);
    if (LS?.at === 'cuddle' && !LS.dizzy) spreadCuddlePaws(st, lieAge, lie);
    if (cuddleRestAge > 0 && melt > 0) swayCuddle(st, cuddleRestAge, melt);
    const tailProgress = (cuddleRestAge - 1.02) / 1.8;
    // Give the curl time to open while the tail sweeps toward the left flank.
    const tailLeft = smooth(-0.08, 0.25, tailProgress);
    // From center to the left flank, across to the right, then back to center.
    const tailTurn = tailLeft - 2 * smooth(0.25, 0.75, tailProgress) + smooth(0.75, 1, tailProgress);
    cat.lying.tailWag = L === LIE.cuddle ? (Math.PI / 2) * melt * tailTurn : null;
    cat.lying.tailBaseFollow = boardSide ? doze : 0;
    // Open the curl on the first swing and close it once the tip is back at center.
    cat.lying.tailExtend = L === LIE.cuddle ? melt * (tailLeft - smooth(1, 1.22, tailProgress)) : 0;
    cat.body.position.copy(cat.home);
    if (S.purr > 0.3 && LS?.at !== 'cuddle') cat.body.position.x += Math.sin(t * 150) * 0.003 * S.purr;
    cat.lying.amount = clamp(lie, 0, 1.08);
    // Cross while lying, the tail comes down off the back onto the desk beside the rump and
    // thumps there, so the slam lands where the tail actually hits.
    if (S.lieAt === 'board' && cross > 0.01 && lie > 0.05) {
      st.tail.forEach((q, i) => {
        const w = (i + 1) / st.tail.length;
        tmp3.copy(THUMP_LIE[i]);
        tmp3.y += S.thumpLift * 0.9 * w ** 1.4;
        tmp3.x -= S.thumpLift * 0.18 * w ** 2;
        q.lerp(tmp3, cross);
      });
    }
    shapeLying(st, L.lead, cat.body.position);
    // Lying, each breath lifts the back and the flank: slow and deep asleep.
    S.breathLie += dt * mix(3.2, 2.3, S.sleep);
    const lieBreath = Math.sin(S.breathLie) * mix(0.02, 0.035, S.sleep);
    for (const k of [0, 1]) { cat.lying.kF[k] *= 1 + lieBreath; cat.lying.kS[k] *= 1 + lieBreath * 0.4; }
    // A slight sideways lean of the whole body sells the weight shift; most of it is in the
    // spine. No twist about the vertical: the round body would not show it, but the bib, collar
    // and stripes would slide round to the side.
    const up = 1 - clamp(lie, 0, 1);
    const recoil = P.impactRoll.step(0, dt);
    cat.body.rotation.set(0.05 * S.sleep * up, 0, (recoil - P.shift.x * 0.06 + 0.15 * bodySway) * up);
    cat.body.scale.set(1 + breathe * 0.4 * up, 1 + breathe * up, 1 + breathe * 0.4 * up);
    cat.bendBody();
    const headFollowsNeck = S.lieAt === 'cuddle';
    cat.placeHead(headFollowsNeck);
    // At the keyboard, keys go down under its paws and its chin.
    const atKeys = S.lying && S.lieAt === 'board';
    const weights = atKeys ? [paws.L, paws.R].filter(p => p.pos.y < 0.32 && !p.key).map(p => p.pos) : [];
    if (atKeys && lie > 0.6) for (const [c, dx] of chinAt.map((c, i) => [c, (i - 1) * 0.13])) weights.push(c.set(st.head.x + dx, 0, st.head.z - 0.08));
    keyboard.weigh(0, 0, weights);

    // Keep the latest key in focus while the pointer stays still, so slow typing does not
    // swing the head back to the pointer between keystrokes.
    const headScreen = hs;
    let focus = null;
    let focusedKey = null;
    const typing = Object.values(paws).find(p => p.key && p.down && p.t0 > S.lastUserKey);
    const keyGaze = S.keyGaze;
    const watchedKey = keyGaze && t - keyGaze.at < 5
      && (t < keyGaze.until || keyGaze.at >= S.cursorSeen) ? keyGaze.key : null;
    // 盯着键盘: down on its elbows at the keyboard, it watches the keys.
    const staring = !!(S.lying && !S.lying.up && S.lieAt === 'board' && !S.lying.calm && melt < 0.5);
    if (yarnNoticed) focus = screen(yarn.group.position, V());
    else if (watchedKey) focusedKey = watchedKey;
    else if (staring) focus = screen(tmp2.set(0.1, 0.24, 1.05), V());
    else if (push && ['notice', 'reach', 'hover', 'tap', 'shove'].includes(push.b.kind)) focus = screen(cup.group.position, V());
    else if (push && push.b.kind === 'watch') focus = screen(S.cupFall ? cup.group.position : tmp2.copy(cup.group.position).setY(-0.6), V());
    else if (typing && t - S.lastKey < 0.6) focusedKey = typing.key;
    else if (tailTap.key && tailTap.t0 > S.lastUserKey && t - tailTap.t0 < 0.6) focus = screen(tailTap.tip, V());
    else if (S.friend && friendNear && t - S.cursorSeen > 4 && !S.nag) focus = V(S.friend.x, S.friend.y, 0);
    else if (S.cursor) focus = V(S.cursor.x, S.cursor.y, 0);
    const keyTarget = focusedKey ? keyboard.keyTop(focusedKey, V()) : null;
    if (keyTarget) focus = screen(keyTarget, V());
    // Looking at you: straight out of the screen.
    const atYou = (push && ['check', 'caught', 'innocent'].includes(push.b.kind)) || (sc && sc.kind === 'nudge' && t - sc.t0 > 0.7)
      || (S.nag && t - S.lastKey > 0.6 && !staring) || stopping(t);
    if (atYou || dizzy) focus = null;
    const watchingKey = !!(focus && keyTarget);
    const trackingObject = !!focus && (watchingKey || yarnNoticed);
    let lx = 0, ly = 0;
    if (focus) {
      lx = clamp((focus.x - headScreen.x) / 260, -1, 1);
      ly = clamp((focus.y - headScreen.y) / 220, -1, 1);
    }
    if (act && act.kind === 'look') { lx = mix(lx, act.side * 0.8, actEnv); ly = mix(ly, -0.3, actEnv); }
    if (pet || S.sleep > 0.5) { lx *= 0.2; ly *= 0.2; }
    P.gazeX.step(lx, dt);
    P.gazeY.step(ly, dt);

    const shake = t - S.wakeAt < 0.6 ? Math.sin((t - S.wakeAt) * 34) * 0.22 * (1 - (t - S.wakeAt) / 0.6) : 0;
    const rubbing = pet || S.rubCursor;
    S.rub += ((rubbing ? 1 : 0) - S.rub) * approach(8, dt);
    const rubWave = Math.sin(t * 7.5) * 0.09 * S.rub;
    const petSide = clamp(S.rubCursor ? (S.cursor.x - hs.x) / 90 : S.petX, -1, 1);
    // The head follows the gaze, a beat behind. At rest the face tips up towards the viewer, who
    // looks down on the desk; reaching, the cat ducks its head to watch the paw.
    // Cross, it turns its face away from the pointer in a huff and lowers its head a little.
    // Sulking looks much the same without the temper.
    const huffing = Math.max(cross, sulking ? 0.8 : 0);
    const huff = huffing * (lx >= 0 ? -1 : 1) * 0.32;
    // Curious, it turns its whole face to follow the pointer, not just its eyes.
    const follow = mix(0.3, 0.5, Math.max(curious, yarnInterest));
    let yaw = lx * follow;
    if (watchingKey && !pet && S.sleep <= 0.5) {
      const neck = cat.headPivot.getWorldPosition(tmp2);
      // Keep the face near center so the pupils can lead from key to key.
      const keyYaw = Math.atan2(1.8 * (keyTarget.x - neck.x), keyTarget.z - neck.z) * 0.86;
      yaw = 0.38 * clamp(keyYaw, -0.57, 0.57);
    }
    // Washing, it turns and tips its head down onto the paw.
    const licking = act && act.kind === 'groom' ? actEnv : 0;
    P.yaw.step(mix(yaw, huff, huffing) + petSide * 0.18 * S.rub + 0.14 * licking, dt);
    let nod = 0;
    if (act && act.kind === 'nod') nod = Math.sin(clamp(actU, 0, 1) * Math.PI * 2) * 0.22;
    if (sc && sc.kind === 'stretch') nod -= 0.12 * scEnv;
    nod += 0.09 * yarnInterest + 0.115 * yarnPeek;
    if (licking) nod += (0.16 + 0.1 * lick(t)) * licking;
    cat.setLick(smooth(0.4, 0.8, licking) * smooth(0.3, 0.9, lick(t)));
    P.pitch.step(ly * mix(0.12, 0.22, curious) * (1 - huffing) - 0.28 + 0.5 * P.hunch.x + (mousing(t) ? 0.06 : 0) + 0.5 * S.sleep + 0.08 * cross
      - 0.5 * yawnOpen + nod, dt);
    // Curious head tilt: towards a key being watched, or a fidget, or a pointer resting nearby.
    let roll2 = 0;
    if (striking) roll2 = clamp(P.shift.x * (striking.heavy ? 1.2 : 0.5), -0.18, 0.18);
    if (act && (act.kind === 'tilt' || act.kind === 'oops')) roll2 += act.side * 0.26 * actEnv;
    if (!watchingKey && S.cursor && !striking && !mousing(t) && t - S.cursorSeen > 1.2 && Math.abs(lx) < 0.5 && Math.abs(ly) < 0.6) roll2 += 0.12 * Math.sign(lx || 1);
    // All innocence after the cup has gone: head cocked, looking at you.
    if (innocent) roll2 += 0.16;
    roll2 -= 0.13 * yarnTilt;
    // The classic curious head cock, towards the side the pointer is on.
    roll2 += 0.2 * curious * (lx >= 0 ? -1 : 1);
    // Curled up, it rests its head over to one side.
    if (S.sleepPose === 'curl') roll2 += 0.35 * S.sleep;
    P.roll.step(roll2 - petSide * 0.12 * S.rub + 0.08 * S.sleep - 0.14 * licking, dt);
    // On the keys, rest the chin or cheek at the pose's head target. During a roll the head
    // already rides the neck, with small local movements layered on top.
    const lw = cat.lieAt(cat.NECK_S);
    if (!headFollowsNeck) {
      headLie.setFromEuler(headLieEuler.set(st.pitch, 0, st.roll));
      if (lw > 0) cat.headPivot.position.lerp(tmp.copy(cat.head.position).applyQuaternion(headLie).negate().add(st.head).sub(cat.body.position), lw);
      cat.headPivot.quaternion.identity().slerp(headLie, lw);
    }
    const headMotion = headFollowsNeck ? mix(1, 0.1, lw) : 1;
    // After touching down, tuck the chin and tip the cheek with a slight lag behind the roll.
    const nuzzle = melt * smooth(0, 0.42, cuddleRestAge);
    const nuzzleBeat = cuddleRestAge * CUDDLE_SWAY_RATE;
    const chinTuck = 0.068 * nuzzle * (0.5 + 0.5 * Math.sin(nuzzleBeat - 0.65));
    headEuler.set(P.pitch.x * (headFollowsNeck ? headMotion : mix(1, 0.3, lw)) + chinTuck,
      (P.yaw.x + shake) * headMotion + 0.09 * nuzzle * Math.sin(nuzzleBeat),
      (-P.yaw.x * 0.2 + rubWave) * headMotion);
    cat.headPivot.quaternion.multiply(headTurn.setFromEuler(headEuler));
    const dizzyTilt = 0.18 * headWobble + 0.05 * bodySway * up + 0.06 * dizzyIntensity * lw * Math.sin(dizzyAge * 4.8);
    cat.head.rotation.z = P.roll.x * headMotion - cat.body.rotation.z + 0.12 * nuzzle * Math.sin(nuzzleBeat - 0.6) + dizzyTilt;
    cat.headPivot.position.x += rubWave * 0.4 * headMotion;
    cat.placeCollar();
    if (cat.outfit.kind === 'cny') cat.swingScarf(Math.sin(t * 2.3) * 0.02 + P.shift.x * 0.2);

    // Ears perk up when excited, stand up and swivel forward when curious, flatten back when
    // rubbed, go out sideways ("airplane ears") when cross; a fidget flicks one of them.
    const earsBack = (act && act.kind === 'oops' ? 0.3 * actEnv : 0) + 0.4 * P.flinch.x + 0.25 * yawnOpen
      + (caught ? 0.28 : 0);
    P.ears.step(0.1 * S.excite * (1 - cross) + 0.12 * Math.max(curious, hunt) - 0.22 * S.rub - 0.55 * cross - earsBack, dt);
    // Now and then one ear flicks at some sound only it can hear, asleep too.
    if (t > S.nextTwitch) {
      S.nextTwitch = t + mix(3, 9, Math.random()) * (S.asleep ? 1.6 : 1);
      if (!cross && !cuddling) {
        S.twitch = { side: Math.random() < 0.5 ? -1 : 1, t0: t, size: mix(0.14, 0.26, Math.random()) };
        S.busyUntil = Math.max(S.busyUntil, t + 0.5);
      }
    }
    // Asleep and melted, now and then a front paw (0, 1) or a hind foot (2, 3) twitches in a dream.
    if (S.asleep && S.lying && S.lying.landed && melt > 0.8 && t > S.nextDream) {
      S.nextDream = t + mix(6, 14, Math.random());
      S.dream = { part: Math.floor(Math.random() * 4), t0: t };
    }
    const tw = S.twitch, twU = tw ? (t - tw.t0) / 0.3 : 1;
    if (twU >= 1) S.twitch = null;
    for (const e of cat.ears) {
      let flick = act && act.kind === 'ear' && e.s === act.side ? Math.sin(actU * Math.PI * 3) * 0.3 * (1 - actU) : 0;
      if (tw && twU >= 0 && twU < 1 && e.s === tw.side) flick += Math.sin(twU * Math.PI * 2) * tw.size * (1 - twU);
      cat.turnEar(e, -e.s * (e.tilt - P.ears.x) + flick, -0.12 - 0.35 * cross + 0.12 * curious);
    }

    // Eyes: pupils lead; blink, slow-blink when relaxed, squint when petted, close when asleep.
    // A curious cat stares: no blinking while it watches.
    // Sometimes a double blink.
    if (t > S.nextBlink + 0.15) S.nextBlink = t + (Math.random() < 0.2 ? 0.12 : 2.5 + Math.random() * 4);
    if ((curiousNow || hunt > 0.5 || caught || yarnNoticed) && t > S.nextBlink - 0.2) S.nextBlink = t + 0.5;
    let blink = t > S.nextBlink ? Math.sin(clamp((t - S.nextBlink) / 0.15, 0, 1) * Math.PI) : 0;
    if (act && act.kind === 'slowBlink' && actU >= 0) blink = Math.max(blink, 0.85 * Math.sin(clamp(actU, 0, 1) * Math.PI));
    const closed = (pet && !S.cross) || S.sleep > 0.5 || yawnOpen > 0.45
      || (S.purr > 0.5 && LS?.at !== 'cuddle') || !!(act && act.kind === 'groom' && actEnv > 0.5);
    // Keep the eyes shut through the cuddle, then open them as the body rolls back up.
    const cuddleOpen = cuddleRise ? smooth(0.95, 0.42, melt) : 1;
    const yarnEyesClosed = yarnBlink >= 0.99;
    const dizzyEyes = dizzy && LS?.dizzy && LS.landed && !LS.up;
    const dizzyEyeOpen = dizzyEyes ? smooth(0, 0.22, t - LS.landed) : 0;
    const eyesClosed = dizzy ? dizzyAge >= DIZZY_FALL_AT
      : yarnEyesClosed || cuddling || (cuddleRise ? cuddleOpen < 0.12 : closed);
    const pupilOrbit = smooth(0, 0.19, dizzyAge) * (1 - dizzyClosing);
    const pupilAngle = dizzyAge * 7.5;
    // Sulking lowers the lids. Nighttime sleepiness is shown by yawns.
    const lid = mix(sulking ? 0.6 : 1, 1, yarnSurprise);
    // Excited and curious cats' pupils go wide and round (curious most of all, up to the size set
    // in the 调节 window); cross ones narrow to slits under heavy lids. The pupil never grows past
    // the iris, so it stays a black disc inside a coloured ring.
    // Holding the keyboard it looks up at you round-eyed, as on the sticker.
    const dilate = Math.min(2.6, mix(1 + 0.25 * S.excite, TUNING.pupilSize / 100, Math.max(curious, 0.7 * hunt, caught || innocent ? 0.8 : 0,
      S.nag && S.lying ? 0.85 : 0)) * (1 - 0.5 * cross));
    const pupilDilation = mix(dilate, Math.max(dilate, 2.2), yarnSurprise);
    // Squeezed shut with glee (^ ^) having a go at the keys; just the one eye for the wink as it
    // holds a paw up at you.
    const glee = !!S.play;
    const winkEye = stopping(t) ? 1 : 0;
    const yarnExpression = 0.18 * yarnSurprise;
    for (const e of cat.eyes) {
      const happy = !eyesClosed && (glee || e.s === winkEye), shut = eyesClosed || happy;
      // Yawning wide, the eyes squeeze shut into arches.
      cat.setLid(e, happy || yawnOpen > 0.45 ? -1 : 1);
      e.iris.visible = e.pupil.visible = e.shine.visible = !shut && !dizzyEyes;
      e.arc.visible = shut && !dizzyEyes;
      e.spiral.visible = !!dizzyEyes;
      if (dizzyEyes) e.spiral.rotation.z = -2.5 * (t - LS.landed);
      const opening = cuddling || cuddleRise ? (shut ? 1 : cuddleOpen)
        : yarnEyesClosed ? 1 : 1 - Math.max(0.9 * blink, yarnBlink);
      e.group.scale.y = opening * (1 - 0.42 * cross) * (1 + 0.1 * curious + yarnExpression + 0.15 * P.flinch.x + (caught ? 0.12 : innocent ? 0.07 : 0)) * (shut ? 1 : lid);
      e.group.scale.x = 1 + 0.06 * curious + 0.055 * yarnSurprise;
      if (dizzyEyes) e.group.scale.y = mix(0.15, 1, dizzyEyeOpen);
      else if (dizzy) e.group.scale.y = shut ? mix(0.12, 1, smooth(DIZZY_FALL_AT, DIZZY_FALL_AT + 0.25, dizzyAge))
        : mix(1, 0.12, dizzyClosing);
      // As the pupil widens, the slit's height shrinks a touch so it reads round.
      e.pupil.scale.x += (mix(0.044 * pupilDilation, 0.051, pupilOrbit) - e.pupil.scale.x) * approach(10, dt);
      e.pupil.scale.y += (mix(0.11 - 0.012 * Math.max(0, pupilDilation - 1.5), 0.068, pupilOrbit) - e.pupil.scale.y) * approach(10, dt);
      // A slight inward, downward resting gaze gives the reference's soft cross-eyed look. The
      // pupil may only travel as far as keeps it inside the iris, so a wide one sits near the
      // centre; the limit applies to where it is now, not only where it is heading.
      const room = Math.max(0, e.iris.scale.x - e.pupil.scale.x - 0.012);
      let x, y;
      if (trackingObject && !shut) {
        ({ x, y } = aimPupil(e, focus, room, watchingKey ? 1.8 : 1));
      } else {
        let px = P.gazeX.x, py = P.gazeY.x;
        if (focus) {
          const es = screen(e.group.getWorldPosition(tmp2), V());
          px = clamp((focus.x - es.x) / 170, -1, 1);
          py = clamp((focus.y - es.y) / 170, -1, 1);
        }
        x = px * 0.07 - e.s * 0.012;
        y = -py * 0.02;
      }
      x = mix(x, Math.cos(pupilAngle) * Math.min(room * 0.8, 0.074), pupilOrbit);
      y = mix(y, Math.sin(pupilAngle) * Math.min(Math.max(0, e.iris.scale.y - e.pupil.scale.y - 0.012) * 0.8, 0.05), pupilOrbit);
      const response = approach(watchingKey ? 46 : trackingObject ? 34 : 22, dt);
      e.pupil.position.x += (clamp(x, -room, room) - e.pupil.position.x) * response;
      e.pupil.position.x = clamp(e.pupil.position.x, -room, room);
      e.pupil.position.y += (y - e.pupil.position.y) * response;
    }
    // Rubbing flushes the cheeks; the "blush" look keeps a faint flush all the time, and so do
    // the pale coats, a little.
    cat.blushMat.opacity = Math.max(0.55 * S.rub, cat.look.blush ? 0.4 : cat.coat.cheek, glee ? 0.8 : 0) * (1 - cross);

    // The tail sways faster when the cat is worked up and twitches as irritation builds; a fidget
    // gives it a flick.
    // Curious, the tail goes still apart from a quick twitch at the tip.
    S.tailPhase += dt * (1 + 1.4 * S.excite + 2.5 * S.annoy + 3 * Math.max(curious, hunt));
    const flickTail = act && act.kind === 'tail' ? Math.sin(actU * Math.PI) * 2 : 0;
    // Cross: bursts of three thumps (lift slowly, slam down hard, rest a beat), then a pause.
    let lift = 0, lash = 0;
    if (cross > 0.05) {
      const prev = S.thumpPhase;
      S.thumpPhase += dt * TUNING.thumpRate;
      const beat = Math.floor(S.thumpPhase), u = S.thumpPhase - beat, resting = beat % 4 === 3;
      if (!resting) lift = u < 0.6 ? smooth(0, 0.6, u) : u < 0.72 ? 1 - ((u - 0.6) / 0.12) ** 2 : 0;
      lash = Math.sin(S.thumpPhase * Math.PI * 0.5) * 0.6;
      const slamAt = beat + 0.72;
      if (!resting && S.cross && prev < slamAt && S.thumpPhase >= slamAt) slam(t);
    }
    S.thumpLift += (lift - S.thumpLift) * approach(40, dt);
    // The tip touches the right half of the space bar; the tail is about 0.075 thick there.
    if (tailTap.key) keyboard.keyTop(tailTap.key, tailTap.tip).add(V(0.36, 0.075 + tailTap.hover, -0.02));
    const reach = smooth(0, 1, tailTap.reach);
    // In winter, sitting still, the tail wraps round the paws to keep them warm.
    const wrap = winter && t - S.lastKey > 3 && !mousing(t) ? 0.4 : 0;
    cat.updateTail(S.tailPhase, (1 - S.sleep) * (1 + 0.6 * S.excite + flickTail + 1.5 * S.annoy) * (1 - cross) * (1 - 0.55 * Math.max(curious, hunt)) * (1 - reach), S.sleep,
      cross * (1 - reach) * (1 - lie), S.thumpLift, lash, reach * (1 - lie), tailTap.tip, clamp(P.tailLie.x, 0, 1), wrap * (1 - lie), dt);

    // Asleep a hind paw may twitch in a dream too.
    cat.kickHind([0, 1].map(i => {
      const d = S.dream, du = d && d.part === 2 + i ? (t - d.t0) / 0.8 : 1;
      const twitch = du < 1 ? Math.sin(du * 24) * (1 - du) * 0.05 : 0;
      return V(twitch, 0, twitch * 0.5);
    }), LS?.at === 'cuddle', hindClench);

    // The desk hops when the tail lands; the anger mark pulses on each thump.
    P.desk.step(0, dt);
    keyboard.group.position.y = 0.02 + P.desk.x;
    mouseProp.group.position.y += P.desk.x * 1.4;
    angerMark.visible = cross > 0.1 || P.flinch.x > 0.3;
    if (angerMark.visible) {
      cat.headPivot.updateMatrixWorld();
      angerMark.position.set(-0.42, 0.85, 0.2).applyMatrix4(cat.headPivot.matrixWorld);
      const pulse = 1 + 0.25 * Math.max(0, 1 - (t - S.lastSlam) / 0.25);
      const show = Math.max(cross, P.flinch.x);
      angerMark.scale.setScalar(0.27 * show * pulse);
      angerMark.material.opacity = show;
    }
    if (dizzyIntensity > 0) cat.head.getWorldPosition(tmp3);
    dizzyStars.forEach((star, i) => {
      star.visible = dizzyIntensity > 0;
      if (!star.visible) return;
      const angle = dizzyAge * 5 + i * Math.PI * 2 / dizzyStars.length;
      const depth = Math.sin(angle);
      star.position.copy(tmp3).addScaledVector(camera.up, 0.52 + 0.26 * dizzyEyeOpen + 0.15 * depth);
      star.position.x += 0.42 * Math.cos(angle);
      star.position.z += 0.14 * depth;
      star.scale.setScalar(0.18 + 0.035 * depth);
      star.material.rotation = angle * 0.4;
      star.material.opacity = dizzyIntensity * (0.8 + 0.2 * depth);
    });
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i], age = t - fx.t0, u = age / fx.life;
      if (u >= 1) { scene.remove(fx.sprite); effects.splice(i, 1); continue; }
      fx.sprite.position.copy(fx.from).addScaledVector(fx.vel, age);
      const pop = fx.kind === 'bang' ? 0.5 + 0.7 * smooth(0, 0.3, u) : fx.kind === 'dust' ? 0.6 + 0.9 * u : 0.6 + 0.4 * smooth(0, 0.15, u);
      const s = fx.size * pop;
      fx.sprite.scale.set(s, s, 1);
      fx.sprite.material.opacity = fx.kind === 'bang' ? 1 - smooth(0.5, 1, u) : fx.kind === 'dust' ? 0.9 * (1 - u) : 1 - smooth(0.6, 1, u);
    }
    for (const arm of cat.arms) {
      const p = arm.s < 0 ? paws.L : paws.R;
      cat.updateArm(arm, p.pos, p.limp, p.elbow, p.aim, frontClench, p.keyPose);
    }

    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i], age = t - p.t0;
      if (!p.key.down && p.upAt === null) p.upAt = t;
      const fade = p.upAt === null ? 1 : clamp(1 - (t - p.upAt - 0.35) / 0.3, 0, 1);
      const pop = 0.6 + 0.4 * Math.min(1, age / 0.12);
      const h = 0.27 * pop;
      p.sprite.scale.set(h * p.sprite.userData.aspect, h, 1);
      p.sprite.position.copy(p.sprite.userData.base).add(V(0, 0.22 + 0.14 * smooth(0, 0.25, age), 0));
      p.sprite.material.opacity = fade;
      if (fade <= 0) { scene.remove(p.sprite); popups.splice(i, 1); }
    }

    // The copied card floats up over the head and waits there; pasting drops it onto the key.
    if (S.clip) {
      const c = S.clip, age = t - c.t0;
      cat.head.getWorldPosition(tmp3).add(V(0.62, 0.42, 0.1));
      if (c.pasteAt < 0) {
        c.sprite.position.lerpVectors(c.from, tmp3, smooth(0, 0.5, age));
        c.sprite.position.y += Math.sin(t * 2.5) * 0.02 * smooth(0.5, 0.8, age);
        c.sprite.scale.setScalar(0.24 * smooth(0, 0.15, age));
        c.sprite.material.opacity = 1 - smooth(12, 13, age);
        if (age > 13) { scene.remove(c.sprite); S.clip = null; }
      } else {
        const u = (t - c.pasteAt) / 0.35;
        c.sprite.position.lerpVectors(c.from, c.to, smooth(0, 1, u));
        c.sprite.position.y += Math.sin(clamp(u, 0, 1) * Math.PI) * 0.2;
        c.sprite.material.opacity = 1 - smooth(0.9, 1.4, u);
        if (u > 1 && !c.landed) { c.landed = true; effect('check', c.to.clone().add(V(0, 0.2, 0)), 0.6, 0.14, V(0, 0.25, 0), 44); }
        if (u > 1.4) { scene.remove(c.sprite); S.clip = null; }
      }
      S.busyUntil = Math.max(S.busyUntil, t + 0.5);
    }

    if (bubble) {
      const age = t - bubble.t0;
      cat.head.getWorldPosition(bubble.sprite.position).add(V(0.66, 0.6, 0.2));
      const h = 0.36 * (0.7 + 0.3 * smooth(0, 0.15, age));
      bubble.sprite.scale.set(h * bubble.aspect, h, 1);
      // Keep it inside the window: a long line shifts left.
      screen(bubble.sprite.position, tmp2);
      const over = tmp2.x + h * bubble.aspect * 0.5 * 95 - window.innerWidth + 6;
      if (over > 0) bubble.sprite.position.x -= over / 95;
      bubble.sprite.material.opacity = 1 - smooth(bubble.dur - 0.3, bubble.dur, age);
      if (age > bubble.dur) { scene.remove(bubble.sprite); bubble = null; }
      else S.busyUntil = Math.max(S.busyUntil, t + 0.3);
    }

    if (S.sleep > 0.7 && t > S.nextZ) {
      S.nextZ = t + 1.3;
      const { tex } = K.labelTexture('Z', 'z');
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sprite.renderOrder = 40;
      cat.head.getWorldPosition(sprite.position).add(V(0.45, 0.55, 0));
      sprite.userData.base = sprite.position.clone();
      scene.add(sprite);
      zs.push({ sprite, t0: t });
    }
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i], age = t - z.t0;
      const s = 0.16 + age * 0.08;
      z.sprite.scale.set(s, s, 1);
      z.sprite.position.copy(z.sprite.userData.base).add(V(Math.sin(age * 2.2) * 0.08 + age * 0.12, age * 0.32, 0));
      z.sprite.material.opacity = clamp(Math.min(age / 0.3, (2.6 - age) / 0.6), 0, 1);
      if (age > 2.6) { scene.remove(z.sprite); zs.splice(i, 1); }
    }

    if (pet || dizzy || popups.length || zs.length || effects.length || cross > 0.02 || S.sleep > 0.02 && S.sleep < 0.98 || t - S.wakeAt < 0.7 || S.scene) {
      S.busyUntil = Math.max(S.busyUntil, t + 0.5);
    }
    if (opts.persist) life.tick();
  }

  function heart(t, size = 0.2) {
    cat.head.getWorldPosition(tmp3);
    effect('heart', tmp3.clone().add(V((Math.random() - 0.5) * 0.4, 0.62, 0.15)), 1.3, size, V(0.05, 0.35, 0), 44);
  }

  function endNag(how, t) {
    S.nag = null;
    if (how === 'rested') {
      life.add('breaks');
      heart(t);
      S.workStart = Date.now();
    } else {
      // Snoozed (petted) or given up on: it asks again in ten minutes.
      S.workStart = Date.now() - Math.max(0, TUNING.breakAfter - 10) * 60e3;
      say(how === 'snooze' ? '那再给你 10 分钟' : '哼，随你吧', 2.6);
    }
  }

  // Raycast the pointer: 'pet' over head/ears, 'drag' over the rest, 'none' elsewhere.
  const dragMeshes = [...cat.dragMeshes, ...keyboard.hitMeshes, ...mouseProp.hitMeshes];
  function hitTest(x, y) {
    ndc.set(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObjects(cat.petMeshes, false).length) return 'pet';
    if (ray.intersectObjects(dragMeshes.filter(m => m.parent && visibleTree(m)), false).length) return 'drag';
    return 'none';
  }
  function visibleTree(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }

  // 拍一张: records a few seconds of what is drawn into an animated GIF on a cream background.
  const REC_FPS = 15;
  function capture(t) {
    const r = S.rec;
    if (t - r.last < 1 / REC_FPS - 0.004) return;
    r.last = t;
    r.ctx.fillStyle = '#f6efe0';
    r.ctx.fillRect(0, 0, r.w, r.h);
    r.ctx.drawImage(renderer.domElement, 0, 0, r.w, r.h);
    r.frames.push(r.ctx.getImageData(0, 0, r.w, r.h).data);
    if (t >= r.until) {
      S.rec = null;
      setTimeout(() => {
        const bytes = K.gif.encode(r.frames, r.w, r.h, Math.round(100 / REC_FPS));
        saveFile(`KeyCat-${stamp()}.gif`, bytes, 'image/gif');
        say('咔嚓！', 1.6);
      }, 0);
    }
  }

  const stamp = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };

  // Hands a file to the app to save (it goes in Pictures/KeyCat); in a plain browser, downloads it.
  function saveFile(name, bytes, type) {
    if (window.webkit?.messageHandlers?.cat) {
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      post({ saveFile: { name, base64: btoa(bin) } });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type }));
      a.download = name;
      a.click();
    }
  }

  let last = now(), frame = 0;
  function loop() {
    requestAnimationFrame(loop);
    S.ticks = (S.ticks || 0) + 1;
    if (frozen !== null) return;
    const t = now();
    const dt = Math.min(0.1, t - last);
    const busy = t < S.busyUntil || S.rec;
    // When nothing is happening, draw ~20 fps: enough for breathing and eye tracking.
    if (!busy && ++frame % 3 !== 0) return;
    last = t;
    update(t, dt);
    renderer.render(scene, camera);
    if (S.rec) capture(t);
    if (S.cursor) {
      const hit = hitTest(S.cursor.x, S.cursor.y);
      if (hit !== S.hit) {
        S.hit = hit;
        post({ hit });
      }
    }
  }

  // Runs a test from the 调节 window, or a check in dev.
  const TESTS = {
    annoy: () => window.cat.annoyNow(),
    curious: () => window.cat.curiousNow(3),
    push: t => {
      wake(t); S.cupFall = null; S.cupBackAt = 0; S.cupV = 0; cup.group.position.copy(cup.home); cup.group.rotation.set(0, 0, 0); opts.cup = true;
      startScene('push', t);
    },
    yarn: t => { wake(t); S.cuddleUntil = 0; S.petUntil = 0; startScene('yarn', t); },
    board: t => { S.lieAt = P.lie.x < 0.05 ? 'board' : S.lieAt; window.cat.sleepNow(); S.sleepPose = 'board'; },
    yawn: t => { S.yawnAt = t; },
    nag: t => { wake(t); S.workStart = Date.now() - TUNING.breakAfter * 60e3 - 1000; S.lastInputWall = Date.now(); },
    nudge: t => { wake(t); startScene('nudge', t); },
    knead: t => { wake(t); window.cat.pet(true, 180); S.petStart = t - TUNING.purrAfter - 1; setTimeout(() => window.cat.pet(false, 0, false), 5000); },
  };

  window.cat = {
    key(code, down) { key(code, down); },
    mouseMove(dx, dy) {
      const t = now();
      if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
      S.lastMouse = t;
      S.moves.push([t, dx, dy, Math.hypot(dx, dy)]);
      mouseProp.kick.x = clamp(mouseProp.kick.x + dx * 0.004, -0.16, 0.16);
      mouseProp.kick.z = clamp(mouseProp.kick.z + dy * 0.004, -0.12, 0.12);
      noteInput('mouse');
      wake(t);
    },
    mouseButton(down) {
      const t = now();
      if (!down && S.mouseDown) S.moves.length = 0;
      S.mouseDown = down && opts.role !== 'keys';
      S.lastMouse = t;
      if (S.mouseDown) mouseProp.click();
      if (down) {
        noteInput('mouse');
        S.dizzyAt = null;
        if (!S.petting) S.cuddleUntil = 0;
      }
      wake(t);
    },
    // Canvas CSS pixels; may lie outside the canvas so the eyes keep following the pointer.
    cursor(x, y) {
      if (!S.cursor || Math.abs(S.cursor.x - x) + Math.abs(S.cursor.y - y) > 3) S.cursorSeen = now();
      S.cursor = { x, y };
      S.busyUntil = Math.max(S.busyUntil, now() + 0.6);
    },
    // Called again while held as the pointer moves (the download page does), so only a fresh
    // press counts as one.
    pet(down, x, allowCuddle = true) {
      const t = now();
      const pressed = down && !S.petting;
      const released = !down && S.petting;
      const held = t - S.petStart;
      S.petting = down;
      S.petStart = down ? (S.petStart < 0 ? t : S.petStart) : -1;
      if (!down) {
        if (allowCuddle && released && held >= CUDDLE_HOLD && !S.asleep && !S.cross && !S.nag &&
          t >= S.sulkUntil && t >= S.cuddleUntil && S.lying?.at !== 'cuddle') {
          S.cuddleUntil = t + CUDDLE_TIME;
          wake(t);
        }
        return;
      }
      S.petUntil = t + 0.9;
      const hs = screen(cat.head.getWorldPosition(tmp2), V());
      S.petX = (x - hs.x) / 120;
      if (!pressed) { wake(t); return; }
      S.dizzyAt = null;
      life.add('pets');
      noteInput('pet');
      // Two quick presses on the head are a slow blink at it; it may blink back.
      if (t - S.lastPetDown < 0.45) S.blinkAskAt = t + 1.0;
      S.lastPetDown = t;
      if (S.nag) endNag('snooze', t);
      wake(t);
    },
    options(o) {
      const wasPomo = opts.pomodoro;
      Object.assign(opts, o);
      // `tune` holds only the settings that differ from the defaults, so start from those.
      if (o.tune) {
        for (const g of TUNING_SCHEMA) for (const it of g.items) TUNING[it.key] = it.key in o.tune ? o.tune[it.key] : it.def;
      }
      cat.setLook(Object.fromEntries(Object.entries(o).filter(([k]) => k in cat.look)));
      keyboard.group.visible = opts.role !== 'mouse';
      mouseProp.setVisible(opts.role !== 'keys');
      life.setPersist(opts.persist);
      if (opts.pomodoro && !wasPomo) S.pomo = { phase: 'focus', until: Date.now() + TUNING.pomoFocus * 60e3 };
      if (!opts.pomodoro) S.pomo = null;
      applyOutfit();
      S.busyUntil = now() + 1;
    },
    // What the app saved last time (see life.js).
    memory(saved) {
      const m = life.load(saved);
      const away = Date.now() - m.lastSeen;
      // Back after days away it sulks a while; after some hours it says hello.
      if (away > 2 * 86400e3) { S.sulkUntil = now() + 40; S.sulkPet = 0; setTimeout(() => say('哼', 2), 1200); }
      else if (away > 3 * 3600e3) S.greetPending = true;
      applyOutfit();
    },
    // Asks for the memory to be saved now (the 今日小结 window wants it fresh).
    saveMemory() { life.tick(true); },
    // A transparent PNG of the cat as it is right now, for the 今日小结 card.
    portrait() {
      renderer.render(scene, camera);
      post({ portrait: renderer.domElement.toDataURL('image/png') });
    },
    record(seconds = 3) {
      if (S.rec) return;
      const w = Math.round(window.innerWidth), h = Math.round(window.innerHeight);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      S.rec = { until: now() + seconds, frames: [], last: -1, w, h, ctx: c.getContext('2d', { willReadFrequently: true }) };
      S.busyUntil = now() + seconds + 1;
    },
    // The other cat: where its head is in this page's pixels, or null when it is gone.
    friend(x, y) { S.friend = x === null || x === undefined ? null : { x, y }; },
    // Something the other cat did to this one.
    friendEvent(kind) {
      const t = now();
      if (S.asleep) return;
      if (kind === 'swat') {
        P.flinch.kick(6);
        P.squash.kick(0.4);
        // Half the time it swats back.
        if (Math.random() < 0.5 && !S.scene && S.friend) setTimeout(() => { if (!S.scene) swatFriend(now()); }, 700);
      } else if (kind === 'blink' && Math.random() < 0.7) {
        setTimeout(() => { S.act = { kind: 'slowBlink', t0: now(), dur: 1.6, side: 1 }; }, 600);
      }
      S.busyUntil = Math.max(S.busyUntil, t + 2);
    },
    test(name) { const run = TESTS[name]; if (run) { run(now()); S.busyUntil = now() + 3; } },
    sleepNow() { S.asleep = true; S.lastInput = now() - opts.sleepAfter; },
    // Makes the cat cross right away (for checking the tail thump).
    annoyNow() { poke(1, now(), true); S.busyUntil = now() + 3; },
    // Makes the cat curious for a few seconds (the 调节 window's 试试 button).
    curiousNow(seconds = 3) { const t = now(); S.curiousUntil = t + seconds; S.busyUntil = t + seconds + 1; wake(t); },
    reset() {
      S.mouseDown = false; S.lastMouse = -100; S.lastKey = -100; S.petting = false; S.petUntil = 0;
      S.keyGaze = null;
      S.asleep = false; S.sleep = 0; S.lastInput = now(); S.busyUntil = now() + 2;
      S.breathPhase = S.lieBreathPhase = 0;
      S.strokes = []; S.excite = 0; S.act = null; S.nextAct = now() + 4;
      S.annoy = 0; S.cross = false; S.petStart = -1; S.thumpLift = 0; S.cuddleUntil = 0; S.lieAt = 'board';
      S.moves = []; S.mouseSpeed = 0; S.curiousUntil = -100;
      S.dizzyAt = null; S.nextDizzy = 0;
      S.twitch = null; S.nextTwitch = now() + 3;
      S.scene = null; S.yawn = null; S.yawnAt = 0; S.stretchUntil = 0; S.sleepPose = 'loaf';
      S.nextYarn = now() + 24;
      yarn.setOpacity(0);
      S.purr = 0; S.blinkAskAt = 0; S.nag = null; S.sulkUntil = 0; S.cupFall = null; S.cupBackAt = 0; S.cupV = 0;
      S.workStart = Date.now(); S.keysQuietSince = now();
      if (S.clip) { scene.remove(S.clip.sprite); S.clip = null; }
      if (bubble) { scene.remove(bubble.sprite); bubble = null; }
      cup.group.position.copy(cup.home); cup.group.rotation.set(0, 0, 0);
      P.cross.set(0); P.desk.set(0); P.curious.set(0); P.lie.set(0); P.tailLie.set(0); S.stop = null; S.play = null; S.nextPlay = 0; P.melt.set(0); P.doze.set(0); S.lying = null; S.dream = null; P.purr.set(0); P.flinch.set(0);
      for (const fx of [...effects, ...zs, ...popups]) scene.remove(fx.sprite);
      effects.length = 0;
      zs.length = 0;
      popups.length = 0;
      keyboard.releaseAll();
      for (const k of ['shift', 'hunch', 'squash', 'yaw', 'roll', 'gazeX', 'gazeY', 'ears', 'hunt', 'impactRoll']) P[k].set(0);
      P.pitch.set(-0.28);
      for (const p of Object.values(paws)) { p.key = null; p.down = false; p.heavy = false; p.t0 = -100; p.keyPose = p.keyPoseFrom = 0; }
      Object.assign(tailTap, { key: null, t0: -100, down: false, landAt: -100, returnAt: null, reach: 0, hover: 0.12 });
    },
    hitTest,
    state: S,
  };

  // Holiday outfit from today's date, unless switched off (`festival: false`) or forced (`outfit`).
  function applyOutfit() {
    const kind = opts.outfit && opts.outfit !== 'none' ? opts.outfit : opts.festival && opts.outfit !== 'none' ? life.festival() : null;
    if (cat.outfit.kind !== kind) cat.setOutfit(kind);
  }
  setInterval(applyOutfit, 60e3);

  if (K.dev) {
    window.cat.freeze = () => { frozen = performance.now() / 1000; last = frozen; };
    window.cat.step = seconds => {
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        frozen += 1 / 60; update(frozen, 1 / 60); last = frozen;
        if (S.rec) { renderer.render(scene, camera); capture(frozen); }
      }
      renderer.render(scene, camera);
      if (S.cursor) S.hit = hitTest(S.cursor.x, S.cursor.y);
      return 1;
    };
  }

  if (K.dev) {
    window.addEventListener('keydown', e => { if (!e.repeat) key(e.code, true); });
    window.addEventListener('keyup', e => key(e.code, false));
  }
  if (K.devPointer) {
    window.addEventListener('mousemove', e => { window.cat.cursor(e.clientX, e.clientY); window.cat.mouseMove(e.movementX, e.movementY); });
    window.addEventListener('mousedown', e => hitTest(e.clientX, e.clientY) === 'pet' ? window.cat.pet(true, e.clientX) : window.cat.mouseButton(true));
    window.addEventListener('mouseup', () => { window.cat.pet(false); window.cat.mouseButton(false); });
  }
  loop();
})();
