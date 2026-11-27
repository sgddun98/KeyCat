// Breed proportions and the dog muzzle, mounted on the shared head and body rig.
'use strict';
(() => {
  const { V, mix, smooth } = K;
  const collieFeatures = {
    ears: 0.93, earHeight: 1.07, earTilt: 0.18, earSpread: 0.050,
    pointedEars: 'roundedTip', earSweep: 0.068, earTipFold: true,
    puppySmile: 'soft',
    eyes: { at: V(0.221, 0.044, 0.442), width: 0.69, height: 0.64, tilt: 0.10, gaze: 0.94,
      pupilWidth: 0.106, catchlights: [[0.034, 0.045, 0.030], [-0.030, -0.036, 0.012]] },
  };
  K.dogBreeds = new Map([
    ['husky', {
      headWidth: 0.99, bodyWidth: 0.98, bodyDepth: 1.05, sitLow: 0.035,
      ears: 1.05, earHeight: 1.21, earTilt: 0.15, muzzle: V(1, 1, 1),
      shoulder: V(0.29, 0.91, 0.23), pawWidth: 1.04, tailLength: 1.14, tailRadius: 0.155,
      tail: [V(0.34, 0.39, -0.32), V(0.55, 0.40, -0.48), V(0.80, 0.52, -0.50),
        V(0.99, 0.77, -0.45), V(1.03, 1.02, -0.35), V(0.91, 1.18, -0.22)],
    }],
    ['corgi', {
      headWidth: 1.10, bodyWidth: 1.12, bodyDepth: 1.14, sitLow: 0.17,
      ears: 1.17, earHeight: 1.34, earTilt: 0.30, roundedEars: true, muzzle: V(1.04, 0.91, 0.88),
      shoulder: V(0.30, 0.79, 0.27), pawWidth: 1.12, tailLength: 0.65, tailRadius: 0.112,
      tail: [V(0.40, 0.30, -0.29), V(0.53, 0.31, -0.38), V(0.65, 0.34, -0.44),
        V(0.78, 0.40, -0.45), V(0.88, 0.47, -0.43), V(0.92, 0.53, -0.40)],
    }],
    ['malamute', {
      ...collieFeatures,
      headWidth: 1.08, headHeight: 1.13, bodyWidth: 1.14, bodyDepth: 1.18, sitLow: 0.06,
      muzzle: V(1.055, 0.99, 1.025), muzzleLift: 0.019, headProfile: 'rounded', neckRuff: 0.14,
      shoulder: V(0.31, 0.93, 0.25), pawWidth: 1.18, tailLength: 1.15, tailRadius: 0.201,
      tail: [V(0.42, 0.38, -0.36), V(0.70, 0.44, -0.51), V(1.04, 0.65, -0.52),
        V(1.22, 0.91, -0.43), V(1.13, 1.16, -0.34), V(0.87, 1.22, -0.30)],
    }],
    ['goldenRetriever', {
      headWidth: 1.05, bodyWidth: 1.09, bodyDepth: 1.15, sitLow: 0.055,
      dropEar: { at: V(0.433, 0.29, 0.037), length: 0.59, width: 0.161, depth: 0.065, sweep: 0.146 },
      muzzle: V(1.07, 1.14, 1.11),
      shoulder: V(0.30, 0.91, 0.245), pawWidth: 1.08, tailLength: 1.24, tailRadius: 0.145,
      tail: [V(0.37, 0.33, -0.33), V(0.67, 0.28, -0.46), V(0.98, 0.31, -0.54),
        V(1.23, 0.43, -0.56), V(1.42, 0.54, -0.53), V(1.54, 0.67, -0.48)],
    }],
    ['samoyed', {
      headWidth: 1.08, headHeight: 1.13, bodyWidth: 1.13, bodyDepth: 1.24, sitLow: 0.09,
      ears: 0.92, earHeight: 1.17, earTilt: 0.12, earSpread: 0.058,
      muzzle: V(0.96, 0.99, 1.00), muzzleLift: 0.010, puppySmile: true, headProfile: 'flowing', neckRuff: 0.34,
      eyes: { at: V(0.216, 0.045, 0.441), width: 0.65, height: 0.54, tilt: 0.10, gaze: 0.95,
        pupil: '#1a181a', pupilWidth: 0.099, catchlights: [[0.032, 0.042, 0.029], [-0.028, -0.041, 0.012]] },
      shoulder: V(0.32, 0.91, 0.25), pawWidth: 1.15, tailLength: 1.20, tailRadius: 0.182,
      tail: [V(0.38, 0.39, -0.36), V(0.64, 0.46, -0.50), V(0.90, 0.65, -0.52),
        V(1.04, 0.93, -0.49), V(0.88, 1.20, -0.39), V(0.52, 1.25, -0.34)],
    }],
    ['dachshund', {
      headWidth: 0.91, headHeight: 0.90, bodyWidth: 0.97, bodyDepth: 1.42, sitLow: 0.31,
      dropEar: { at: V(0.447, 0.24, 0.072), length: 0.66, width: 0.18, depth: 0.058, sweep: 0.15 },
      muzzle: V(0.91, 1, 1.29),
      shoulder: V(0.28, 0.72, 0.27), pawWidth: 0.95, tailLength: 1.06, tailRadius: 0.074,
      cuddleLength: 0.23,
      tail: [V(0.34, 0.25, -0.39), V(0.53, 0.25, -0.52), V(0.73, 0.28, -0.58),
        V(0.91, 0.34, -0.61), V(1.10, 0.44, -0.58), V(1.22, 0.56, -0.54)],
    }],
    ['borderCollie', {
      ...collieFeatures,
      headWidth: 0.99, headHeight: 1.06, bodyWidth: 1.01, bodyDepth: 1.12, sitLow: 0.045,
      muzzle: V(0.90, 0.95, 1.06), muzzleLift: 0.005, neckRuff: 0.19,
      headProfile: 'collie',
      shoulder: V(0.29, 0.93, 0.25), pawWidth: 1.04, tailLength: 1.17, tailRadius: 0.15,
      tail: [V(0.35, 0.34, -0.38), V(0.59, 0.32, -0.50), V(0.85, 0.36, -0.55),
        V(1.08, 0.46, -0.52), V(1.21, 0.59, -0.45), V(1.24, 0.75, -0.36)],
    }],
  ]);

  const roundedCheeks = [
    [0, -1], [0.31, -0.969], [0.58, -0.88], [0.79, -0.74],
    [0.94, -0.56], [1.03, -0.35], [1.067, -0.14], [1.061, 0.05],
    [1.009, 0.23], [0.934, 0.42], [0.824, 0.59], [0.688, 0.74],
    [0.52, 0.86], [0.33, 0.944], [0.15, 0.986], [0, 1],
  ];
  const flowingCheeks = [
      [0, -1], [0.30, -0.966], [0.57, -0.88], [0.77, -0.75],
      [0.90, -0.65], [0.97, -0.54], [0.96, -0.44], [0.942, -0.37],
      [1.01, -0.30], [1.07, -0.20], [1.08, -0.09], [1.05, 0.01],
      [1.00, 0.07], [1.035, 0.15], [1.03, 0.25], [0.98, 0.35],
      [0.93, 0.40], [0.91, 0.52], [0.84, 0.63], [0.72, 0.76],
      [0.56, 0.86], [0.34, 0.944], [0.15, 0.98], [0, 1],
  ];
  // The collie's cheeks are fullest below the eyes and taper toward the brow.
  const collieCheeks = [
    [0, -1], [0.32, -0.97], [0.57, -0.88], [0.76, -0.78],
    [0.875, -0.70], [0.958, -0.59], [1.025, -0.46], [1.051, -0.32],
    [1.028, -0.15], [0.992, 0.02], [0.954, 0.15], [0.92, 0.29],
    [0.89, 0.41], [0.84, 0.54], [0.75, 0.67], [0.65, 0.77],
    [0.49, 0.87], [0.33, 0.94], [0.15, 0.98], [0, 1],
  ];
  const headProfiles = { rounded: roundedCheeks, flowing: flowingCheeks, collie: collieCheeks };
  K.dogHeadGeometry = shape => {
    const outline = headProfiles[shape];
    const profile = new THREE.SplineCurve(outline.map(([radius, y]) => new THREE.Vector2(radius, y))).getPoints(100);
    const geometry = new THREE.LatheGeometry(profile, 72, Math.PI);
    const points = geometry.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
      const radius = Math.hypot(x, z), inverseRadius = radius > 1e-6 ? 1 / radius : 0;
      const depth = Math.sqrt(Math.max(0, 1 - y * y));
      const side = x * inverseRadius;
      const width = mix(depth, radius, smooth(0.54, 0.96, Math.abs(side)));
      const crown = y * (1 - 0.092 * smooth(0.22, 0.99, y));
      // Apply the profile at the silhouette and leave the front of the muzzle rounded.
      points.setXYZ(i, side * width, crown, z * inverseRadius * depth);
    }
    geometry.computeVertexNormals();
    return geometry;
  };

  // A drop ear hangs from its upper edge, with a small outward sweep through the middle.
  const dropProfile = new THREE.SplineCurve([[0, -0.085], [0.66, -0.02], [0.88, 0.13], [1, 0.40],
    [0.86, 0.68], [0.56, 0.90], [0.28, 0.978], [0, 1]].map(([r, t]) => new THREE.Vector2(r, t))).getPoints(28);
  K.dropEarGeometry = (shape, side, grow = 0) => {
    const geometry = new THREE.LatheGeometry(dropProfile, 28);
    const points = geometry.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const t = points.getY(i), swing = smooth(0, 0.63, t) - 0.3 * smooth(0.7, 1, t);
      points.setXYZ(i, points.getX(i) * (shape.width + grow) + side * shape.sweep * swing,
        -t * (shape.length + grow), -points.getZ(i) * (shape.depth + grow) - 0.048 * smooth(0.26, 1, t));
    }
    // Fur markings use the ear's local shape as it turns with the head.
    geometry.setAttribute('rest', points.clone());
    geometry.computeVertexNormals();
    return geometry;
  };

  K.makeDogFace = head => {
    const group = new THREE.Group();
    const fur = K.flat('#f8f4e9'), noseMat = K.flat('#26232a'), mouthMat = K.flat('#4e3138');
    const muzzleShade = new THREE.Color('#d4b99f');
    const sphere = new THREE.SphereGeometry(1, 32, 20);
    const muzzle = new THREE.Mesh(sphere, fur);
    muzzle.position.set(0, -0.175, 0.368);
    muzzle.scale.set(0.293, 0.184, 0.266);
    const nose = new THREE.Group();
    nose.position.set(0, -0.106, 0.614);
    const noseTip = new THREE.Mesh(sphere, noseMat);
    const roundedTriangle = sphere.clone();
    const nosePoints = roundedTriangle.attributes.position;
    for (let i = 0; i < nosePoints.count; i++) {
      const taper = mix(0.72, 1.09, smooth(-0.87, 0.55, nosePoints.getY(i)));
      nosePoints.setX(i, nosePoints.getX(i) * taper);
    }
    roundedTriangle.computeVertexNormals();
    const roundedFaceDetail = shape => new THREE.ExtrudeGeometry(shape, {
      depth: 0.72, bevelSize: 0.095, bevelThickness: 0.15, bevelSegments: 4, curveSegments: 14,
    }).translate(0, 0, -0.36);
    const heart = new THREE.Shape();
    heart.moveTo(0, 0.39);
    heart.bezierCurveTo(0.40, 0.94, 0.99, 0.91, 0.99, 0.42);
    heart.bezierCurveTo(0.99, -0.02, 0.52, -0.48, 0.14, -0.79);
    heart.quadraticCurveTo(0, -0.91, -0.14, -0.79);
    heart.bezierCurveTo(-0.52, -0.48, -0.99, -0.02, -0.99, 0.42);
    heart.bezierCurveTo(-0.99, 0.91, -0.40, 0.94, 0, 0.39);
    const heartNose = roundedFaceDetail(heart);
    noseTip.scale.set(0.102, 0.061, 0.051);
    const glint = new THREE.Mesh(sphere, K.flat('#797384'));
    glint.position.set(-0.028, 0.032, 0.036);
    glint.scale.set(0.034, 0.012, 0.01);
    nose.add(noseTip, glint);

    // Draw the closed smile on the surface of the muzzle so it stays put as the head turns.
    const muzzleZ = (x, y) => 0.368 + 0.266 * Math.sqrt(1 - (x / 0.293) ** 2 - ((y + 0.175) / 0.184) ** 2);
    const smile = new K.TaperTube(28, 6, mouthMat, 7);
    const poutWidth = cross => mix(0.138, 0.112, cross);
    const poutY = (u, cross) => -0.231 - mix(0.004, 0.033, cross) * u * u;
    const closedMouthRadius = t => 0.005 + 0.006 * Math.sin(t * Math.PI);
    const sleepWidth = 0.098;
    const sleepMouthY = u => -0.231 + 0.022 * u * u - 0.008 * Math.sin(Math.PI * Math.abs(u));
    const dizzyMouthWidth = gasp => mix(sleepWidth, 0.063, gasp);
    const dizzyMouthY = (u, gasp) => mix(sleepMouthY(u), -0.245, gasp);
    const dizzyMouthRadius = (t, gasp) => mix(closedMouthRadius(t), 0.043 * Math.sqrt(1 - (2 * t - 1) ** 2), gasp);
    let lastTension = -1, lastCross = -1, lastSleep = -1;
    let lastDizzy = -1, lastGasp = -1;
    const updateSmile = (tension, cross, sleep, dizzy, gasp) => {
      if (sleep === lastSleep && tension === lastTension && (tension === 0 || cross === lastCross)
        && dizzy === lastDizzy && (dizzy === 0 || gasp === lastGasp)) return;
      lastTension = tension;
      lastCross = cross;
      lastSleep = sleep;
      lastDizzy = dizzy;
      lastGasp = gasp;
      const relaxedWidth = mix(mix(0.166, poutWidth(cross), tension), sleepWidth, sleep);
      const width = mix(relaxedWidth, dizzyMouthWidth(gasp), dizzy);
      const gap = mix(0.009, 0.010, tension);
      smile.update((t, out) => {
        const u = 2 * t - 1, x = width * u;
        const relaxedY = mix(mix(-0.226 + 0.055 * u * u, poutY(u, cross), tension), sleepMouthY(u), sleep);
        const y = mix(relaxedY, dizzyMouthY(u, gasp), dizzy);
        return out.set(x, y, muzzleZ(x, y) + gap);
      }, t => {
        const smileRadius = (softSmile ? 1.30 : 1) * (0.008 + 0.004 * Math.sin(t * Math.PI));
        const relaxedRadius = mix(smileRadius, closedMouthRadius(t), mix(tension, 1, sleep));
        return mix(relaxedRadius, dizzyMouthRadius(t, gasp), dizzy);
      });
    };

    // Curve the open smile around the muzzle. Its upper edge stays against the muzzle as
    // the lower edge and tongue move when the dog pants.
    const smileSegments = 28, smileRows = 5;
    const puppyMouthGeo = new THREE.PlaneGeometry(1, 1, smileSegments, smileRows);
    const mouthPoints = puppyMouthGeo.attributes.position;
    const puppyMouth = new THREE.Mesh(puppyMouthGeo, mouthMat);
    puppyMouth.renderOrder = 7;
    puppyMouth.frustumCulled = false;
    const puppyTongue = new THREE.Mesh(sphere, K.flat('#e68e99'));
    const tongueCrease = new THREE.Mesh(sphere, K.flat('#ca747e'));
    const widerTongueRoot = sphere.clone();
    const tonguePoints = widerTongueRoot.attributes.position;
    for (let i = 0; i < tonguePoints.count; i++) {
      const width = 1 + 0.24 * smooth(-0.18, 0.72, tonguePoints.getY(i));
      tonguePoints.setX(i, tonguePoints.getX(i) * width);
    }
    widerTongueRoot.computeVertexNormals();
    const tongueProfile = new THREE.Shape();
    tongueProfile.moveTo(-0.69, 0.90);
    tongueProfile.quadraticCurveTo(0, 0.99, 0.69, 0.90);
    tongueProfile.bezierCurveTo(1.02, 0.72, 0.98, 0.05, 0.85, -0.36);
    tongueProfile.bezierCurveTo(0.63, -1.09, -0.63, -1.09, -0.85, -0.36);
    tongueProfile.bezierCurveTo(-0.98, 0.05, -1.02, 0.72, -0.69, 0.90);
    const roundTongue = roundedFaceDetail(tongueProfile);
    const puppyJaw = new THREE.Group();
    const philtrum = new K.TaperTube(8, 6, mouthMat, 7);
    puppyJaw.add(puppyMouth, puppyTongue, tongueCrease, philtrum.mesh);
    puppyJaw.visible = false;
    let doubleArc = false;
    let softSmile = false;
    const softSmileCenterY = -0.224;
    const softSmileGap = 0.006;
    let lastPhiltrum = -1;
    const updatePhiltrum = tension => {
      const length = 1 - smooth(0.12, 0.94, tension);
      philtrum.mesh.visible = length > 0;
      if (!philtrum.mesh.visible || length === lastPhiltrum) return;
      lastPhiltrum = length;
      const start = softSmile ? -0.150 : -0.157;
      const end = doubleArc ? -0.251 : softSmile ? softSmileCenterY - 0.002 : -0.226;
      philtrum.update((t, out) => {
        const y = mix(start, end, t * length);
        return out.set(0, y, muzzleZ(0, y) + (softSmile ? softSmileGap : 0.014));
      }, t => mix(0.005, softSmile ? 0.0032 : 0.003, t) * Math.sqrt(length));
    };
    const updatePuppyJaw = (opening, t, tension, cross, sleep, dizzy, gasp) => {
      const smileWidth = doubleArc ? 0.225 : softSmile ? mix(0.155, 0.195, opening) : 0.217;
      const relaxedWidth = mix(mix(smileWidth, poutWidth(cross), tension), sleepWidth, sleep);
      const width = mix(relaxedWidth, dizzyMouthWidth(gasp), dizzy);
      const gap = mix(mix(softSmile ? softSmileGap : 0.014, 0.010, tension), 0.011, Math.max(sleep, dizzy));
      for (let i = 0; i <= smileSegments; i++) {
        const s = i / smileSegments, u = 2 * s - 1, a = Math.abs(u);
        const x = width * u;
        const arc = Math.sin(Math.PI * a);
        const top = doubleArc
          ? -0.248 - 0.039 * arc + 0.067 * a ** 3
          : softSmile
            ? softSmileCenterY + mix(-0.040 * arc - 0.008 * a, -0.010 * arc + 0.046 * a ** 3, opening)
            : -0.229 - 0.014 * arc + 0.066 * a ** 3;
        const depth = doubleArc
          ? 0.018 * (1 - a ** 8) + 0.053 * opening * Math.max(0, 1 - a / 0.67)
          : (softSmile ? 0.017 : 0.020) * (1 - a ** 6)
            + (softSmile ? 0.064 : 0.074) * opening * (1 - a * a) ** 1.6;
        const taper = 1 - smooth(0.96, 1, a);
        const radius = closedMouthRadius(s) * taper;
        const center = poutY(u, cross);
        const gaspRadius = dizzyMouthRadius(s, gasp) * taper;
        const relaxedTop = mix(mix(top, center + radius, tension), sleepMouthY(u) + radius, sleep);
        const relaxedHeight = mix(depth, 2 * radius, mix(tension, 1, sleep));
        const upper = mix(relaxedTop, dizzyMouthY(u, gasp) + gaspRadius, dizzy);
        const height = mix(relaxedHeight, 2 * gaspRadius, dizzy);
        for (let j = 0; j <= smileRows; j++) {
          const y = upper - height * j / smileRows;
          const z = muzzleZ(x, Math.max(y, -0.31)) + gap;
          mouthPoints.setXYZ(j * (smileSegments + 1) + i, x, y, z);
        }
      }
      mouthPoints.needsUpdate = true;
      updatePhiltrum(Math.max(tension, sleep, dizzy));
      puppyTongue.visible = tongueCrease.visible = opening > 0.01;
      if (doubleArc) {
        // The top stays tucked under the smile as the rounded tip slides out.
        const y = -0.263 - 0.063 * opening, z = muzzleZ(0, -0.29) + 0.032;
        const length = 0.086 * opening;
        puppyTongue.position.set(0, y, z);
        puppyTongue.scale.set(0.074, length, 0.047);
        tongueCrease.position.set(0, y + length * 0.28, z + 0.016);
        tongueCrease.scale.set(0.004, length * 0.35, 0.003);
        return;
      }
      const x = -0.012 - 0.008 * opening * Math.sin(4 * t);
      const length = 0.094 * opening;
      const y = -0.261 - 0.060 * opening;
      const z = muzzleZ(x, -0.29) + 0.041;
      puppyTongue.position.set(x, y, z);
      puppyTongue.scale.set(0.070, length, 0.030);
      tongueCrease.position.set(x, y + length * 0.16, z + 0.026);
      tongueCrease.scale.set(0.005, length * 0.37, 0.0025);
    };

    const jaw = new THREE.Group();
    jaw.position.set(0, -0.217, 0.604);
    const open = new THREE.Mesh(sphere, mouthMat);
    open.position.y = -0.036;
    open.scale.set(0.123, 0.083, 0.064);
    const tongue = new THREE.Mesh(sphere, K.flat('#ed8f9e'));
    tongue.position.set(0, -0.117, 0.055);
    tongue.scale.set(0.083, 0.098, 0.036);
    const tongueLine = new THREE.Mesh(sphere, K.flat('#c96d7e'));
    tongueLine.position.set(0, -0.105, 0.088);
    tongueLine.scale.set(0.006, 0.033, 0.0035);
    jaw.add(open, tongue, tongueLine);
    let hasPuppySmile = false;
    group.add(muzzle, nose, smile.mesh, jaw, puppyJaw);
    head.add(group);
    group.visible = false;

    return {
      muzzle,
      biteOffset: out => out.set(0, -0.244, 0.635).multiply(group.scale).add(group.position),
      setBreed(dog, coat) {
        group.visible = !!dog;
        if (!dog) return;
        group.scale.copy(dog.muzzle);
        group.position.y = dog.muzzleLift ?? 0;
        hasPuppySmile = !!dog.puppySmile;
        doubleArc = dog.puppySmile === 'doubleArc';
        softSmile = dog.puppySmile === 'soft';
        lastTension = lastPhiltrum = -1;
        noseTip.geometry = doubleArc ? heartNose : hasPuppySmile ? roundedTriangle : sphere;
        if (doubleArc) nose.scale.set(0.82, 0.94, 0.93);
        else nose.scale.setScalar(hasPuppySmile ? 0.85 : 1);
        noseMat.color.set(doubleArc ? '#201c21' : hasPuppySmile ? '#2e292b' : '#26232a');
        mouthMat.color.set(doubleArc ? '#432e32' : softSmile ? '#4f525a' : hasPuppySmile ? '#4d353a' : '#4e3138');
        glint.position.set(-0.028, 0.032, doubleArc ? 0.026 : 0.036);
        glint.scale.set(doubleArc ? 0.020 : 0.034, 0.012, 0.010);
        puppyTongue.geometry = doubleArc ? roundTongue : softSmile ? widerTongueRoot : sphere;
        puppyTongue.material.color.set(doubleArc ? '#db849c' : '#e68e99');
        puppyTongue.rotation.x = tongueCrease.rotation.x = doubleArc ? -0.52 : 0;
        puppyTongue.rotation.z = tongueCrease.rotation.z = doubleArc ? 0 : -0.13;
        fur.color.set(coat.dogMuzzle || coat.light).lerp(muzzleShade, doubleArc || softSmile ? 0 : hasPuppySmile ? 0.035 : 0.13);
      },
      update({ pant, yawn, t, chew, tension, cross, sleep, dizzy, gasp }) {
        const suppressOpening = tension > 0 || dizzy > 0;
        if (chew > 0 && !suppressOpening) {
          puppyJaw.visible = smile.mesh.visible = false;
          jaw.visible = true;
          jaw.scale.y = mix(0.12, 0.72, chew);
          tongue.visible = tongueLine.visible = false;
          return;
        }
        tongue.visible = tongueLine.visible = true;
        puppyJaw.visible = hasPuppySmile && (suppressOpening || yawn < 0.34);
        const panting = pant * (1 - sleep);
        const opening = Math.max(panting * (0.70 + 0.16 * Math.sin(t * 15)), yawn * 1.6);
        jaw.visible = !puppyJaw.visible && !suppressOpening && opening > 0.12;
        smile.mesh.visible = !puppyJaw.visible && !jaw.visible;
        jaw.scale.set(1, Math.max(0.12, opening), 1);
        if (puppyJaw.visible) updatePuppyJaw(suppressOpening ? 0 : smooth(0.48, 0.82, panting), t, tension, cross, sleep, dizzy, gasp);
        if (smile.mesh.visible) updateSmile(tension, cross, sleep, dizzy, gasp);
      },
    };
  };
})();
