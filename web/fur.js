// Fur: flat sticker colour plus the markings that make a coat read as a real cat — a pale muzzle
// and bib, pink inner ears, tabby stripes, calico patches, Siamese-style points — and
// a soft top-left shade for volume.
// Markings are placed in each part's rest shape, so they stay put when the spine bends.
'use strict';
(() => {
  const C = c => new THREE.Color(c);
  // Shared by every fur material, so a coat change is one set of writes.
  const U = {
    uFur: { value: C('#151515') },
    uLight: { value: C('#f7f4ea') },     // muzzle, bib, tuxedo white
    uDark: { value: C('#151515') },      // tabby stripes
    uPatchA: { value: C('#151515') },    // calico patches
    uPatchB: { value: C('#151515') },
    uPoint: { value: C('#151515') },     // colourpoint mask, ears, legs and tail
    uTip: { value: C('#151515') },       // cool tipping on a shaded coat
    uInner: { value: C('#151515') },     // inner ear
    uStripes: { value: 0 },
    uBrow: { value: 0 },
    uMuzzle: { value: 0 },
    uBib: { value: 0 },
    uCalico: { value: 0 },
    uTuxedo: { value: 0 },
    uPoints: { value: 0 },
    uSoftPoints: { value: 0 },  // 1: the colourpoints fade in gradually, as in 1.0.4
    uShadedCoat: { value: 0 },
    uInnerAmt: { value: 0 },
    uShade: { value: 0 },
    uDogMask: { value: 0 },
  };

  const vertex = `
    attribute vec3 rest;
    attribute float along;
    varying vec3 vRest;
    varying vec3 vNormal;
    varying float vAlong;
    void main() {
      #if defined(BODY) || defined(EAR)
        vRest = rest;
      #else
        vRest = position;
      #endif
      vAlong = along;
      vNormal = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      #ifdef ARM
        ${K.ARM_ROOT_PUSH}
      #endif
      gl_Position = projectionMatrix * mv;
    }`;

  const fragment = `
    uniform vec3 uFur, uLight, uDark, uPatchA, uPatchB, uPoint, uTip, uInner;
    uniform float uStripes, uBrow, uMuzzle, uBib, uCalico, uTuxedo, uPoints, uSoftPoints, uShadedCoat, uInnerAmt, uShade, uDogMask;
    varying vec3 vRest;
    varying vec3 vNormal;
    varying float vAlong;
    // Soft-edged ellipse: 1 inside, 0 outside, with a thin anti-aliased edge.
    // Edges are only a pixel or two wide: flat colour shapes, as in a 2D illustration.
    float blob(vec2 p, vec2 c, vec2 r) { return 1.0 - smoothstep(0.96, 1.0, length((p - c) / r)); }
    float blob3(vec3 p, vec3 c, float r) { return 1.0 - smoothstep(r * 0.97, r, length(p - c)); }
    float smoothMin(float a, float b, float radius) {
      float blend = max(radius - abs(a - b), 0.0);
      return min(a, b) - blend * blend / (4.0 * radius);
    }
    // A tapering line from a to b, half-width w at a, w * taper at b.
    float stroke(vec2 p, vec2 a, vec2 b, float w, float taper) {
      vec2 ab = b - a;
      float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
      float r = w * mix(1.0, taper, h);
      return 1.0 - smoothstep(r * 0.88, r, length(p - a - ab * h));
    }
    // Rings across a 0..1 coordinate: n bands, each \`fill\` of a period wide.
    float rings(float x, float n, float fill) {
      float f = fract(x * n);
      float d = abs(f - 0.5);
      return 1.0 - smoothstep(fill * 0.5 - 0.025, fill * 0.5, d);
    }
    void main() {
      vec3 col = uFur;
      vec3 p = vRest;
      if (uShadedCoat > 0.0) {
        float tip = 0.0, cream = 0.0;
        #ifdef HEAD
          float crown = p.y + 0.21 * abs(p.x) - 0.15 * p.z;
          tip = smoothstep(0.06, 0.51, crown);
          tip = max(tip, 0.38 * smoothstep(0.45, 0.96, abs(p.x)));
          cream = 0.32 * smoothstep(0.20, 0.88, p.z) * (1.0 - smoothstep(-0.62, -0.30, p.y));
        #endif
        #ifdef BODY
          float chest = p.z / max(length(p.xz), 0.001);
          tip = 1.0 - smoothstep(-0.57, 0.67, chest);
          cream = 0.82 * smoothstep(0.37, 0.88, chest);
        #endif
        #ifdef EAR
          tip = mix(0.57, 0.94, smoothstep(0.02, 0.32, p.y));
        #endif
        #ifdef TAIL
          tip = mix(0.43, 1.0, smoothstep(0.08, 0.93, vAlong));
        #endif
        #ifdef ARM
          tip = 0.35 * (1.0 - smoothstep(0.08, 0.80, vAlong));
          cream = 0.34 * smoothstep(0.56, 1.0, vAlong);
        #endif
        col = mix(mix(uFur, uTip, tip), uLight, cream);
      }
      // \`point\`: how far into the colourpoint this spot is.
      float light = 0.0, dark = 0.0, inner = 0.0, point = 0.0;
      #ifdef HEAD
        // Head geometry is a unit sphere scaled (0.56, 0.47, 0.47) by the mesh.
        if (p.z > 0.0) {
          vec2 q = p.xy;
          // Colourpoint mask: a crisp-edged oval over the nose and muzzle that reaches up under the eyes, like a cut-paper shape.
          // Soft points: a wider oval over eyes, nose and muzzle that fades out towards the brow.
          point = mix(blob(q, vec2(0.0, -0.3), vec2(0.64, 0.54)),
                      1.0 - smoothstep(0.62, 1.0, length((q - vec2(0.0, -0.2)) / vec2(0.74, 0.74))), uSoftPoints);
          // Two lobes under the nose and a little chin: the classic pale cat muzzle.
          float m = max(max(blob(q, vec2(-0.2, -0.47), vec2(0.27, 0.22)), blob(q, vec2(0.2, -0.47), vec2(0.27, 0.22))),
                        blob(q, vec2(0.0, -0.66), vec2(0.26, 0.18)));
          light = max(light, m * uMuzzle);
          // Tuxedo blaze: the muzzle widens and runs up between the eyes.
          float blaze = max(m, blob(q, vec2(0.0, -0.1), vec2(0.12, 0.42)) * step(q.y, 0.35));
          light = max(light, blaze * uTuxedo);
          // Tabby: three short strokes on the forehead and two on each cheek, like brush marks.
          float mk = stroke(q, vec2(0.0, 0.48), vec2(0.0, 0.82), 0.055, 0.5);
          mk = max(mk, stroke(vec2(abs(q.x), q.y), vec2(0.17, 0.46), vec2(0.25, 0.78), 0.045, 0.45));
          mk = max(mk, stroke(vec2(abs(q.x), q.y), vec2(0.74, 0.02), vec2(0.98, 0.1), 0.045, 0.35));
          mk = max(mk, stroke(vec2(abs(q.x), q.y), vec2(0.76, -0.17), vec2(0.99, -0.15), 0.04, 0.35));
          dark = max(dark, mk * uStripes);
          // A narrow, soft fur marking rising from the inner side of each eye.
          float browHeight = smoothstep(0.36, 0.43, q.y) * (1.0 - smoothstep(0.60, 0.74, q.y));
          float rise = smoothstep(0.36, 0.74, q.y);
          float browX = mix(0.32, 0.37, rise);
          float browWidth = mix(0.034, 0.016, rise);
          float brow = (1.0 - smoothstep(browWidth * 0.64, browWidth, abs(abs(q.x) - browX))) * browHeight;
          dark = max(dark, brow * smoothstep(0.2, 0.55, p.z) * uBrow);
        }
        // Calico: an orange patch over the left brow and ear, a black one over the right.
        float pa = blob3(p, vec3(-0.6, 0.7, 0.35), 0.62);
        float pb = blob3(p, vec3(0.72, 0.55, 0.1), 0.55);
      #endif
      #ifdef BODY
        // Lathe body: y is height, angle from the front is atan(x, z).
        float a = abs(atan(p.x, p.z));
        float bibW = mix(0.55, 0.85, smoothstep(0.75, 1.2, p.y));
        float bib = 1.0 - smoothstep(bibW * 0.96, bibW, a);
        light = max(light, bib * max(uBib, uTuxedo));
        // Tabby: four bold strokes on each flank that come in from the back and taper to a point
        // before the chest, as a brush would lay them, rather than rings round the body.
        float wave = p.y + 0.04 * sin(a * 3.0);
        float reach = smoothstep(0.95, 1.6, a);
        float band = 0.0;
        for (int i = 0; i < 4; i++) {
          float d = abs(wave - (0.4 + 0.21 * float(i)) + 0.05 * (a - 1.6));
          float w = 0.055 * reach;
          band = max(band, 1.0 - smoothstep(w * 0.85, w, d));
        }
        dark = max(dark, band * uStripes);
        float pa = blob3(p, vec3(-0.5, 0.95, -0.3), 0.55);
        float pb = blob3(p, vec3(0.55, 0.55, -0.15), 0.5) * (1.0 - bib);
      #endif
      #ifdef EAR
        // Ear lathe: radius shrinks from 0.28 at the base to 0 at the tip (y 0.37).
        // Every point lies on the lathe radius, so the inner ear is a band across the front face.
        // The point colour starts a little above the base with a crisp edge, like the mask; soft
        // points come in gradually, so the ear grows out of the head's colour.
        point = mix(smoothstep(0.09, 0.1, p.y), smoothstep(0.06, 0.2, p.y), uSoftPoints);
        float rMax = mix(0.28, 0.0, clamp((p.y + 0.06) / 0.43, 0.0, 1.0));
        inner = (1.0 - smoothstep(0.52, 0.58, abs(p.x) / max(rMax, 0.001))) * smoothstep(0.13, 0.14, p.y) * (1.0 - smoothstep(0.3, 0.31, p.y)) * step(0.0, p.z);
        #ifdef LEFT
          float pa = 1.0, pb = 0.0;
        #else
          float pa = 0.0, pb = 1.0;
        #endif
      #endif
      #ifdef TAIL
        // Three wide bands down the tail and a dark tip. Calico tails: white, a black band, an
        // orange end. Points: dark from a third of the way along.
        dark = max(dark, rings(vAlong + 0.08, 3.5, 0.42) * step(0.3, vAlong) * uStripes);
        dark = max(dark, smoothstep(0.88, 0.89, vAlong) * uStripes);
        float pa = smoothstep(0.62, 0.63, vAlong), pb = smoothstep(0.32, 0.33, vAlong) * (1.0 - pa);
        point = mix(smoothstep(0.3, 0.31, vAlong), smoothstep(0.0, 0.3, vAlong), uSoftPoints);
      #endif
      #ifdef ARM
        // No stripes on the legs: at this size they read as rings round a tube.
        // Calico forelegs are white, as on most real calicos.
        float pa = 0.0, pb = 0.0;
        // Points: dark boots from halfway down the leg, crisp at the top; soft points darken the
        // leg gradually from the elbow down.
        point = mix(smoothstep(0.55, 0.56, vAlong), smoothstep(0.3, 0.8, vAlong), uSoftPoints);
      #endif
      if (uDogMask > 0.0) {
        bool malamute = uDogMask == 3.0;
        bool golden = uDogMask == 4.0;
        bool samoyed = uDogMask == 5.0;
        bool dachshund = uDogMask == 6.0;
        bool borderCollie = uDogMask == 7.0;
        #ifdef HEAD
          vec2 q = vec2(abs(p.x), p.y);
          float front = smoothstep(-0.07, 0.18, p.z);
          if (uDogMask < 3.0) {
            // The husky's cheek mask climbs around each eye. The corgi has a single narrow blaze.
            float husky = 1.0 - step(1.5, uDogMask);
            float cheek = blob(q, vec2(0.0, -0.46), vec2(mix(0.88, 0.98, husky), 0.48));
            float eyeMask = blob(q, vec2(0.40, 0.025), vec2(0.29, 0.45)) * husky;
            float blaze = blob(q, vec2(0.0, -0.14), vec2(mix(0.18, 0.145, husky), mix(0.95, 0.65, husky)));
            light = max(light, max(cheek, max(eyeMask, blaze)) * front);
          } else if (malamute) {
            // Round cheek patches blend into the muzzle, with separate cream brows above.
            float cheek = length((q - vec2(0.55, -0.38)) / vec2(0.43, 0.50));
            float chin = length((q - vec2(0.0, -0.45)) / vec2(0.61, 0.56));
            float blaze = mix(0.107, 0.052, smoothstep(0.05, 0.74, q.y));
            float forehead = length((q - vec2(0.0, 0.19)) / vec2(blaze, 0.53));
            // Round the upper tip and the two inner corners where the blaze meets the cheeks.
            float capWidth = mix(0.074, 0.048, smoothstep(0.42, 0.65, q.y));
            float cap = length(vec2(q.x / capWidth, max(0.0, q.y - 0.65) / 0.07));
            forehead = mix(forehead, cap, smoothstep(0.41, 0.55, q.y));
            float bridgeBlend = mix(0.30, 0.66, 1.0 - smoothstep(0.17, 0.34, q.y));
            float face = 1.0 - smoothstep(0.98, 1.03, smoothMin(smoothMin(cheek, chin, 0.34), forehead, bridgeBlend));
            vec2 brow = vec2(q.x, q.y - 0.29 * (q.x - 0.39));
            float brows = blob(brow, vec2(0.39, 0.31), vec2(0.127, 0.079));
            light = max(face, brows) * smoothstep(0.21, 0.34, p.z);
          } else if (borderCollie) {
            // Both edges curve in above the eyes and widen again towards the crown.
            float crown = smoothstep(0.31, 0.90, p.y);
            float left = mix(-0.276, -0.085, smoothstep(-0.20, 0.31, p.y)) - 0.090 * crown;
            float right = mix(0.264, 0.050, smoothstep(-0.19, 0.24, p.y)) + 0.076 * crown;
            float center = 0.5 * (left + right);
            float width = 0.5 * (right - left);
            float blaze = length(vec2((p.x - center) / width, min(0.0, p.y + 0.46) / 0.24));
            float muzzle = length((p.xy - vec2(0.014, -0.56)) / vec2(0.52, 0.41));
            float face = smoothMin(blaze, muzzle, 0.27);
            light = (1.0 - smoothstep(0.97, 1.04, face)) * smoothstep(-0.075, 0.075, p.z);
            float eyeMask = length((q - vec2(0.43, -0.12)) / vec2(0.47, 0.49));
            dark = 0.24 * (1.0 - smoothstep(0.65, 1.20, eyeMask)) * front;
          } else if (dachshund) {
            float tanBrow = blob(q, vec2(0.38, 0.40), vec2(0.14, 0.083));
            float tanCheek = blob(q, vec2(0.30, -0.46), vec2(0.39, 0.28));
            light = max(tanBrow, tanCheek) * front;
          } else if (samoyed) {
            // White cheek fur fades into the face below the eyes.
            light = 0.78 * front * (1.0 - smoothstep(0.36, 1.0, length((q - vec2(0.0, -0.43)) / vec2(1.01, 0.53))));
            dark = 0.13 * smoothstep(0.52, 1.0, q.x) * front;
          } else {
            light = 0.6 * front * blob(q, vec2(0.0, -0.46), vec2(0.87, 0.44));
          }
        #endif
        #ifdef BODY
          float chestAngle = abs(atan(p.x, p.z));
          float width = mix(0.68, 1.40, smoothstep(0.10, 1.05, p.y));
          if (malamute || samoyed) {
            width += 0.13 + 0.08 * sin(20.0 * p.y);
          }
          if (borderCollie) {
            // Keep the shoulders dark around the white chest.
            width = 1.25 * smoothstep(0.33, 0.82, p.y) * mix(1.0, 0.66, smoothstep(0.92, 1.27, p.y));
          }
          float bib = dachshund ? 0.86 * blob(vec2(chestAngle, p.y), vec2(0.35, 0.61), vec2(0.29, 0.24))
            : 1.0 - smoothstep(width - 0.04, width, chestAngle);
          light = max(light, bib);
          if (samoyed) {
            // The white neck ruff comes to a few broad points over the warm-white chest.
            float fold = 0.65 + 0.18 * pow(min(chestAngle, 1.2), 1.5) + 0.043 * cos(chestAngle * 12.0);
            float neckCoat = smoothstep(fold - 0.07, fold + 0.075, p.y);
            light = bib * mix(0.35, 1.0, neckCoat);
            dark = 0.15 * bib * smoothstep(fold - 0.23, fold - 0.08, p.y) * (1.0 - neckCoat);
          }
        #endif
        #ifdef ARM
          if (borderCollie) light = smoothstep(0.60, 0.72, vAlong);
          else light = max(light, dachshund ? smoothstep(0.61, 0.76, vAlong) : smoothstep(0.23, 0.58, vAlong));
        #endif
        #ifdef EAR
          inner = blob(p.xy, vec2(0.0, 0.213), vec2(0.091, 0.106)) * smoothstep(0.012, 0.046, p.z);
          if (golden || dachshund) dark = mix(0.76, 1.0, smoothstep(0.06, 0.52, -p.y));
          if (malamute) {
            float earFront = smoothstep(0.013, 0.043, p.z);
            float earWidth = mix(0.124, 0.033, smoothstep(0.17, 0.44, p.y));
            light = blob(p.xy, vec2(0.0, 0.255), vec2(earWidth, 0.153)) * earFront;
            inner = light * blob(p.xy, vec2(0.0, 0.184), vec2(0.070, 0.123));
          }
          if (samoyed) {
            dark = 0.10 + 0.24 * smoothstep(0.12, 0.37, p.y);
            float earWidth = mix(0.100, 0.040, smoothstep(0.13, 0.31, p.y));
            inner = blob(p.xy, vec2(0.0, 0.212), vec2(earWidth, 0.115)) * smoothstep(0.012, 0.046, p.z);
          }
          if (borderCollie) {
            float earWidth = mix(0.133, 0.031, smoothstep(0.15, 0.46, p.y));
            float panel = blob(p.xy, vec2(0.0, 0.247), vec2(earWidth, 0.174))
              * smoothstep(0.016, 0.059, p.z);
            // This outer surface faces the viewer when the tip folds over.
            float back = smoothstep(0.10, 0.22, p.y) * smoothstep(0.003, 0.062, -p.z);
            col = mix(col, uDark, 0.67 * back);
            col = mix(col, mix(uFur, uLight, 0.29), panel);
            float center = length((p.xy - vec2(0.0, 0.243)) / vec2(earWidth * 0.61, 0.112));
            inner = panel * (1.0 - smoothstep(0.56, 1.0, center));
          }
        #endif
        #ifdef TAIL
          if (!dachshund) light = max(light, smoothstep(borderCollie ? 0.78 : 0.66, 0.88, vAlong) * (golden ? 0.52 : 1.0));
        #endif
      }
      col = mix(col, uPatchA, pa * uCalico);
      col = mix(col, uPatchB, pb * uCalico);
      col = mix(col, uPoint, point * uPoints);
      col = mix(col, uDark, dark);
      col = mix(col, uLight, light);
      col = mix(col, uInner, inner * uInnerAmt);
      // Soft volume: lit from the top left, a touch darker towards the silhouette and underneath.
      vec3 n = normalize(vNormal);
      // Pale fur needs a little contrast at the silhouette even in the flat style.
      float paleEdge = uDogMask == 5.0 ? 0.35 : uDogMask == 3.0 ? 0.18 * light : 0.0;
      #ifdef HEAD
        if (uDogMask == 5.0) paleEdge = 0.23;
      #endif
      col = mix(col, uDark, paleEdge * (1.0 - smoothstep(0.08, 0.52, n.z)));
      // Only the sides darken: a dark top edge would draw a seam where the ears meet the head.
      float lit = dot(n, normalize(vec3(-0.35, 0.75, 0.55)));
      float edge = (1.0 - clamp(n.z, 0.0, 1.0)) * abs(n.x);
      // Where the ears grow out of the head, the ear's front face sits over the head's turning
      // edge; shading them differently outlines the skull through the ear. So the top of the head
      // and the ears share one even shade, matching the light the brow already gets.
      #ifdef HEAD
        float calm = smoothstep(0.05, 0.45, p.y);
        lit = mix(lit, 0.8, calm);
        edge *= 1.0 - calm;
      #endif
      #ifdef EAR
        lit = 0.8;
        edge = 0.0;
      #endif
      col *= 1.0 + uShade * (0.18 * lit - 0.4 * edge * edge - 0.05);
      gl_FragColor = vec4(col, 1.0);
    }`;

  // `part` picks the markings: 'HEAD', 'BODY', 'EAR', 'TAIL' or 'ARM'; `side` -1 is screen left.
  K.furMaterial = (part, side = 0) => {
    const defines = { [part]: 1 };
    if (side < 0) defines.LEFT = 1;
    return new THREE.ShaderMaterial({ uniforms: U, vertexShader: vertex, fragmentShader: fragment, defines });
  };

  // Writes a coat: colours plus how strongly each marking shows (0 hides it).
  K.setFur = f => {
    for (const k of ['fur', 'light', 'dark', 'patchA', 'patchB', 'point', 'tip', 'inner']) U['u' + k[0].toUpperCase() + k.slice(1)].value.set(f[k] || f.fur);
    for (const k of ['stripes', 'brow', 'muzzle', 'bib', 'calico', 'tuxedo', 'points', 'softPoints', 'innerAmt', 'shade', 'dogMask']) U['u' + k[0].toUpperCase() + k.slice(1)].value = f[k] || 0;
    U.uShadedCoat.value = f.tip ? 1 : 0;
  };
})();
