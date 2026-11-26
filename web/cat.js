// The cat: a chibi build of the reference page's cat (1 unit ≈ 95 px at the keyboard):
// a big round head on a short bean-shaped body, tail, hind paws and the two arms.
'use strict';
(() => {
  const { V, mix, smooth } = K;
  // One fur material per part, sharing the coat (see fur.js); each knows where its markings go.
  const fur = {
    head: K.furMaterial('HEAD'), body: K.furMaterial('BODY'), tail: K.furMaterial('TAIL'),
    ears: [K.furMaterial('EAR', -1), K.furMaterial('EAR', 1)], arms: [K.furMaterial('ARM', -1), K.furMaterial('ARM', 1)],
  };
  // Outlines draw first without writing depth, so any fur drawn later covers them: the cream
  // line shows only around the outer silhouette, never where head, body and tail meet.
  const rimMat = K.back('#f6f3e8');
  rimMat.visible = false;
  rimMat.depthWrite = false;
  const armRimMat = K.withArmRootPush(K.back('#8a8984'));
  const pawMat = K.flat('#f7f6f0');
  // Same trick for the paws: the grey outline shows around a paw but not across the arm it ends.
  const pawRimMat = K.back('#8f8f8a');
  pawRimMat.depthWrite = false;
  const overlay = color => new THREE.MeshBasicMaterial({ color, depthTest: false });
  const toeMat = overlay('#b9b7ae');
  // Toe beans on the soles. They sit on the fur and test depth, so a sole turned away or hidden
  // behind the body hides them too.
  const padMat = new THREE.MeshBasicMaterial({ color: '#f19aa6', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const shineMat = overlay('#ffffff');
  // Per eye, so odd eyes can differ. Closed eyes are a line: iris-gold on black fur, dark on
  // light coats where gold would not show.
  const eyeMats = [overlay('#dcb64a'), overlay('#dcb64a')];
  const lidMat = overlay('#dcb64a');
  const pupilMat = overlay('#141414');
  const whiskerMat = overlay('#dedcd4');
  const noseMat = overlay('#2a2a2a');
  const mouthMat = overlay('#2a2a2a');
  const blushMat = new THREE.MeshBasicMaterial({ color: '#f08a8a', transparent: true, opacity: 0, depthTest: false });

  // The body group's origin is the middle of the seat, so leaning pivots about the haunches.
  const body = new THREE.Group();
  const HOME = V(0.02, 0, 0.05);
  body.position.copy(HOME);
  K.scene.add(body);

  // A short bean: round haunches, soft sloping shoulders, and a neck that ends inside the head.
  // The outline is a smooth spline sampled finely, so the silhouette has no corners.
  const BODY_H = 1.32;
  const outline = new THREE.CatmullRomCurve3([[0, 0], [0.44, 0.005], [0.58, 0.08], [0.63, 0.26], [0.615, 0.48],
    [0.565, 0.7], [0.5, 0.9], [0.43, 1.06], [0.34, 1.2], [0.2, 1.29], [0, BODY_H]].map(([r, y]) => V(r, y, 0)),
    false, 'centripetal');
  const profile = outline.getSpacedPoints(48).map(q => new THREE.Vector2(Math.max(0, q.x), q.y));
  profile[0].x = 0; profile[profile.length - 1].x = 0;
  const bodyGeo = new THREE.LatheGeometry(profile, 72);
  // The unbent shape, so markings stay on the fur while the spine bends.
  bodyGeo.setAttribute('rest', bodyGeo.attributes.position.clone());
  // Both meshes keep unit scale; their shapes (the body a little flatter front to back, the
  // outline a little bigger) are applied while placing the vertices on the spine.
  const bodyMesh = new THREE.Mesh(bodyGeo, fur.body);
  bodyMesh.userData.size = V(1, 1, 0.82);
  const rimGeo = bodyGeo.clone();
  const bodyRim = new THREE.Mesh(rimGeo, rimMat);
  bodyRim.userData.size = V(1.045, 1.018, 0.86);
  bodyRim.renderOrder = -1;
  body.add(bodyRim, bodyMesh);

  // The body is a tube round a spine. Sitting, the spine stands up from the seat and bends: the
  // haunches stay planted and the chest, neck and head shift sideways (x) and forward (z) more the
  // higher up they are, and `squash` sinks the upper body into a loaf. Lying down, the spine itself
  // takes a new shape (see `lying`): it runs along the desk from the hip, curved, and the round
  // body cross-sections turn with it. So a lying cat has a lying cat's outline, long and low,
  // instead of a sitting one tipped over.
  // A point of the body is given in sitting terms: y is how far up the spine (`s`), x and z are
  // its offset from the spine to the cat's side and front.
  const bend = { x: 0, z: 0, squash: 0 };
  const spineWeight = y => smooth(0.15, BODY_H, y) ** 1.6;
  const sink = y => smooth(0.2, BODY_H, y);
  // The lying pose, set by the behaviour. `amount` 0 sits, 1 lies. `path`: the lying spine as
  // body-space points from the end of the rump (s = S0) to past the neck (s = S1); how long it is
  // sets how long the lying cat is. `side`: the cat's left at the hips and at the neck, which with
  // the path sets which way the belly faces (the two differing twists the hips against the chest).
  // `kS`, `kF`: cross-section scale across the side and through the belly ([at hip, at neck]).
  // `lead`: how far the chest goes down ahead of the hips. `floor(x, z)`: the world height of what
  // it lies on. Nothing else holds a relaxed body up, so it settles onto that: flat where it
  // touches, bulging out a little to the sides. `tail`, `hind`: see below.
  const lying = { amount: 0, path: null, side: [V(0, 0, 1), V(0, 0, 1)], kS: [1, 1], kF: [1, 1], lead: 0.5,
    floor: null, tail: null, tailWag: null, tailBaseFollow: 0, tailExtend: 0, hind: null };
  // The spine is sampled from a little behind the seat (for the rounded rump) to past the neck.
  const S0 = -0.45, S1 = 1.5, NS = 40, DS = (S1 - S0) / NS;
  const spine = Array.from({ length: NS + 1 }, () => ({ p: V(0, 0, 0), S: V(1, 0, 0), T: V(0, 1, 0), F: V(0, 0, 1), kS: 1, kF: 1, w: 0, q: new THREE.Quaternion() }));
  const qLie = new THREE.Quaternion(), qI = new THREE.Quaternion(), basis = new THREE.Matrix4();
  const tS = V(0, 0, 0), tT = V(0, 0, 0), tF = V(0, 0, 0), tA = V(0, 0, 0);
  const lieCurve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 1, 0)], false, 'centripetal'), hipAt = V(0, 0, 0);
  // How lain-down the spine is at `s`: the chest leads, the hips follow.
  const lieAt = s => lying.path ? smooth(0, 1, lying.amount * (1 + lying.lead) - lying.lead * (1 - K.clamp(s / BODY_H, 0, 1))) : 0;
  function buildSpine() {
    const L = lying, i0 = Math.round(-S0 / DS), on = L.path && L.amount > 0;
    let len = 1;
    if (on) {
      lieCurve.points = L.path;
      lieCurve.updateArcLengths();
      len = lieCurve.getLength() / (S1 - S0);
      lieCurve.getPointAt(-S0 / (S1 - S0), hipAt);
    } else hipAt.set(0, 0, 0);
    for (let i = 0; i <= NS; i++) {
      const sp = spine[i], sv = S0 + i * DS, u = K.clamp(sv / BODY_H, 0, 1), w = on ? lieAt(sv) : 0;
      sp.w = w;
      if (w > 0) {
        // Lying frame: along the path, the belly facing away from the cat's left.
        lieCurve.getTangentAt(i / NS, tT);
        tS.lerpVectors(L.side[0], L.side[1], u);
        tF.crossVectors(tS, tT).normalize();
        tS.crossVectors(tT, tF);
        basis.makeBasis(tS, tT, tF);
        qLie.setFromRotationMatrix(basis);
        sp.q.copy(qI).slerp(qLie, w);
      } else sp.q.identity();
      sp.S.set(1, 0, 0).applyQuaternion(sp.q);
      sp.T.set(0, 1, 0).applyQuaternion(sp.q);
      sp.F.set(0, 0, 1).applyQuaternion(sp.q);
      sp.kS = mix(1, mix(L.kS[0], L.kS[1], u), w);
      sp.kF = mix(1, mix(L.kF[0], L.kF[1], u), w);
    }
    // Walk the spine out from the seat both ways. Sitting, it is straight up; lying, it walks the
    // path. The bend and squash of the sitting pose are added on top, fading out as it lies down.
    spine[i0].p.copy(hipAt).multiplyScalar(spine[i0].w);
    for (let i = i0 + 1; i <= NS; i++) spine[i].p.copy(spine[i - 1].p).addScaledVector(spine[i - 1].T, DS * mix(1, len, spine[i - 1].w));
    for (let i = i0 - 1; i >= 0; i--) spine[i].p.copy(spine[i + 1].p).addScaledVector(spine[i + 1].T, -DS * mix(1, len, spine[i + 1].w));
    for (let i = 0; i <= NS; i++) {
      const sv = S0 + i * DS, k = 1 - spine[i].w, y = Math.max(0, sv), sw = spineWeight(y);
      spine[i].p.x += bend.x * sw * k;
      spine[i].p.y -= y * bend.squash * sink(y) * k;
      spine[i].p.z += bend.z * sw * k;
    }
  }
  // Body-space position of a point given in sitting terms. Past the ends the spine carries on straight.
  const sampleAt = sv => {
    const f = (sv - S0) / DS, i = K.clamp(Math.floor(f), 0, NS - 1);
    return [spine[i], spine[i + 1], f - i];
  };
  // `place` also leaves the spine point it measured from and how lain-down that is.
  const placedAt = V(0, 0, 0);
  let placedW = 0;
  function place(x, y, z, out, sv = y) {
    const [a, b, f] = sampleAt(sv);
    const kS = mix(a.kS, b.kS, f), kF = mix(a.kF, b.kF, f);
    placedAt.lerpVectors(a.p, b.p, f);
    placedW = mix(a.w, b.w, f);
    return out.copy(placedAt)
      .addScaledVector(tS.lerpVectors(a.S, b.S, f), x * kS)
      .addScaledVector(tF.lerpVectors(a.F, b.F, f), z * kF);
  }
  const restPos = [bodyGeo, rimGeo].map(g => Float32Array.from(g.attributes.position.array));
  const spread = V(0, 0, 0);
  function bendBody() {
    buildSpine();
    const fl = lying.amount > 0.001 && lying.floor, bp = body.position;
    [[bodyGeo, bodyMesh], [rimGeo, bodyRim]].forEach(([g, mesh], gi) => {
      const src = restPos[gi], pos = g.attributes.position.array, sc = mesh.userData.size, v = tA;
      for (let i = 0; i < pos.length; i += 3) {
        const x = src[i] * sc.x, y = src[i + 1] * sc.y, z = src[i + 2] * sc.z;
        // Lying, the flat seat would show as a flat end: it rounds off into a rump.
        const r = Math.hypot(x, z / 0.82), w0 = spine[Math.round(-S0 / DS)].w;
        const sv = y - w0 * 0.26 * Math.sqrt(Math.max(0, 1 - (r / 0.66) ** 2)) * (1 - smooth(0.05, 0.4, y));
        place(x, y, z, v, sv);
        if (fl && placedW > 0) {
          // Settling onto the surface: whatever would sink into it rests on it instead, flattening
          // the underside, and the flesh pushed up spreads out sideways. The outline stops a hair
          // below the fill, so a thin line still shows along the contact.
          const fy = fl(v.x + bp.x, v.z + bp.z) - bp.y - (gi ? 0.014 : 0);
          const lift = (smax(v.y, fy, 0.07) - v.y) * placedW;
          if (lift > 0) {
            spread.set(v.x - placedAt.x, 0, v.z - placedAt.z);
            const l = spread.length();
            if (l > 1e-4) v.addScaledVector(spread, 0.5 * lift / l);
            v.y += lift;
          }
        }
        pos[i] = v.x; pos[i + 1] = v.y; pos[i + 2] = v.z;
      }
      g.attributes.position.needsUpdate = true;
      if (lying.amount > 0.001) g.computeVertexNormals();
      g.computeBoundingSphere();
    });
  }
  // The collar rides the bent neck and tips with the slope of the spine there. When the head nods
  // down (asleep, hunched over the keys) the chin tucks into the neck and pushes the collar lower
  // and back, so it never ends up in front of the face. Called after the head pose is set.
  const collarTilt = new THREE.Quaternion(), collarEuler = new THREE.Euler();
  function placeCollar() {
    if (!collar.visible) return;
    const y = COLLAR_Y - 0.3 * K.clamp(headPivot.rotation.x + 0.1, 0, 0.6) * (1 - lying.amount);
    // Lower down the chest is wider, so the band widens with it to stay on the fur.
    const [a, b, f] = sampleAt(y);
    const s = radiusAt(y) / collarR;
    collar.scale.set(s * mix(a.kS, b.kS, f), 1, s * mix(a.kF, b.kF, f) / 1);
    place(0, y, 0, collar.position);
    const w = spineWeight(y), dw = (spineWeight(y + 0.01) - spineWeight(y - 0.01)) / 0.02;
    // Only part of the spine's slope: the neck stays fairly upright under the level head, and a
    // steeply tipped band reads as a sash. The bell hangs plumb whatever the band does.
    const k = 1 - a.w;
    const tx = K.clamp(Math.atan(bend.z * dw) * 0.5, -0.18, 0.18) * k, tz = K.clamp(-Math.atan(bend.x * dw) * 0.5, -0.18, 0.18) * k;
    collar.quaternion.copy(a.q).slerp(b.q, f).multiply(collarTilt.setFromEuler(collarEuler.set(tx, 0, tz)));
    bell.rotation.set(-tx, 0, -tz);
  }
  // A point given in sitting terms, moved with the spine and placed in the world.
  function attach(local, out) {
    body.updateMatrixWorld();
    return place(local.x, local.y, local.z, out).applyMatrix4(body.matrixWorld);
  }
  // The spine's frame at `s` in the world: `T` along it towards the head, `F` out of the belly, `S`
  // to the cat's left. For placing paws and the head when lying.
  function frameAt(sv, out = { p: V(0, 0, 0), S: V(0, 0, 0), T: V(0, 0, 0), F: V(0, 0, 0) }) {
    body.updateMatrixWorld();
    const [a, b, f] = sampleAt(sv);
    out.p.lerpVectors(a.p, b.p, f).applyMatrix4(body.matrixWorld);
    for (const k of ['S', 'T', 'F']) out[k].lerpVectors(a[k], b[k], f).transformDirection(body.matrixWorld);
    out.w = mix(a.w, b.w, f);
    return out;
  }

  // Paw: a soft bean, flat underneath and fuller at the toes, with two toe creases on top.
  const pawGeo = new THREE.SphereGeometry(1, 32, 20);
  {
    const q = pawGeo.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i), y = q.getY(i), z = q.getZ(i);
      q.setXYZ(i, x * (1 + 0.12 * z), y < 0 ? y * 0.45 : y, z);
    }
  }
  const toeGeo = new THREE.PlaneGeometry(0.03, 0.34);
  toeGeo.rotateX(-Math.PI / 2);
  // One lobed heel pad and four toe pads, with the smaller outer toes angled outwards.
  const PAD_SEGMENTS = 28;
  const heelPad = new THREE.Shape();
  heelPad.moveTo(0, 0.22);
  heelPad.bezierCurveTo(-0.12, 0.22, -0.19, 0.34, -0.31, 0.21);
  heelPad.bezierCurveTo(-0.40, 0.12, -0.46, -0.20, -0.39, -0.33);
  heelPad.bezierCurveTo(-0.34, -0.45, -0.22, -0.46, -0.15, -0.41);
  heelPad.bezierCurveTo(-0.09, -0.51, 0.09, -0.51, 0.15, -0.41);
  heelPad.bezierCurveTo(0.22, -0.46, 0.34, -0.45, 0.39, -0.33);
  heelPad.bezierCurveTo(0.46, -0.20, 0.40, 0.12, 0.31, 0.21);
  heelPad.bezierCurveTo(0.19, 0.34, 0.12, 0.22, 0, 0.22);
  const toePads = [
    [-0.57, 0.35, 0.148, 0.181, -0.34],
    [-0.205, 0.57, 0.153, 0.204, -0.12],
    [0.205, 0.57, 0.153, 0.204, 0.12],
    [0.57, 0.35, 0.148, 0.181, 0.34],
  ];
  const padOrigin = new THREE.Vector2();
  const padOutlines = [
    [0, -0.14, heelPad.getSpacedPoints(PAD_SEGMENTS)],
    ...toePads.map(([x, z, width, length, angle]) => {
      const outline = Array.from({ length: PAD_SEGMENTS + 1 }, (_, i) => {
        const t = i * 2 * Math.PI / PAD_SEGMENTS;
        const taper = 1 - 0.14 * Math.sin(t);
        return new THREE.Vector2(width * taper * Math.cos(t), length * Math.sin(t))
          .rotateAround(padOrigin, -angle);
      });
      return [x, z, outline];
    }),
  ];
  function solePadGeometry([x, z, outline], direction) {
    // Subdivide the interior so it follows the curved sole as closely as the edge does.
    const geo = new THREE.RingGeometry(0, 1, PAD_SEGMENTS, 4);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const radius = Math.hypot(pos.getX(i), pos.getY(i));
      const edge = outline[i % outline.length];
      const px = (x + radius * edge.x) * direction, pz = (z + radius * edge.y) * direction;
      const sole = -0.45 * Math.sqrt(1 - px * px - pz * pz);
      pos.setXYZ(i, px * (1 + 0.12 * pz), sole - 0.014, pz);
    }
    return geo;
  }
  const padGeos = padOutlines.map(outline => solePadGeometry(outline, 1));
  const reversePadGeos = padOutlines.map(outline => solePadGeometry(outline, -1));
  function makePaw(parent, order) {
    const shape = pawGeo.clone();
    const paw = new THREE.Mesh(shape, pawMat);
    paw.renderOrder = order + 2;
    const rim = new THREE.Mesh(shape, pawRimMat);
    rim.renderOrder = order - 2;
    // Creases run back from the front edge; they live on the paw so they turn and scale with it.
    const creases = [-0.3, 0.3].map(x => {
      const toe = new THREE.Mesh(toeGeo.clone(), toeMat);
      toe.position.set(x, 0.66, 0.72);
      toe.renderOrder = order + 3;
      paw.add(toe);
      return toe;
    });
    const pads = padGeos.map(geo => {
      const pad = new THREE.Mesh(geo.clone(), padMat);
      pad.renderOrder = order + 3;
      paw.add(pad);
      return pad;
    });
    Object.assign(paw.userData, { creases, pads, clench: 0, padDirection: 1 });
    parent.add(rim, paw);
    return { paw, rim };
  }
  const pawPoint = V(), markOrigin = V();
  function bendPawPoint(point, amount, direction) {
    // The toes fold toward the sole. The heel and the wrist stay where they are.
    const toe = Math.max(0, point.z * direction);
    const curl = amount * toe * toe;
    point.x *= 1 - 0.25 * curl;
    point.y -= 0.68 * curl;
    point.z -= 0.42 * curl * direction;
  }
  function bendPawMark(mark, rest, amount, direction) {
    markOrigin.copy(mark.position);
    bendPawPoint(mark.position, amount, direction);
    const pos = mark.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pawPoint.fromBufferAttribute(rest, i).multiply(mark.scale).add(markOrigin);
      bendPawPoint(pawPoint, amount, direction);
      pawPoint.sub(mark.position).divide(mark.scale);
      pos.setXYZ(i, pawPoint.x, pawPoint.y, pawPoint.z);
    }
    pos.needsUpdate = true;
    mark.geometry.computeBoundingSphere();
  }
  function shapePaw(paw, amount, direction = 1) {
    const data = paw.userData;
    if (data.clench === amount && data.padDirection === direction) return;
    const pos = paw.geometry.attributes.position, rest = pawGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pawPoint.fromBufferAttribute(rest, i);
      bendPawPoint(pawPoint, amount, direction);
      pos.setXYZ(i, pawPoint.x, pawPoint.y, pawPoint.z);
    }
    pos.needsUpdate = true;
    paw.geometry.computeBoundingSphere();
    data.creases.forEach((crease, i) => {
      crease.position.set(i === 0 ? -0.3 : 0.3, 0.66, 0.72);
      bendPawMark(crease, toeGeo.attributes.position, amount, direction);
    });
    const soles = direction < 0 ? reversePadGeos : padGeos;
    data.pads.forEach((pad, i) => bendPawMark(pad, soles[i].attributes.position, amount, direction));
    data.clench = amount;
    data.padDirection = direction;
  }
  const hind = [-1, 1].map(s => {
    const { paw, rim } = makePaw(body, 0);
    paw.scale.set(0.17, 0.1, 0.15);
    paw.position.set(s * 0.44, 0.06, 0.4);
    paw.rotation.y = s * 0.25;
    rim.scale.set(0.186, 0.114, 0.166);
    rim.position.copy(paw.position);
    rim.rotation.copy(paw.rotation);
    paw.userData.rim = rim;
    paw.userData.home = paw.position.clone();
    return paw;
  });
  // Sitting, only the hind paws show, tucked under the front of the haunches. Lying, the leg
  // shows too, so each has one, hidden while sitting. This is a chibi cat: a leg is a short soft
  // stub coming out of the round body, bent once, ending in a big mitten paw. `lying.hind` gives
  // where each leg bends (`knee`) and its paw, in body space, and optionally which way the toes
  // point (`toes`) and the top of the paw faces (`top`), so a sole can be turned to show its beans.
  // Lying, the cat is one round lump and a limb lying against it is not lined off from it: the
  // limb's outline goes to the back, like the body's, so it only shows round the outside of the
  // whole cat (`outer` on). Sitting, arms and legs keep their own darker line.
  function outlineOutside(limb, on, mat, order) {
    if (limb.line.outer === on) return;
    limb.line.outer = on;
    for (const m of limb.rims) { m.material = on ? rimMat : mat; m.renderOrder = on ? -1 : order; }
  }
  const hindLegs = [-1, 1].map(s => {
    const before = body.children.length;
    const line = { outer: false };
    const leg = K.limb(body, { segments: 30, radial: 12, fill: fur.arms[s < 0 ? 0 : 1], outline: armRimMat, order: 1,
      edge: t => line.outer ? 0.022 : mix(-0.03, 0.012, smooth(0.06, 0.2, t)) });
    leg.line = line;
    leg.all = body.children.slice(before);
    for (const m of leg.all) m.visible = false;
    leg.joints = [V(0, 0, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0, 0)];
    leg.runs = Array.from({ length: 5 }, () => ({ a: V(0, 0, 0), b: V(0, 0, 0), c: V(0, 0, 0), bent: false, len: 0 }));
    return leg;
  });
  // A limb through `leg.joints` as straight runs meeting in tight rounded corners (`radii`, one per
  // joint), so a knee or hock reads as a joint rather than one long bend. `jointAt` samples it by
  // length; `leg.at` holds how far along each joint is.
  const runIn = V(0, 0, 0), runOut = V(0, 0, 0);
  function setJoints(leg, radii) {
    const P = leg.joints, R = leg.runs;
    let n = 0, total = 0, from = P[0];
    leg.at = [];
    for (let i = 1; i < P.length - 1; i++) {
      const lin = runIn.subVectors(P[i], P[i - 1]).length(), lout = runOut.subVectors(P[i + 1], P[i]).length();
      runIn.divideScalar(lin || 1);
      runOut.divideScalar(lout || 1);
      const r = Math.min(radii[i - 1], 0.45 * lin, 0.45 * lout);
      const line = R[n++], turn = R[n++];
      line.bent = false;
      line.a.copy(from);
      line.b.copy(P[i]).addScaledVector(runIn, -r);
      line.len = line.a.distanceTo(line.b);
      turn.bent = true;
      turn.a.copy(line.b);
      turn.c.copy(P[i]);
      turn.b.copy(P[i]).addScaledVector(runOut, r);
      turn.len = r * (1 + runIn.dot(runOut) * 0.5 + 0.5);
      total += line.len;
      leg.at.push(total + turn.len / 2);
      total += turn.len;
      from = turn.b;
    }
    const last = R[n++];
    last.bent = false;
    last.a.copy(from);
    last.b.copy(P[P.length - 1]);
    last.len = last.a.distanceTo(last.b);
    total += last.len;
    leg.n = n;
    leg.total = total;
    leg.at = leg.at.map(d => d / total);
  }
  function jointAt(leg, t, out) {
    let d = t * leg.total;
    for (let i = 0; i < leg.n; i++) {
      const r = leg.runs[i];
      if (d <= r.len || i === leg.n - 1) {
        const u = r.len > 0 ? Math.min(1, d / r.len) : 0, v = 1 - u;
        if (!r.bent) return out.lerpVectors(r.a, r.b, u);
        return out.set(v * v * r.a.x + 2 * v * u * r.c.x + u * u * r.b.x, v * v * r.a.y + 2 * v * u * r.c.y + u * u * r.b.y,
          v * v * r.a.z + 2 * v * u * r.c.z + u * u * r.b.z);
      }
      d -= r.len;
    }
    return out;
  }
  const legQ = new THREE.Quaternion(), legDir = V(0, 0, 0), legFlat = V(0, 0, 0), Y_UP = V(0, 1, 0);
  const hipJoint = V(0, 0, 0), legFoot = V(0, 0, 0), legLocal = V(0, 0, 0);
  // A paw at the end of a limb carries on the way the limb arrives at it (`dir`), its top turned
  // up and towards the viewer (or towards `up`): a paw hanging off an edge points its toes at the
  // floor and shows its back, one lying on the keys lies flat.
  const pawY = V(0, 0, 0), pawX = V(0, 0, 0), pawZ = V(0, 0, 0), pawUp = V(0, 1, 0.6), pawBasisM = new THREE.Matrix4();
  function pawBasis(dir, out, up = pawUp) {
    pawZ.copy(dir).normalize();
    pawY.copy(up).addScaledVector(pawZ, -pawZ.dot(up));
    if (pawY.lengthSq() < 1e-4) pawY.set(0, 1, 0);
    pawY.normalize();
    pawX.crossVectors(pawY, pawZ);
    return out.setFromRotationMatrix(pawBasisM.makeBasis(pawX, pawY, pawZ));
  }
  // Hind paws can twitch (in a dream); `offsets` are added to each one's place, in sitting terms
  // sitting and body space lying.
  function kickHind(offsets, turnPads = false, clench = 0) {
    const w = lieAt(0.1);
    const padDirection = turnPads ? -1 : 1;
    hind.forEach((paw, i) => {
      legLocal.copy(paw.userData.home).add(offsets[i]);
      place(legLocal.x, legLocal.y, legLocal.z, paw.position);
      place((i ? 1 : -1) * 0.3, 0.34, 0.08, hipJoint);
      paw.quaternion.setFromAxisAngle(V(0, 1, 0), (i ? 1 : -1) * 0.25);
      const pose = lying.hind && lying.hind[i], [, knee, mid] = hindLegs[i].joints;
      knee.lerpVectors(hipJoint, paw.position, 0.5);
      if (pose && w > 0) {
        paw.position.lerp(legFoot.copy(pose.paw).add(offsets[i]), w);
        knee.lerp(pose.knee, w);
        // Unless the pose turns it, the paw lies flat with its toes forward, swung a little the
        // way the leg comes into it (a leg coming straight down would stand it on its toes).
        legDir.subVectors(paw.position, knee).normalize();
        legFlat.set(legDir.x, 0, Math.max(legDir.z, 0) + 0.6);
        paw.quaternion.slerp(pawBasis(pose.toes || legFlat, legQ, pose.top || Y_UP), w);
      }
      mid.lerpVectors(knee, paw.position, 0.5);
      paw.scale.set(0.17, 0.1, 0.15);
      // Turn the exposed pad pattern to match the forepaws while keeping the leg extended.
      shapePaw(paw, clench, padDirection);
      paw.userData.rim.scale.copy(paw.scale).addScalar(0.016);
      paw.userData.rim.position.copy(paw.position);
      paw.userData.rim.quaternion.copy(paw.quaternion);
      const leg = hindLegs[i], show = w > 0.15;
      for (const m of leg.all) m.visible = show;
      if (!show) return;
      outlineOutside(leg, true, armRimMat, 0);
      // A soft stub from inside the haunch, round through the bend, into the back of the paw's
      // heel, so it never shows through the sole.
      const pts = leg.joints;
      pts[0].copy(hipJoint);
      pts[3].copy(paw.position).addScaledVector(legDir.set(0, 1, 0).applyQuaternion(paw.quaternion), 0.07)
        .addScaledVector(legDir.set(0, 0, 1).applyQuaternion(paw.quaternion), -0.08);
      setJoints(leg, [0.3, 0.3]);
      leg.update((t, out) => jointAt(leg, t, out), t => mix(0.15, 0.09, smooth(0, 1, t)));
    });
  }

  // Head on a pivot at the neck so it can tilt, nod and rub.
  const headPivot = new THREE.Group();
  headPivot.position.set(0, BODY_H - 0.12, 0.06);
  body.add(headPivot);

  // Optional collar with a bell, a band hugging the fur just under the chin.
  const COLLAR_Y = 1.13;
  const outlinePts = outline.getSpacedPoints(400);
  const radiusAt = y => outlinePts.reduce((best, q) => Math.abs(q.y - y) < Math.abs(best.y - y) ? q : best).x;
  const collarR = radiusAt(COLLAR_Y);
  // The collar draws as if a little nearer than it is, so the tops of the arms just under it
  // never cover its ends.
  const COLLAR_LIFT = 0.07;
  const [collarMat, collarRimMat, bellMat, bellRimMat] = [K.flat('#d9483b'), K.back('#1d1d1b'), K.flat('#e8b93a'), K.back('#1d1d1b')]
    .map(m => K.towardEye(m, COLLAR_LIFT));
  const collar = new THREE.Group();
  // Only the front arc of the band is drawn, ending with round tips just inside the silhouette:
  // a full ring would poke out past the neck outline as dark tabs at either side.
  const band = K.limb(collar, { segments: 40, radial: 8, fill: collarMat, outline: collarRimMat, order: 1,
    edge: t => 0.01 * smooth(0, 0.22, Math.min(t, 1 - t)) });
  band.update((t, out) => {
    // The ends thin out and curl round behind the neck, so the band seems to carry on out of view.
    const a = mix(-1.3, 1.3, t);
    return out.set(Math.sin(a) * (collarR + 0.004), 0.012 * (1 - Math.cos(a)), Math.cos(a) * (collarR + 0.004) * 0.82);
  }, t => 0.032 * (0.25 + 0.75 * smooth(0, 0.22, Math.min(t, 1 - t))));
  const bell = new THREE.Group();
  {
    // A round bell on a little ring, its pivot at the band so it swings from there. The slit and
    // glint are flat decals on the face towards the viewer, kept just in front of the ball.
    const R_BELL = 0.064;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(R_BELL, 24, 16), bellMat);
    const ballRim = new THREE.Mesh(new THREE.SphereGeometry(R_BELL + 0.012, 24, 16), bellRimMat);
    const decal = color => {
      const m = K.towardEye(K.flat(color), COLLAR_LIFT);
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
      return m;
    };
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.013), decal('#1d1d1b'));
    slit.position.set(0, -0.022, Math.sqrt(R_BELL ** 2 - 0.022 ** 2) + 0.002);
    slit.rotation.x = -0.33;
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.015, 12), decal('#fff6d8'));
    glint.position.set(-0.022, 0.024, Math.sqrt(R_BELL ** 2 - 0.022 ** 2 - 0.024 ** 2) + 0.002);
    glint.rotation.set(-0.35, -0.35, 0);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.007, 8, 16), K.towardEye(K.flat('#1d1d1b'), COLLAR_LIFT));
    loop.position.y = R_BELL + 0.01;
    const hang = new THREE.Group();
    hang.position.y = -(R_BELL + 0.018);
    hang.add(ballRim, ball, slit, glint, loop);
    bell.add(hang);
    bell.position.set(0, -0.012, (collarR + 0.04) * 0.82);
  }
  collar.add(bell);
  collar.visible = false;
  body.add(collar);
  const collarParts = [...collar.children];
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.04);
  headPivot.add(head);
  // Big round chibi head with full cheeks: widest at the cheeks below the eyes, softer over the brow.
  const R = V(0.56, 0.47, 0.47);
  const headGeo = new THREE.SphereGeometry(1, 64, 44);
  const p = headGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const cheek = 1 + 0.08 * Math.exp(-(((y + 0.38) / 0.4) ** 2)) - 0.08 * (y + 0.2);
    p.setXYZ(i, p.getX(i) * cheek, y > 0 ? y * (1 - 0.06 * y) : y * 0.96, p.getZ(i));
  }
  headGeo.computeVertexNormals();
  const headMesh = new THREE.Mesh(headGeo, fur.head);
  headMesh.scale.copy(R);
  headMesh.renderOrder = 0.6;   // after the ear outlines, see `ears`
  const headRim = new THREE.Mesh(headGeo, rimMat);
  headRim.scale.set(R.x + 0.024, R.y + 0.024, R.z + 0.02);
  headRim.renderOrder = -1;
  // 2D style: an ink line round the cheeks and chin, so the head reads apart from a body of the
  // same colour. It thins out towards the eyes and is gone well before the ears.
  const chinMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#151515') }, uWidth: { value: 0.05 } },
    side: THREE.BackSide,
    vertexShader: `
      uniform float uWidth;
      void main() {
        float w = uWidth * (1.0 - smoothstep(-0.55, 0.05, position.y));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * w, 1.0);
      }`,
    fragmentShader: `uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  });
  const chinLine = new THREE.Mesh(headGeo, chinMat);
  chinLine.scale.copy(R);
  head.add(headRim, chinLine, headMesh);

  // Ears: rounded triangles that grow out of the head. Where the outer edge reaches the cheek it
  // bends round to follow the head's outline just inside it, so the two meet in one smooth curve
  // instead of a kink, and below that the base rounds off out of sight inside the head. The
  // outline is the same shape grown evenly.
  // Bigger ears (the Devon's, `k` > 1) grow taller and broader above the base and lean further
  // out (`earTilt`); the fillet is worked out for each, against the head as that ear sees it.
  const EAR_AT = V(0.26, 0.21, -0.06), EAR_STRETCH = 1.12;
  const earTilt = k => 0.2 + 0.5 * Math.max(0, k - 1);
  const earTop = [[0.225, 0.1], [0.185, 0.19], [0.135, 0.27], [0.08, 0.33], [0.035, 0.36], [0, 0.37]];
  // The head's outer outline (see headGeo, `grow` for its rim) in the right ear's own frame, as
  // radius for height.
  const headInEar = (k, grow) => {
    const t = earTilt(k), c = Math.cos(t), sn = Math.sin(t), out = [];
    for (let i = 0; i <= 200; i++) {
      const y = -0.6 + 1.6 * i / 200;
      const cheek = 1 + 0.08 * Math.exp(-(((y + 0.38) / 0.4) ** 2)) - 0.08 * (y + 0.2);
      const dx = (R.x + grow) * cheek * Math.sqrt(Math.max(0, 1 - y * y)) - EAR_AT.x;
      const dy = (R.y + grow) * (y > 0 ? y * (1 - 0.06 * y) : y * 0.96) - EAR_AT.y;
      out.push([c * dx - sn * dy, (sn * dx + c * dy) / EAR_STRETCH]);
    }
    return y => {
      for (let i = 1; i < out.length; i++) {
        const [r0, y0] = out[i - 1], [r1, y1] = out[i];
        if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
      }
      return 0;
    };
  };
  const smax = (a, b, k) => { const h = K.clamp(0.5 + 0.5 * (a - b) / k, 0, 1); return mix(b, a, h) + k * h * (1 - h); };
  // The profile, bottom to top, for the ear (`grow` 0) or its outline: the outer edge carried on
  // straight down from the ear, merged with the head's outline in a rounded fillet, then drawn
  // in away from it, down to a rounded-off bottom. `meet` is just below where the edge reaches the head.
  const earProfile = (k, grow) => {
    const big = ([r, y]) => [r * (1 + (k - 1) * smooth(-0.06, 0.2, y)), -0.06 + (y + 0.06) * (1 + 0.6 * (k - 1))];
    const n = earTop.length - 1;
    const top = earTop.map(big).map(([r, y], i) => [r && r + grow, y + grow * (i / n) ** 2]);
    const head = headInEar(k, grow && 0.024);
    const [[ra, ya], [rb, yb]] = top, edge = y => ra + (rb - ra) * (y - ya) / (yb - ya);
    // Just inside the head where the two meet, then well inside it further down, so the base
    // stays hidden as the ear turns and the head moves, and turns into the rounded bottom out of
    // sight. Below the join the base leaves the edge line too: carried on down, that line flares
    // out to near the side of the head at eye level, and there its corner with the bottom showed
    // past the cheek whenever the head turned or tipped.
    let meet = ya;
    while (meet > -0.2 && edge(meet) > head(meet)) meet -= 0.002;
    const fillet = y => smax(edge(y), head(y) - 0.006, 0.03);
    const side = y => y > meet ? fillet(y) : mix(fillet(y), head(y) - 0.09, smooth(meet, meet - 0.12, y));
    const pts = [[0, -0.25], [0.2, -0.24]];
    for (let i = 0; i < 16; i++) {
      const y = -0.2 + (ya + 0.2) * i / 16;
      pts.push([side(y), y]);
    }
    return { pts: pts.concat(top), meet: [side(meet - 0.03), meet - 0.03], join: meet };
  };
  // The markings read the unscaled shape (`rest`), so the inner ear grows with the ear. Sampled
  // by curve parameter, so each vertex of a big ear lines up with the same one of the plain ear.
  // Below the join the base thins front to back, so that turning the head does not swing its
  // front or back out past the side of the head.
  const earLathe = ({ pts, join }) => {
    const g = new THREE.LatheGeometry(new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(48), 40);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * mix(1, 0.3, smooth(join, join - 0.1, pos.getY(i))));
    return g;
  };
  const earGeos = {};
  const earGeo = k => earGeos[k] || (earGeos[k] = (() => {
    const geos = [0, 0.026].map(grow => {
      const g = earLathe(earProfile(k, grow));
      g.setAttribute('rest', earLathe(earProfile(1, grow)).attributes.position);
      g.computeVertexNormals();
      return g;
    });
    return { geos, meet: earProfile(k, 0).meet };
  })());
  // Turns an ear: `z` leans it out, `x` tips it back. Leaning out, it turns about the middle of
  // its base, so the part under the cheek swings in. Standing up, about a point just below where
  // its outer edge meets the head, so the join moves in a touch rather than out; the base below
  // swings out a little, but sits far enough inside the head not to show.
  const earRest = new THREE.Euler(), earPivot = V(), earHeld = V();
  const turnEar = (ear, z, x) => {
    ear.group.rotation.set(x, 0, z);
    earPivot.copy(ear.meet).multiplyScalar(smooth(0, 0.1, ear.tilt + ear.s * z)).multiply(ear.group.scale);
    earHeld.copy(earPivot).applyEuler(earRest.set(-0.12, 0, -ear.s * ear.tilt));
    ear.group.position.set(ear.s * EAR_AT.x, EAR_AT.y, EAR_AT.z).add(earHeld).sub(earPivot.applyEuler(ear.group.rotation));
  };
  const placeEar = (ear, k) => {
    const { geos: [geo, rimGeo], meet } = earGeo(k);
    ear.mesh.geometry = geo;
    ear.rim.geometry = rimGeo;
    ear.tilt = earTilt(k);
    ear.meet = V(ear.s * meet[0], meet[1], 0);
    turnEar(ear, -ear.s * ear.tilt, -0.12);
  };
  const ears = [-1, 1].map(s => {
    const g = new THREE.Group();
    g.scale.set(1, EAR_STRETCH, 1);
    const e = new THREE.Mesh(undefined, fur.ears[s < 0 ? 0 : 1]);
    e.scale.set(1, 1, 0.5);
    const r = new THREE.Mesh(undefined, rimMat);
    r.scale.set(1, 1, 0.5 + 0.06);
    // The ear's outline is drawn after the body and before the head and the ear itself, so where
    // an ear stands in front of the body (lying over the keys, the back rises behind the head) it
    // still shows round the ear, instead of being covered like the outlines inside the body.
    r.renderOrder = 0.5;
    e.renderOrder = 0.6;
    g.add(r, e);
    head.add(g);
    // `tilt`: how far the ear leans out at rest; the behaviour adds its swivel to it.
    const ear = { group: g, mesh: e, rim: r, s, tilt: 0.2, meet: V() };
    placeEar(ear, 1);
    return ear;
  });

  // Eyes sit on the face surface and face along its normal.
  const disc = new THREE.CircleGeometry(1, 36);
  const IRIS_HEIGHT = 0.14;
  const dizzyEyeMat = new THREE.MeshBasicMaterial({ map: K.fxTexture('dizzyEye'), depthTest: false, transparent: true });
  const eyes = [-1, 1].map(s => {
    const lx = s * 0.235, ly = 0.04;
    const lz = R.z * Math.sqrt(Math.max(0, 1 - (lx / R.x) ** 2 - (ly / R.y) ** 2));
    const g = new THREE.Group();
    g.position.set(lx, ly, lz + 0.005);
    const normal = V(lx / (R.x * R.x), ly / (R.y * R.y), lz / (R.z * R.z)).normalize();
    g.quaternion.setFromUnitVectors(V(0, 0, 1), normal);
    const eyeMat = eyeMats[s < 0 ? 0 : 1];
    const iris = new THREE.Mesh(disc, eyeMat);
    iris.scale.set(0.155, IRIS_HEIGHT, 1);
    iris.renderOrder = 10;
    const pupil = new THREE.Mesh(disc, pupilMat);
    pupil.scale.set(0.05, 0.11, 1);
    pupil.position.z = 0.002;
    pupil.renderOrder = 11;
    // Catchlights, the big one up and towards the outside: the single biggest cuteness cue.
    // Three dots; how many show and how big depends on the chosen style (see SHINES).
    const shine = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(disc, shineMat);
      d.renderOrder = 12;
      shine.add(d);
    }
    const arc = new K.TaperTube(16, 6, lidMat, 11);
    arc.mesh.visible = false;
    const spiral = new THREE.Mesh(disc, dizzyEyeMat);
    spiral.scale.set(0.16, 0.16, 1);
    spiral.position.z = 0.004;
    spiral.renderOrder = 12;
    spiral.visible = false;
    g.add(iris, pupil, shine, arc.mesh, spiral);
    const blush = new THREE.Mesh(disc, blushMat);
    blush.scale.set(0.085, 0.048, 1);
    blush.position.set(s * 0.06, -0.15, 0.001);
    blush.renderOrder = 10;
    g.add(blush);
    head.add(g);
    const eye = { s, group: g, iris, pupil, shine, arc: arc.mesh, spiral, lid: arc, lidK: 0 };
    setLid(eye, 1);
    return eye;
  });
  // The closed eye's line: `k` 1 is the soft ‿ of a sleeping or contented cat, -1 the ^ of a happy
  // squeeze (a bit bolder), in between blends.
  function setLid(eye, k) {
    if (Math.abs(eye.lidK - k) < 0.02) return;
    eye.lidK = k;
    const bold = smooth(0.2, -1, k);
    eye.lid.update((t, out) => out.set(mix(-0.12, 0.12, t), -0.045 * k * Math.sin(t * Math.PI) + 0.0125 * (k - 1), 0.004),
      t => (0.011 + 0.004 * bold) + (0.006 + 0.004 * bold) * Math.sin(t * Math.PI));
  }

  // Whiskers: three thin strands per side, from the cheek out past the face.
  const whiskers = [];
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const tube = new K.TaperTube(10, 4, whiskerMat, 12);
    const y0 = -0.17 - i * 0.04, a = V(s * 0.31, y0, 0.4), c = V(s * 0.54, y0 + 0.012 - i * 0.014, 0.29),
      b = V(s * 0.74, y0 - 0.015 - i * 0.055, 0.13);
    tube.update((t, out) => out.set(
      (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
      (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
      (1 - t) ** 2 * a.z + 2 * (1 - t) * t * c.z + t * t * b.z), t => 0.006 * (1 - 0.5 * t));
    head.add(tube.mesh);
    whiskers.push(tube.mesh);
  }

  // Nose and mouth: a small rounded triangle and a "ω" under it. Black cats go without, as on
  // the reference, since they would not show.
  const faceZ = (x, y) => R.z * Math.sqrt(Math.max(0, 1 - (x / R.x) ** 2 - (y / R.y) ** 2));
  const face = new THREE.Group();
  {
    const NY = -0.15, nose = new THREE.Shape();
    nose.moveTo(-0.045, 0.012);
    nose.quadraticCurveTo(0, 0.026, 0.045, 0.012);
    nose.quadraticCurveTo(0.05, 0.004, 0.012, -0.024);
    nose.quadraticCurveTo(0, -0.032, -0.012, -0.024);
    nose.quadraticCurveTo(-0.05, 0.004, -0.045, 0.012);
    const noseMesh = new THREE.Mesh(new THREE.ShapeGeometry(nose, 10), noseMat);
    noseMesh.position.set(0, NY, faceZ(0, NY) + 0.006);
    noseMesh.quaternion.setFromUnitVectors(V(0, 0, 1), V(0, NY / (R.y * R.y), faceZ(0, NY) / (R.z * R.z)).normalize());
    noseMesh.scale.setScalar(1.2);
    noseMesh.renderOrder = 12;
    const mouth = new K.TaperTube(24, 4, mouthMat, 12);
    mouth.update((t, out) => {
      const x = mix(-0.07, 0.07, t), y = NY - 0.035 - 0.022 * Math.sin(Math.abs(x) / 0.07 * Math.PI);
      return out.set(x, y, faceZ(x, y) + 0.006);
    }, () => 0.0055);
    face.add(noseMesh, mouth.mesh);
  }
  head.add(face);

  // A yawn: the mouth opens into a big dark oval under the nose with a pink tongue, wider than
  // tall at first and then stretching down towards the chin, the way a chibi yawn is drawn.
  // Shown on every coat, black too, where the face itself is left off.
  const yawn = new THREE.Group();
  {
    const YY = -0.25;
    const inside = new THREE.Mesh(disc, overlay('#5b2128'));
    inside.scale.set(0.105, 0.1, 1);
    const edge = new THREE.Mesh(disc, overlay('#1d1d1b'));
    edge.scale.set(0.122, 0.117, 1);
    const tongue = new THREE.Mesh(disc, overlay('#ee8f98'));
    tongue.scale.set(0.07, 0.042, 1);
    tongue.position.y = -0.052;
    const fangs = [-1, 1].map(s => {
      const f = new THREE.Mesh(new THREE.CircleGeometry(1, 3), overlay('#fbfaf3'));
      f.scale.set(0.02, 0.03, 1);
      f.rotation.z = -Math.PI / 2;
      f.position.set(s * 0.055, 0.075, 0);
      return f;
    });
    edge.renderOrder = 13; inside.renderOrder = 14; tongue.renderOrder = 15;
    for (const f of fangs) f.renderOrder = 15;
    yawn.add(edge, inside, tongue, ...fangs);
    yawn.position.set(0, YY, faceZ(0, YY) + 0.008);
    yawn.quaternion.setFromUnitVectors(V(0, 0, 1), V(0, YY / (R.y * R.y), faceZ(0, YY) / (R.z * R.z)).normalize());
    yawn.scale.set(1, 0.001, 1);
    yawn.visible = false;
    yawn.userData.y = YY;
  }
  head.add(yawn);
  // Washing, the tip of the tongue comes out under the "ω" with each lick, down onto the paw.
  const lick = new THREE.Group();
  {
    const LY = -0.21;
    const tip = new THREE.Mesh(disc, overlay('#ee8f98'));
    const line = new THREE.Mesh(disc, overlay('#c9606e'));
    tip.scale.set(0.03, 1, 1); tip.position.y = -0.6;
    line.scale.set(0.038, 1.12, 1); line.position.y = -0.6;
    line.renderOrder = 13; tip.renderOrder = 14;
    lick.add(line, tip);
    lick.position.set(0, LY, faceZ(0, LY) + 0.01);
    lick.quaternion.setFromUnitVectors(V(0, 0, 1), V(0, LY / (R.y * R.y), faceZ(0, LY) / (R.z * R.z)).normalize());
    lick.visible = false;
  }
  head.add(lick);
  function setLick(out) {
    lick.visible = out > 0.02;
    lick.scale.set(1, 0.06 * Math.max(0.02, out), 1);
  }
  function setYawn(open) {
    yawn.visible = open > 0.02;
    yawn.scale.set(0.7 + 0.7 * open, Math.max(0.001, 1.8 * open), 1);
    // Opening wide, it grows downwards so the top stays clear of the nose.
    yawn.position.y = yawn.userData.y - 0.08 * open;
  }

  // Holiday outfits on the head and neck: a Santa hat, a witch's hat, a party hat for the day
  // the two of you met, a red scarf for the Spring Festival.
  const outfit = { kind: null };
  const hats = {};
  {
    const shellOf = (geo, color, grow, order) => {
      const m = new THREE.Mesh(geo, K.back(color));
      m.scale.setScalar(1 + grow);
      m.renderOrder = order;
      return m;
    };
    const cone = (r, h, color) => {
      const g = new THREE.ConeGeometry(r, h, 32);
      g.translate(0, h / 2, 0);
      const fill = new THREE.Mesh(g, K.flat(color));
      fill.renderOrder = 16;
      return [shellOf(g, '#1d1d1b', 0.07, 15), fill];
    };
    const ball = (r, color, y) => {
      const g = new THREE.SphereGeometry(r, 16, 12);
      const m = new THREE.Mesh(g, K.flat(color));
      m.position.y = y; m.renderOrder = 18;
      const ink = shellOf(g, '#1d1d1b', 0.22, 17);
      ink.position.y = y;
      return [ink, m];
    };
    const ring = (r, tube, color, order = 18) => {
      const g = new THREE.TorusGeometry(r, tube, 10, 32);
      g.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(g, K.flat(color));
      m.renderOrder = order;
      const ink = new THREE.Mesh(new THREE.TorusGeometry(r, tube + 0.012, 10, 32).rotateX(Math.PI / 2), K.back('#1d1d1b'));
      ink.renderOrder = order - 1;
      return [ink, m];
    };
    const make = (parts, x, y, tilt) => {
      const g = new THREE.Group();
      g.add(...parts);
      g.position.set(x, y, 0.02);
      g.rotation.set(-0.15, 0, tilt);
      g.visible = false;
      head.add(g);
      return g;
    };
    // Santa: a floppy red cone, white brim and bobble, tipped to one side between the ears.
    hats.xmas = make([...cone(0.28, 0.56, '#d9483b'), ...ring(0.28, 0.065, '#fbf9f3'), ...ball(0.085, '#fbf9f3', 0.56)], 0.06, 0.3, -0.38);
    // Witch: a wide flat brim, a tall black cone and a purple band.
    const brimGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.025, 40);
    const brim = new THREE.Mesh(brimGeo, K.flat('#2b2440')); brim.renderOrder = 16;
    hats.halloween = make([shellOf(brimGeo, '#f6f3e8', 0.06, 14), brim, ...cone(0.22, 0.6, '#2b2440'),
      ...ring(0.21, 0.035, '#9a6bd1', 19)], 0.04, 0.38, -0.25);
    // Party hat: a striped cone with a yellow pompom.
    const stripes = document.createElement('canvas');
    stripes.width = 64; stripes.height = 128;
    const sg = stripes.getContext('2d');
    ['#6eb2e6', '#fbf9f3', '#ee8fb4', '#fbf9f3', '#93c255', '#fbf9f3'].forEach((c, i) => { sg.fillStyle = c; sg.fillRect(0, i * 22, 64, 22); });
    const party = cone(0.21, 0.54, '#ffffff');
    party[1].material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(stripes) });
    hats.birthday = make([...party, ...ball(0.075, '#f2c94c', 0.54)], 0.05, 0.32, -0.3);
  }
  // The scarf rides with the collar on the neck: a thick red band and one end hanging down the
  // chest, swinging a little.
  const scarf = new THREE.Group();
  const scarfMat = K.towardEye(K.flat('#d9363e'), 0.07), scarfInk = K.towardEye(K.back('#1d1d1b'), 0.07);
  const scarfBand = K.limb(scarf, { segments: 40, radial: 10, fill: scarfMat, outline: scarfInk, order: 2, edge: 0.012 });
  const scarfEnd = K.limb(scarf, { segments: 12, radial: 10, fill: scarfMat, outline: scarfInk, order: 3, edge: 0.012 });
  const scarfR = () => collarR + 0.03;
  scarfBand.update((t, out) => {
    const a = mix(-1.45, 1.45, t);
    return out.set(Math.sin(a) * scarfR(), 0.02 * (1 - Math.cos(a)), Math.cos(a) * scarfR() * 0.86);
  }, t => 0.06 * (0.35 + 0.65 * smooth(0, 0.2, Math.min(t, 1 - t))));
  const swingEnd = swing => scarfEnd.update((t, out) => out.set(0.16 + 0.05 * t + swing * t * t, -0.36 * t, scarfR() * 0.86 + 0.06 + 0.05 * t),
    t => 0.05 - 0.008 * t);
  swingEnd(0);
  scarf.visible = false;
  collar.add(scarf);

  // Tail in world space: the root follows the body, the tip mostly stays put when the cat leans.
  const tailPts = [V(0.42, 0.42, -0.25), V(0.72, 0.24, -0.3), V(0.98, 0.3, -0.32), V(1.12, 0.52, -0.3),
    V(1.13, 0.76, -0.28), V(1.02, 0.9, -0.26)];
  const tailSleep = [V(0.42, 0.12, -0.25), V(0.85, 0.1, -0.15), V(1.05, 0.1, 0.1), V(1.0, 0.1, 0.35),
    V(0.82, 0.1, 0.5), V(0.6, 0.1, 0.55)];
  // Annoyed: the tail lies out along the desk and its far half is lifted and slammed down.
  const tailThump = [V(0.42, 0.36, -0.25), V(0.7, 0.16, -0.24), V(0.94, 0.07, -0.14), V(1.12, 0.05, -0.02),
    V(1.28, 0.05, 0.06), V(1.42, 0.06, 0.1)];
  // Lying, the tail leaves from the rump (this point, in sitting terms) and goes where the pose
  // says (`lying.tail`: the points after the root, in body space).
  const TAIL_ROOT_LIE = V(0.04, -0.16, -0.16);
  // The tail itself is a chain of equal links, so it keeps its length whatever the pose: a pose
  // only gives the shape it should take (`tailWant`). A bending wave runs out along it from the
  // root, and each link follows its place with a lag that grows towards the tip, so the tip
  // trails, overshoots and settles the way a real tail does.
  const TAIL_N = 12, TAIL_LEN = 1.25, LINK = TAIL_LEN / TAIL_N;
  const tailWant = new THREE.CatmullRomCurve3(tailPts.map(q => q.clone()), false, 'catmullrom', 0.5);
  const tailCurve = new THREE.CatmullRomCurve3(Array.from({ length: TAIL_N + 1 }, () => V()), false, 'catmullrom', 0.5);
  const chain = tailCurve.points.map(() => V()), chainPrev = chain.map(() => V()), chainGoal = chain.map(() => V());
  let chainFresh = true;
  const linkA = V(), linkB = V(), linkDir = V(), bendAxis = V(), bendQ = new THREE.Quaternion(), bendStep = new THREE.Quaternion();
  const tail = K.limb(K.scene, { segments: 28, radial: 14, fill: fur.tail, outline: rimMat, edge: 0.022, capStart: false });
  const attached = V(0, 0, 0), loose = V(0, 0, 0), tmpTail = V(0, 0, 0);

  // Arms live in world space so the paws can reach keys and the mouse wherever the body leans.
  const arms = [-1, 1].map(s => {
    // The outline only starts once the arm is clear of the chest, so the shoulder flows into the
    // body without a seam and the line draws in along the upper arm.
    const line = { outer: false };
    const limb = K.limb(K.scene, { segments: 24, radial: 18, fill: fur.arms[s < 0 ? 0 : 1], outline: armRimMat, order: 20,
      edge: t => line.outer ? 0.022 : mix(-0.03, 0.012, smooth(0.14, 0.42, t)) });
    limb.line = line;
    const { paw, rim } = makePaw(K.scene, 20);
    // Shoulders sit inside the chest, so a hanging arm only shows below the middle of the body.
    return { s, limb, paw, rim, shoulderLocal: V(s * 0.27, 0.94, 0.22), shoulder: V(0, 0, 0),
      c1: V(0, 0, 0), c2: V(0, 0, 0), hand: V(0, 0, 0) };
  });

  // Each arm is a cubic curve: the upper arm drops from the shoulder and bows out at the elbow,
  // the forearm comes down onto the paw from above. Thick and soft at the shoulder, slimmer
  // forearm, a little fuller again at the wrist.
  const armTmp = V(0, 0, 0), armC = V(0, 0, 0), armQ = new THREE.Quaternion();
  const PAW_H = 0.085;
  const armRadius = t => mix(0.135, 0.092, smooth(0, 0.72, t)) + 0.014 * smooth(0.8, 1, t);
  // Lying, the foreleg is two bones of fixed length, so it bends at the elbow instead of
  // stretching: the elbow goes down onto whatever the arm lies on and a little out to the side,
  // and the forearm rises from there to the paw. For a paw further than the leg reaches, the
  // shoulder blade slides forward (up to GLIDE) and then the leg straightens.
  const UPPER = 0.44, FORE = 0.5, GLIDE = 0.36;
  const armE = V(0, 0, 0), armU = V(0, 0, 0), armP = V(0, 0, 0), armO = V(0, 0, 0);
  function lyingElbow(arm, a, b, w, out) {
    const reach = UPPER + FORE;
    let d = a.distanceTo(b);
    armU.subVectors(b, a).normalize();
    if (d > reach * 0.96) { a.addScaledVector(armU, Math.min(GLIDE, d - reach * 0.96) * w); d = a.distanceTo(b); }
    d = Math.min(d, reach * 0.999);
    const x = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d), h = Math.sqrt(Math.max(0, UPPER * UPPER - x * x));
    armO.copy(a).addScaledVector(armU, x);
    armP.set(arm.s * 0.55, -1, -0.3);
    armP.addScaledVector(armU, -armP.dot(armU)).normalize();
    out.copy(armO).addScaledVector(armP, h);
    // Never through what it lies on: lift the elbow round its circle until it rests on top.
    const floor = (lying.floor ? lying.floor(out.x, out.z) : 0) + 0.08;
    if (out.y < floor) {
      armP.subVectors(out, armO);
      armP.y += floor - out.y;
      armP.addScaledVector(armU, -armP.dot(armU));
      if (armP.lengthSq() > 1e-8) out.copy(armO).addScaledVector(armP.normalize(), h);
    }
    return out;
  }
  // `hang` (0..1): lying, how limp the wrist is (see below). `elbow`: lying, { at, k }, an elbow
  // put down at `at` (world) on purpose, `k` how far. `aim`: lying, a paw
  // turned on purpose, { toes, top, k } (world directions, `k` how far), such as a sole held up
  // to you.
  // The wrist is thicker than the paw is deep, so an arm that simply ends where the paw is would
  // show its round end under the paw and round its toes. Instead the end is drawn back up the
  // forearm just far enough that the front half of it (the back half is inside the arm) lies
  // within the paw, fill in fill and outline in outline. Above the paw is fine: that is the arm
  // coming down onto it. The paw stays where it was put, so the arm always runs into it.
  const capDirs = [];
  for (let i = 0; i < 24; i++) {
    const z = (i + 0.5) / 24, r = Math.sqrt(1 - z * z), a = i * 2.39996;
    capDirs.push(V(r * Math.cos(a), r * Math.sin(a), z));
  }
  const capQ = new THREE.Quaternion(), pawInv = new THREE.Quaternion(), capP = V(0, 0, 0);
  const capZ = V(0, 0, 1), END_BACK = 0.14;
  // How many of the end's front points stick out of the paw, with the end `k` back from `b`.
  function capOutside(paw, b, d, k, r, edge) {
    let n = 0;
    for (const [rad, grow] of [[r, 0], [r + edge, 0.013]]) {
      for (const dir of capDirs) {
        capP.copy(dir).applyQuaternion(capQ).multiplyScalar(rad).addScaledVector(d, -k).add(b)
          .sub(paw.position).applyQuaternion(pawInv);
        // Back into the unit sphere the paw bean was made from (see pawGeo).
        const z = capP.z / (paw.scale.z + grow), y = capP.y / (paw.scale.y + grow);
        const x = capP.x / (paw.scale.x + grow) / (1 + 0.12 * z);
        if (x * x + z * z + (y < 0 ? (y / 0.45) ** 2 : 0) > 1) n++;
      }
    }
    return n;
  }
  function endInPaw(arm, b, d, r, edge) {
    capQ.setFromUnitVectors(capZ, d);
    pawInv.copy(arm.paw.quaternion).invert();
    let best = 0, fewest = Infinity;
    for (let k = 0; k <= END_BACK + 1e-6; k += 0.02) {
      const n = capOutside(arm.paw, b, d, k, r, edge);
      if (n === 0) {
        // Then narrow it down, so the end slides smoothly as the paw moves.
        let lo = Math.max(0, k - 0.02), hi = k;
        if (k > 0) for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          if (capOutside(arm.paw, b, d, mid, r, edge) === 0) hi = mid; else lo = mid;
        }
        return hi;
      }
      if (n < fewest) { fewest = n; best = k; }
    }
    return best;
  }

  function updateArm(arm, pawPos, hang = 0, elbow = null, aim = null, clench = 0, keyPose = 0) {
    attach(arm.shoulderLocal, arm.shoulder);
    arm.hand.copy(pawPos);
    const a = arm.shoulder, b = arm.hand;
    const reach = a.distanceTo(b);
    // A short reach folds the arm, so the elbow sticks out more. A long one swings the upper arm
    // out towards the paw from the shoulder, instead of dropping straight down first.
    const fold = K.clamp(1.4 - reach / 0.9, 0.25, 1);
    const swing = K.smooth(0.7, 1.3, reach);
    arm.c1.set(a.x + arm.s * 0.1 * fold + (b.x - a.x) * mix(0.15, 0.4, swing), a.y - reach * mix(0.32, 0.2, swing),
      a.z + 0.06 + (b.z - a.z) * 0.25);
    arm.c2.set(b.x - (b.x - a.x) * 0.12, b.y + reach * 0.3, b.z - (b.z - a.z) * 0.18);
    const { c1, c2 } = arm;
    // Lying, nothing holds the arm up but what it lies on. A paw resting on the keys (`hang` 0):
    // a fairly straight arm out along them. A limp one (`hang` 1): the arm leaves the shoulder
    // level, or rises if the paw is up, and the forearm drops onto the paw from above, so a paw
    // over an edge hangs straight down off the wrist and one held over the chest flops over.
    const bodyLie = lieAt(arm.shoulderLocal.y);
    const w = bodyLie * (1 - keyPose);
    outlineOutside(arm.limb, bodyLie > 0.5, armRimMat, 19);
    if (w > 0) {
      // Through the elbow (the pose's, or the two bones'), leaving the shoulder along the upper
      // arm and arriving along the forearm: control points 4/3 of the way to the elbow put the
      // middle of the curve on it.
      const e = lyingElbow(arm, a, b, w, armE);
      if (elbow && elbow.k > 0) e.lerp(elbow.at, elbow.k);
      c1.lerp(armC.subVectors(e, a).multiplyScalar(4 / 3).add(a), w);
      c2.lerp(armC.subVectors(e, b).multiplyScalar(4 / 3).add(b), w);
    }
    // Sitting, a paw turned on purpose (held up to the mouth to wash) is reached from below: the
    // elbow comes forward off the chest and the forearm rises along the toes into the wrist.
    const held = aim ? aim.k * (1 - bodyLie) * (1 - keyPose) : 0;
    if (held > 0) {
      c1.z += 0.14 * held;
      c2.lerp(armC.copy(aim.toes).normalize().multiplyScalar(-0.32 * reach).add(b), held);
    }
    // The paw points the way the forearm travels, and sits just past the end of the arm.
    const yaw = Math.atan2(b.x - c2.x, b.z - c2.z);
    arm.paw.position.copy(b);
    arm.paw.scale.set(0.135, PAW_H, 0.13);
    arm.paw.rotation.set(0, yaw, 0);
    if (held > 0) arm.paw.quaternion.slerp(pawBasis(aim.toes, armQ, aim.top), held);
    if (w > 0) {
      // Off the end of the forearm, curled a little towards you so its toes show, and on past the
      // wrist, so the arm runs into its heel instead of showing through the middle of it.
      armTmp.subVectors(b, c2).normalize();
      // Folded up, a limp wrist lets the paw drop forward and down off the end of the forearm.
      if (elbow) armTmp.multiplyScalar(0.5).add(armC.set(0, -1, 0.6).multiplyScalar(hang));
      else armTmp.z += 0.9 * hang;
      arm.paw.quaternion.slerp(pawBasis(armTmp, armQ), w);
      armTmp.normalize();
      let past = 0.08;
      if (aim && aim.k > 0) {
        arm.paw.quaternion.slerp(pawBasis(aim.toes, armQ, aim.top), aim.k * w);
        armTmp.lerp(aim.toes, aim.k).normalize();
        // A turned paw hangs from the wrist by its heel and sits just in front of the arm's end,
        // so the end of the arm never shows through it as a dark spot.
        past = mix(0.08, 0.12, aim.k);
        arm.paw.position.addScaledVector(armC.subVectors(K.camera.position, b).normalize(), 0.05 * aim.k * w);
      }
      arm.paw.position.addScaledVector(armTmp, past * w);
    }
    shapePaw(arm.paw, clench);
    arm.rim.position.copy(arm.paw.position);
    arm.rim.quaternion.copy(arm.paw.quaternion);
    arm.rim.scale.copy(arm.paw.scale).addScalar(0.013);
    const radius = w > 0 && hang > 0 ? t => armRadius(t) * (1 - 0.18 * hang * w * smooth(0.2, 0.6, t)) : armRadius;
    const d = armTmp.subVectors(b, c2).normalize();
    const k = endInPaw(arm, b, d, radius(1), arm.limb.line.outer ? 0.022 : 0.012);
    const end = armE.copy(b).addScaledVector(d, -k);
    c2.addScaledVector(d, -k);
    arm.limb.update((t, out) => {
      const u = 1 - t;
      return out.set(
        u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
        u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
        u * u * u * a.z + 3 * u * u * t * c1.z + 3 * u * t * t * c2.z + t * t * t * end.z);
    }, radius);
  }

  // Space bar easter egg: the tail sweeps out past the hip, round the side and in over the near
  // edge of the board, and its tip pats the key. `tip` is the world point the tip should touch.
  const reachPath = [V(), V(), V(), V(), V()];
  function reachTail(root, tip) {
    reachPath[0].set(root.x + 0.36, 0.3, root.z + 0.14);
    reachPath[1].set(tip.x + 0.34, 0.31, mix(root.z, tip.z, 0.55));
    reachPath[2].set(tip.x + 0.24, 0.33, tip.z - 0.06);
    reachPath[3].set(tip.x + 0.11, mix(0.33, tip.y + 0.02, 0.5), tip.z + 0.02);
    reachPath[4].copy(tip);
  }

  // `thump` blends in the annoyed pose, `lift` (0..1) raises its far half, `lash` swings it sideways.
  // `reach` (0..1) blends in the space bar pat towards `reachTip`. `lie` (0..1) blends in the
  // lying pose, `wrap` (0..1) curls the tail round the front as when asleep (a cold winter cat).
  // `sway` is how lively the wave is, `dt` the frame time for the lag.
  function updateTail(time, sway, sleep, thump = 0, lift = 0, lash = 0, reach = 0, reachTip = null, lie = 0, wrap = 0, dt = 1 / 60) {
    body.updateMatrixWorld();
    const want = tailWant.points;
    const baseFollow = lying.tailWag === null ? mix(0.6, 1, lying.tailBaseFollow) : 1;
    for (let i = 0; i < tailPts.length; i++) {
      const w = i / (tailPts.length - 1);
      const local = want[i].lerpVectors(tailPts[i], tailSleep[i], Math.max(sleep, wrap));
      if (lie > 0 && i === 0) local.lerp(TAIL_ROOT_LIE, lie);
      if (thump > 0) {
        tmpTail.copy(tailThump[i]);
        tmpTail.y += lift * 1.05 * w ** 1.4;
        tmpTail.x -= lift * 0.22 * w ** 2;
        tmpTail.z += lash * 0.35 * w ** 1.5;
        local.lerp(tmpTail, thump);
      }
      attach(local, attached);
      loose.copy(local).add(HOME).addScaledVector(body.position, 0.3).addScaledVector(HOME, -0.3);
      local.lerpVectors(attached, loose, K.smooth(0.1, 0.7, w) * (1 - lie));
      if (lie > 0 && i > 0 && lying.tail) {
        tmpTail.copy(lying.tail[i - 1]).add(body.position);
        local.lerp(tmpTail, lie * (i === 1 ? baseFollow : 1));
      }
    }
    if (reach > 0 && reachTip) {
      reachTail(want[0], reachTip);
      // The point next to the root only bends part of the way, so the tail leaves the body smoothly.
      for (let i = 1; i < want.length; i++) want[i].lerp(reachPath[i - 1], reach * (i === 1 ? 0.6 : 1));
    }
    tailWant.updateArcLengths();

    // Where each link should be: the pose's shape at the tail's own length, bent by the wave. A
    // slow sweep from side to side and a curl that grows towards the tip, both starting at the
    // root and travelling out. Lying, the sweep is smaller and the tip does most of the moving.
    const g = chainGoal, amp = sway * (1 - 0.45 * lie), tip = amp + 0.6 * lie * (1 - sleep);
    const hips = lie > 0 && (lying.tailWag || lying.tailExtend) ? frameAt(TAIL_ROOT_LIE.y) : null;
    const leftSweep = hips ? Math.max(0, lying.tailWag) / (Math.PI / 2) : 0;
    tailWant.getPointAt(0, g[0]);
    bendQ.identity();
    for (let i = 1; i <= TAIL_N; i++) {
      const w = i / TAIL_N;
      tailWant.getPointAt((i - 1) / TAIL_N, linkA);
      tailWant.getPointAt(w, linkB);
      linkDir.subVectors(linkB, linkA).normalize();
      bendQ.premultiply(bendStep.setFromAxisAngle(Y_UP, 0.05 * amp * (1 - 0.6 * lie) * Math.sin(time * 1.6 - i * 0.45)));
      bendAxis.crossVectors(linkDir, Y_UP);
      if (bendAxis.lengthSq() < 1e-4) bendAxis.set(0, 0, 1);
      bendQ.premultiply(bendStep.setFromAxisAngle(bendAxis.normalize(), 0.06 * tip * w * w * Math.sin(time * 1.3 - i * 0.6)));
      linkDir.applyQuaternion(bendQ);
      if (hips) {
        const tipWeight = smooth(0.6, 0.90, w);
        const pitch = linkDir.dot(hips.T);
        linkDir.addScaledVector(hips.T, (0.10 - pitch) * lying.tailExtend * tipWeight).normalize();
        // Sweep the base sideways and gradually turn the curl around the spine at the tip.
        bendAxis.lerpVectors(hips.F, hips.T, smooth(0.30, 0.72, w)).normalize();
        const sweepWeight = mix(smooth(0.08, 0.90, w), tipWeight, 0.46);
        const sweep = lying.tailWag * (leftSweep > 0 ? 0.72 : 1);
        linkDir.applyAxisAngle(bendAxis, sweep * sweepWeight);
        if (leftSweep > 0) {
          // Open the middle and tip into one arc, keeping a little curl at the tip.
          const arcAngle = 1.32 * smooth(0.18, 1, w);
          bendAxis.copy(hips.S).multiplyScalar(0.59).addScaledVector(hips.F, 0.81)
            .multiplyScalar(Math.sin(arcAngle)).addScaledVector(hips.T, -Math.cos(arcAngle));
          linkDir.lerp(bendAxis, 0.90 * leftSweep ** 1.5 * smooth(0.18, 0.65, w)).normalize();
        }
      }
      g[i].copy(g[i - 1]).addScaledVector(linkDir, LINK);
    }

    // The links: pulled towards their places (harder near the root), carrying on with what speed
    // they had, and held at their length from the link before, so the tail never stretches.
    if (chainFresh || dt > 0.25 || chain[0].distanceToSquared(g[0]) > 0.04) {
      chain.forEach((q, i) => { q.copy(g[i]); chainPrev[i].copy(g[i]); });
      chainFresh = false;
    } else {
      const f = Math.min(dt * 60, 3), keep = Math.pow(0.86, f);
      chain[0].copy(g[0]);
      for (let i = 1; i <= TAIL_N; i++) {
        const q = chain[i];
        linkA.subVectors(q, chainPrev[i]).multiplyScalar(keep);
        chainPrev[i].copy(q);
        q.add(linkA).lerp(g[i], 1 - Math.pow(1 - mix(0.5, 0.17, i / TAIL_N), f));
        q.sub(chain[i - 1]).setLength(LINK).add(chain[i - 1]);
        if (q.y < 0.05) q.y = 0.05;
      }
    }
    // Patting the space bar the tip has to land on the key itself, so there it follows the pose.
    const pts = tailCurve.points;
    for (let i = 0; i <= TAIL_N; i++) {
      pts[i].copy(chain[i]);
      if (reach > 0) pts[i].lerp(tailWant.getPointAt(i / TAIL_N, linkA), reach);
    }
    tail.update((t, out) => tailCurve.getPoint(t, out), t => mix(0.085, 0.068, t) + 0.014 * K.smooth(0.8, 1, t));
  }

  // Coats, drawn from real cats but drawn the way the black one is: flat fills with crisp edges,
  // a few bold markings instead of texture, one outline colour (`rim`) round the whole cat and a
  // warmer shade of it (`ink`, `arm`) for the lines inside. Each has its own nose, inner ear, muzzle
  // and bib colours, and the `eye` it most often has. `tabby` lists the stripe colour for coats that
  // can be striped, and `striped` ones wear the stripes unless the pattern is set to solid. `point`
  // and `points` give the dark mask, ears, legs and tail of colourpoint breeds, and `ears` scales the
  // ears. `cheek` is a faint pink flush on the pale coats (dark fur would only muddy it). `shade` is
  // the soft volume shading of the 3D style; black stays a flat silhouette like the reference.
  const COATS = {
    black: { fur: '#151515', ink: '#151515', rim: '#f6f3e8', arm: '#8a8984', paw: '#1d1d1c', toe: '#4a4a46', whisker: '#dedcd4', eye: 'gold' },
    tuxedo: { fur: '#1a1a1a', ink: '#151515', lid: '#e4c25a', rim: '#f6f3e8', arm: '#8a8984', paw: '#f8f7f2', toe: '#bcbab2', whisker: '#e8e6de', eye: 'green',
      light: '#f8f7f2', muzzle: 1, tuxedo: 1, nose: '#e7a0a0', mouth: '#9a8f88', inner: '#3a2e2e', innerAmt: 1, shade: 0.25 },
    orange: { fur: '#f2a65e', ink: '#b86f33', lid: '#8a4a1f', rim: '#fff8ea', arm: '#c47a3a', paw: '#fff6e8', toe: '#e6bf98', whisker: '#fffaf0', eye: 'green',
      light: '#fff1dc', muzzle: 1, bib: 1, nose: '#ef8a80', mouth: '#a5643a', inner: '#f7b9a8', innerAmt: 1, shade: 0.55,
      tabby: '#d0752f', striped: true, cheek: 0.3 },
    grey: { fur: '#9aa7b8', ink: '#6a7687', lid: '#3d4450', rim: '#f6f5f0', arm: '#6f7b8c', paw: '#f2f1ec', toe: '#c3c8ce', whisker: '#f4f2ea', eye: 'copper',
      light: '#c9d1dc', muzzle: 1, bib: 0.6, nose: '#8a8494', mouth: '#5a6575', inner: '#d9b8bf', innerAmt: 1, shade: 0.55,
      tabby: '#7b889a', cheek: 0.3 },
    britishBlueGolden: { fur: '#ddbd9c', tip: '#8d9bb0', light: '#fff0dc', dark: '#65738b', brow: 0.82,
      ink: '#b99c87', lid: '#7d7782', rim: '#f5eddf', arm: '#b89d85', paw: '#f1dac0', toe: '#c9aa95',
      pad: '#d69ca1', whisker: '#fff3e5', eye: 'olive', nose: '#c58385', mouth: '#9b7376',
      muzzle: 0.92, inner: '#e9b3b4', innerAmt: 0.88, shade: 0.45, cheek: 0.18,
      ears: 0.80, headWidth: 1.075, irisHeight: 0.15 },
    white: { fur: '#fbf9f3', ink: '#b3a594', lid: '#8a7f72', rim: '#8f7f6e', arm: '#bdb09f', paw: '#fbf9f3', toe: '#e6cfc8', whisker: '#b6ada0', eye: 'blue',
      nose: '#f29ca0', mouth: '#c99c94', inner: '#f7bfc2', innerAmt: 1, shade: 0.5, cheek: 0.4 },
    calico: { fur: '#fbf8f1', ink: '#b3a594', lid: '#6e5a4e', rim: '#8f7f6e', arm: '#bdb09f', paw: '#fbf8f1', toe: '#e6cfc8', whisker: '#b6ada0', eye: 'gold',
      patchA: '#ee9c4f', patchB: '#3a302b', calico: 1, nose: '#f0a09a', mouth: '#b08a80', inner: '#f4bab4', innerAmt: 1, shade: 0.5, cheek: 0.35 },
    // Seal point: cream body, dark brown mask, ears, boots and tail, each with a clean edge.
    siamese: { fur: '#f3e8d6', ink: '#a48b76', rim: '#8f7a66', arm: '#a48b76', paw: '#5e4436', toe: '#3e2c23', pad: '#2f211b', whisker: '#f3ece0', eye: 'blue',
      point: '#5a3f31', points: 1, nose: '#2f211b', mouth: '#24180f', inner: '#7a5c4c', innerAmt: 1, shade: 0.45 },
    // Seal bicolour: softer points, white inverted V on the face, white chest and mitts.
    ragdoll: { fur: '#f6efe4', ink: '#ab9583', rim: '#8f7f6e', arm: '#ab9583', paw: '#fdfbf7', toe: '#ddd2c6', whisker: '#cfc4b6', eye: 'blue',
      point: '#7a5a48', points: 1, light: '#fdfbf7', muzzle: 1, tuxedo: 1, bib: 1, nose: '#ec9fa0', mouth: '#a07e70', inner: '#a8806f', innerAmt: 1, shade: 0.5,
      cheek: 0.3 },
    // Devon rex: big low-set ears and big eyes, here in a soft lilac.
    devon: { fur: '#c6b8c3', ink: '#8f808b', lid: '#5b5156', rim: '#fbf9f6', arm: '#94858f', paw: '#f2edf0', toe: '#cdc2c8', whisker: '#fbf9f6', eye: 'gold',
      light: '#e6dde3', muzzle: 1, ears: 1.45, nose: '#e0a0a8', mouth: '#7f7479', inner: '#f2bcc6', innerAmt: 1, shade: 0.5, cheek: 0.35 },
    // American shorthair: silver with black tabby stripes.
    silver: { fur: '#cfd4d9', ink: '#878d94', lid: '#3f444a', rim: '#fbfbf8', arm: '#8a9097', paw: '#f3f4f4', toe: '#bcc2c8', whisker: '#fbfbf8', eye: 'green',
      light: '#f3f4f4', muzzle: 1, bib: 0.8, nose: '#d79395', mouth: '#6c7279', inner: '#eebcc0', innerAmt: 1, shade: 0.55,
      tabby: '#50555c', striped: true, cheek: 0.3 },
    // Chinese li hua: brown mackerel tabby.
    lihua: { fur: '#c29c6c', ink: '#80623f', lid: '#3d2f22', rim: '#fff8ec', arm: '#86684a', paw: '#f2e9d8', toe: '#d2bd9c', whisker: '#fff8ec', eye: 'green',
      light: '#f0e5d0', muzzle: 1, bib: 0.7, nose: '#c27a66', mouth: '#5e4836', inner: '#e2ad98', innerAmt: 1, shade: 0.55,
      tabby: '#6b5038', striped: true, cheek: 0.25 },
  };
  const EYES = { gold: '#dcb64a', green: '#93c255', olive: '#b0c378', blue: '#6eb2e6', amber: '#e59a32', copper: '#d9792f' };
  // Catchlight dots per style: [x (outer side +), y, radius].
  const SHINES = {
    none: [],
    classic: [[0.04, 0.05, 0.03], [-0.035, -0.045, 0.014]],
    sparkle: [[0.035, 0.045, 0.042], [-0.04, -0.045, 0.02], [0.06, -0.03, 0.011]],
  };
  const COLLARS = { red: '#d9483b', blue: '#4f8fd8', pink: '#ee8fb4', green: '#5fae6a' };
  // eye: 'auto' follows the coat; 'odd' is one blue and one gold eye.
  // style: '2d' is flat colour like a sticker; '3d' adds soft volume shading.
  // What the current coat brings beyond the materials: the resting cheek flush.
  const coat = { cheek: 0 };
  // `softPoints`: colourpoint coats fade into their points instead of a crisp cut-paper edge.
  // `cable`, `board` and `opacity` are for the desk and the whole picture: the mouse cord, the
  // keyboard's colours, and how see-through everything is (so the text under it shows).
  const look = { style: '2d', coat: 'black', pattern: 'auto', eye: 'auto', shine: 'classic', blush: false, whiskers: true, collar: 'none',
    softPoints: false, cable: true, board: 'cream', opacity: 1, gloves: 'auto' };
  // 手套颜色: the paws' colour and their toe creases. 'auto' is the coat's own (black paws on a
  // black cat, white socks on a tuxedo).
  const GLOVES = { white: { paw: '#f7f6f0', toe: '#b9b7ae' }, black: { paw: '#1d1d1c', toe: '#4a4a46' },
    pink: { paw: '#f7c9d3', toe: '#d998a7' } };
  function setLook(o) {
    Object.assign(look, o);
    const c = COATS[look.coat] || COATS.black;
    const striped = c.tabby && (look.pattern === 'tabby' || (look.pattern === 'auto' && c.striped));
    const solid = look.style === '3d';
    coat.cheek = c.cheek || 0;
    K.setFur({ ...c, dark: c.tabby || c.dark || c.fur, stripes: striped ? 1 : 0, softPoints: look.softPoints ? 1 : 0, shade: solid ? c.shade : 0 });
    // Big ears lean further out, set low and wide on the head as a Devon's are.
    for (const e of ears) placeEar(e, c.ears || 1);
    head.scale.x = c.headWidth || 1;
    K.mouseProp.setStyle(look.style);
    K.mouseProp.setCable(look.cable !== false);
    K.keyboard.setTheme(look.board);
    K.renderer.domElement.style.opacity = K.clamp(Number(look.opacity) || 1, 0.3, 1);
    chinLine.visible = !solid;
    chinMat.uniforms.uColor.value.set(c.ink || c.arm);
    rimMat.color.set(c.rim);
    armRimMat.color.set(c.arm);
    const glove = GLOVES[look.gloves] || c;
    pawMat.color.set(glove.paw);
    padMat.color.set(c.pad || '#f19aa6');
    toeMat.color.set(glove.toe);
    whiskerMat.color.set(c.whisker);
    noseMat.color.set(c.nose || c.fur);
    mouthMat.color.set(c.mouth || c.fur);
    face.visible = !!c.nose;
    const eye = look.eye === 'auto' ? c.eye : look.eye;
    eyeMats[0].color.set(EYES[eye === 'odd' ? 'blue' : eye] || EYES.gold);
    eyeMats[1].color.set(EYES[eye === 'odd' ? 'gold' : eye] || EYES.gold);
    lidMat.color.set(c.lid || eyeMats[0].color);
    for (const e of eyes) {
      e.iris.scale.y = c.irisHeight || IRIS_HEIGHT;
      const dots = SHINES[look.shine] || SHINES.classic;
      e.shine.children.forEach((d, i) => {
        d.visible = i < dots.length;
        if (d.visible) { d.position.set(e.s * dots[i][0], dots[i][1], 0.004); d.scale.set(dots[i][2], dots[i][2], 1); }
      });
    }
    for (const w of whiskers) w.visible = look.whiskers;
    if (look.collar in COLLARS) collarMat.color.set(COLLARS[look.collar]);
    setOutfit(outfit.kind);
  }

  // `kind`: 'xmas', 'halloween', 'birthday', 'cny' or null. The scarf takes the collar's place.
  function setOutfit(kind) {
    outfit.kind = kind;
    for (const [k, hat] of Object.entries(hats)) hat.visible = k === kind;
    const wearsScarf = kind === 'cny', wearsCollar = look.collar in COLLARS && !wearsScarf;
    scarf.visible = wearsScarf;
    for (const part of collarParts) part.visible = wearsCollar;
    collar.visible = wearsScarf || wearsCollar;
    placeCollar();
  }

  // The head rides on the bent neck; called after `bend` changes.
  const NECK = headPivot.position.clone();
  function placeHead(followSpine) {
    place(NECK.x, NECK.y, NECK.z, headPivot.position);
    if (followSpine) {
      const [a, b, f] = sampleAt(NECK.y);
      headPivot.quaternion.copy(a.q).slerp(b.q, f);
    }
    // Sitting, the head grows out of the chest with no line between them. Lying over the keys
    // the head is in front of the body rising behind it, so its outline is drawn over the body
    // too (as the ears' always is), and head and ears read as one shape against the back.
    headRim.renderOrder = lying.amount > 0.5 ? 0.5 : -1;
  }

  K.cat = {
    body, home: HOME, headPivot, head, ears, eyes, whiskers, hind, arms, blushMat,
    bend, bendBody, attach, placeHead, placeCollar, lying, frameAt, lieAt, NECK_S: NECK.y,
    // World position of the tail tip (for the thump effects).
    tailTip: out => tailCurve.getPoint(1, out),
    tailPoints: tailCurve.points,
    petMeshes: [headMesh, ...ears.map(e => e.mesh)],
    dragMeshes: [bodyMesh, tail.body, ...arms.flatMap(a => [a.limb.body, a.paw]), ...hind],
    updateArm, updateTail, turnEar, setLook, look, coat, setYawn, setLick, kickHind, setOutfit, outfit, setLid,
    swingScarf: swingEnd,
    // The collar ring, the outline of the body, at a given height (for placing things on the chest).
    radiusAt,
  };
  setLook({});
})();
