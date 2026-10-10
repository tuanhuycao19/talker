import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Bảng màu lấy theo ảnh mẫu: thân vàng, bụng/cổ trước trắng, đốm cam,
// mõm nâu, sừng có đầu tròn màu cam, móng xám.
const COLORS = {
  yellow: new THREE.Color('#f5c518'),
  white: new THREE.Color('#fbf3e2'),
  spot: '#d98a2b',
  muzzle: '#9c6446',
  nostril: '#4a2a1c',
  mouth: '#4a1520',
  tongue: '#e8798a',
  tip: '#f2a23a',
  tuft: '#b8622a',
  hoof: '#7b7f86',
  sclera: '#ffffff',
  iris: '#3b3f46',
  pupil: '#0d0f12',
};

function toyMaterial(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    ...opts,
  });
}

// Tô màu theo đỉnh: trộn vàng -> trắng dựa trên hướng pháp tuyến.
function paintByNormal(geometry, weightFn) {
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(normals.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < normals.count; i++) {
    const w = weightFn(normals.getX(i), normals.getY(i), normals.getZ(i));
    c.copy(COLORS.yellow).lerp(COLORS.white, THREE.MathUtils.clamp(w, 0, 1));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

function mesh(geometry, material, { pos, scale, rot } = {}) {
  const m = new THREE.Mesh(geometry, material);
  if (pos) m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Đặt các đốm lên bề mặt một ellipsoid (bán trục a, b, c).
function addSpotsOnEllipsoid(parent, material, a, b, c, spots) {
  const geo = new THREE.SphereGeometry(1, 20, 12);
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (const [theta, phi, size] of spots) {
    const dir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    const p = new THREE.Vector3(dir.x * a, dir.y * b, dir.z * c);
    const n = new THREE.Vector3(p.x / (a * a), p.y / (b * b), p.z / (c * c)).normalize();
    const spot = mesh(geo, material, { scale: [size, size * 0.85, 0.012] });
    spot.position.copy(p).addScaledVector(n, -0.005);
    spot.quaternion.setFromUnitVectors(zAxis, n);
    parent.add(spot);
  }
}

export function createGiraffe() {
  const root = new THREE.Group();
  root.name = 'giraffe';

  const yellowV = toyMaterial('#ffffff', { vertexColors: true });
  const yellow = toyMaterial(COLORS.yellow);
  const white = toyMaterial(COLORS.white);
  const spot = toyMaterial(COLORS.spot, { roughness: 0.5 });
  const muzzleMat = toyMaterial(COLORS.muzzle, { side: THREE.DoubleSide, roughness: 0.5 });
  const nostrilMat = toyMaterial(COLORS.nostril, { roughness: 0.7, clearcoat: 0 });
  // khoang miệng: chỉ vẽ mặt trong (vách sau) để răng, lưỡi bên trong không bị che
  const mouthMat = new THREE.MeshStandardMaterial({ color: COLORS.mouth, roughness: 0.9, side: THREE.BackSide });
  const tongueMat = toyMaterial(COLORS.tongue, { roughness: 0.55 });
  const tipMat = toyMaterial(COLORS.tip);
  const tuftMat = toyMaterial(COLORS.tuft, { roughness: 0.6 });
  const hoofMat = toyMaterial(COLORS.hoof, { roughness: 0.55 });
  const scleraMat = toyMaterial(COLORS.sclera, { roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const irisMat = toyMaterial(COLORS.iris, { roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
  const pupilMat = toyMaterial(COLORS.pupil, { roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  const sphere = new THREE.SphereGeometry(1, 48, 32);

  // ---------- Chân ----------
  const legGeo = new THREE.CylinderGeometry(0.1, 0.125, 1.0, 32, 8);
  const hoofGeo = new THREE.CylinderGeometry(0.128, 0.145, 0.15, 32);
  const legs = new THREE.Group();
  root.add(legs);
  const legDefs = [
    [0.27, 0.36],
    [-0.27, 0.36],
    [0.25, -0.36],
    [-0.25, -0.36],
  ];
  for (const [x, z] of legDefs) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(mesh(legGeo, yellow, { pos: [0, 0.62, 0] }));
    g.add(mesh(hoofGeo, hoofMat, { pos: [0, 0.075, 0] }));
    // một đốm nhỏ trên đùi
    g.add(mesh(sphere, spot, { pos: [x > 0 ? 0.075 : -0.075, 0.9, z > 0 ? 0.06 : -0.06], scale: [0.045, 0.05, 0.045] }));
    legs.add(g);
  }

  // ---------- Thân ----------
  const body = new THREE.Group();
  body.position.set(0, 1.36, 0);
  root.add(body);
  const BA = 0.5, BB = 0.42, BC = 0.68;
  const bodyGeo = paintByNormal(new THREE.SphereGeometry(1, 48, 32), (x, y) => smooth(0.45, 0.8, -y));
  body.add(mesh(bodyGeo, yellowV, { scale: [BA, BB, BC] }));
  addSpotsOnEllipsoid(body, spot, BA, BB, BC, [
    [0.15, 1.2, 0.09], [0.6, 1.0, 0.08], [-0.4, 1.15, 0.1], [-0.9, 0.9, 0.08],
    [Math.PI - 0.15, 1.2, 0.09], [Math.PI - 0.6, 1.0, 0.08], [Math.PI + 0.4, 1.15, 0.1], [Math.PI + 0.9, 0.9, 0.08],
    [-Math.PI / 2, 0.55, 0.1], [-Math.PI / 2 + 0.6, 0.35, 0.08], [-Math.PI / 2 - 0.6, 0.35, 0.08],
    [0.3, 1.55, 0.07], [Math.PI - 0.3, 1.55, 0.07], [-1.3, 1.35, 0.07], [Math.PI + 1.3, 1.35, 0.07],
  ]);

  // ---------- Đuôi ----------
  const tail = new THREE.Group();
  tail.position.set(0, 0.12, -BC + 0.03);
  body.add(tail);
  const tailGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.55, 12);
  tail.add(mesh(tailGeo, yellow, { pos: [0, -0.25, -0.04], rot: [0.18, 0, 0] }));
  tail.add(mesh(sphere, tuftMat, { pos: [0, -0.55, -0.09], scale: [0.06, 0.11, 0.06] }));

  // ---------- Cổ ----------
  const neck = new THREE.Group();
  neck.position.set(0, 0.18, 0.4);
  body.add(neck);
  const NECK_H = 1.12;
  const NECK_R0 = 0.27, NECK_R1 = 0.17;
  const neckGeo = paintByNormal(new THREE.CylinderGeometry(NECK_R1, NECK_R0, NECK_H, 48, 12), (x, y, z) => smooth(0.5, 0.78, z));
  neck.add(mesh(neckGeo, yellowV, { pos: [0, NECK_H / 2, 0] }));
  // đốm trên hai bên/sau cổ
  const neckSpots = [
    [0.4, 0.2, 0.06], [1.0, -0.25, 0.055], [0.75, -0.6, 0.05],
    [-0.35, 0.22, 0.055], [-0.95, -0.2, 0.06], [-0.7, -0.55, 0.05],
    [0.2, -0.75, 0.05], [-0.15, -0.1, 0.045],
  ];
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (const [yy, ang, s] of neckSpots) {
    // yy: vị trí dọc (-1..1 => đáy..đỉnh), ang: góc quanh trục y (đơn vị π, tính từ phía sau)
    const h = NECK_H / 2 + yy * NECK_H * 0.42;
    const radius = THREE.MathUtils.lerp(NECK_R0, NECK_R1, h / NECK_H) - 0.004;
    const a = ang * Math.PI + Math.PI; // phía sau/bên
    const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const m = mesh(sphere, spot, { scale: [s, s * 1.2, 0.012] });
    m.position.set(n.x * radius, h, n.z * radius);
    m.quaternion.setFromUnitVectors(zAxis, n);
    neck.add(m);
  }

  // ---------- Đầu ----------
  const head = new THREE.Group();
  head.position.set(0, NECK_H - 0.08, 0);
  head.scale.setScalar(1.22);
  neck.add(head);

  head.add(mesh(sphere, yellow, { pos: [0, 0.34, 0.02], scale: [0.44, 0.4, 0.38] }));
  // má nối với mõm
  head.add(mesh(sphere, yellow, { pos: [0, 0.18, 0.2], scale: [0.3, 0.27, 0.3] }));

  // Mõm (trên) + hàm dưới có thể mở
  const muzzle = new THREE.Group();
  muzzle.position.set(0, 0.07, 0.4);
  head.add(muzzle);
  const MR = 0.22;
  const upperGeo = new THREE.SphereGeometry(MR, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const lowerGeo = new THREE.SphereGeometry(MR, 48, 24, 0, Math.PI * 2, Math.PI * 0.44, Math.PI * 0.56);
  const upper = mesh(upperGeo, muzzleMat, { scale: [1.2, 0.9, 1.0] });
  muzzle.add(upper);
  const cavity = mesh(sphere, mouthMat, { scale: [MR * 1.08, MR * 0.66, MR * 0.95], pos: [0, -0.015, -0.01] });
  // lớp tối phía sau răng che kín hai khoé miệng (không lộ phần đầu vàng bên trong)
  const throat = mesh(sphere, new THREE.MeshStandardMaterial({ color: COLORS.mouth, roughness: 0.95 }), {
    scale: [0.245, 0.075, 0.12], pos: [0, -0.02, -0.03],
  });
  throat.castShadow = false;
  muzzle.add(throat);
  cavity.castShadow = false;
  muzzle.add(cavity);
  for (const sx of [-1, 1]) {
    muzzle.add(mesh(sphere, nostrilMat, {
      pos: [sx * 0.085, 0.1, 0.165],
      scale: [0.035, 0.022, 0.02],
      rot: [-0.6, 0, sx * 0.4],
    }));
  }
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.0, -0.12);
  muzzle.add(jaw);
  const lower = mesh(lowerGeo, muzzleMat, { pos: [0, 0, 0.12], scale: [1.12, 0.78, 0.96] });
  jaw.add(lower);
  const tongue = mesh(sphere, tongueMat, { pos: [0, -0.05, 0.16], scale: [0.13, 0.05, 0.13] });
  tongue.castShadow = false;
  jaw.add(tongue);

  // Răng: hàm trên 6 chiếc (2 răng cửa to kiểu hoạt hình) gắn vào mõm, hàm dưới 4 chiếc gắn vào hàm.
  // Đặt lùi sau môi nên khi khép miệng thì bị che, chỉ lộ khi mở miệng / nhếch môi.
  const toothMat = toyMaterial('#fffaf0', { roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const addTeeth = (parent, specs, rx, rz, z0, yTop) => {
    for (const [deg, w, h] of specs) {
      const a = THREE.MathUtils.degToRad(deg);
      const t = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.024, 2, Math.min(w, h) * 0.28), toothMat);
      t.position.set(Math.sin(a) * rx, yTop - h / 2, z0 + Math.cos(a) * rz);
      t.rotation.y = a;
      t.castShadow = false;
      parent.add(t);
    }
  };
  // răng trên kéo dài lên trong môi để khi nhếch môi răng vẫn "mọc" từ lợi, không lơ lửng
  addTeeth(muzzle, [[-8, 0.056, 0.09], [8, 0.056, 0.09], [-24, 0.052, 0.08], [24, 0.052, 0.08], [-39, 0.046, 0.072], [39, 0.046, 0.072]],
    0.205, 0.163, 0, 0.012);
  addTeeth(jaw, [[-8, 0.046, 0.05], [8, 0.046, 0.05], [-24, 0.042, 0.045], [24, 0.042, 0.045]],
    0.175, 0.136, 0.12, -0.048);

  // Môi biến dạng: lưu toạ độ gốc của hai nửa mõm để uốn theo hình miệng mỗi khung hình.
  const lipMeshes = [
    { mesh: upper, base: upperGeo.attributes.position.array.slice(), rimV: Math.cos(Math.PI * 0.56), isUpper: true },
    { mesh: lower, base: lowerGeo.attributes.position.array.slice(), rimV: Math.cos(Math.PI * 0.44), isUpper: false },
  ];
  let lipKey = '';
  function deformLips(m) {
    const key = Object.values(m).map((v) => v.toFixed(3)).join(',');
    if (key === lipKey) return;
    lipKey = key;
    for (const L of lipMeshes) {
      const pos = L.mesh.geometry.attributes.position;
      const arr = pos.array;
      const b = L.base;
      for (let i = 0; i < arr.length; i += 3) {
        const x = b[i], y = b[i + 1], z = b[i + 2];
        const u = x / MR, v = y / MR, w = z / MR;
        // vùng ảnh hưởng: phía trước mõm, gần mép môi
        const front = THREE.MathUtils.smoothstep(w, -0.15, 0.85);
        const lip = Math.exp(-((v - L.rimV) ** 2) / 0.12);
        const k = front * lip;
        if (k < 1e-3) { arr[i] = x; arr[i + 1] = y; arr[i + 2] = z; continue; }
        const corner = u * u;
        const side = Math.sign(u);
        let nx = x * (1 + (m.stretch * 0.24 - m.pucker * 0.15) * k);
        let nz = z + MR * (m.pucker * 0.2 * (1 - corner) + m.lipPress * 0.04) * k;
        let ny = y + MR * (m.smile + m.smileAsym * side) * 0.26 * corner * k;
        if (L.isUpper) {
          // nhếch môi trên (lộ răng); chu môi thì khép khoé lại thành lỗ tròn nhỏ
          ny += MR * (m.upperRaise * 0.3 * (1 - 0.5 * corner) - m.lipPress * 0.04 - m.pucker * 0.1 * corner) * k;
        } else {
          ny += MR * (-m.lowerDrop * 0.5 * (1 - 0.5 * corner) + m.lipPress * 0.06 - m.lowerTuck * 0.2 + m.pucker * 0.12 * corner) * k;
          nz -= MR * m.lowerTuck * 0.16 * k; // F/V: môi dưới hạ và lùi vào dưới răng trên
        }
        arr[i] = nx; arr[i + 1] = ny; arr[i + 2] = nz;
      }
      pos.needsUpdate = true;
      L.mesh.geometry.computeVertexNormals();
    }
  }

  // Mắt
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(sx * 0.19, 0.44, 0.29);
    eye.rotation.set(0, sx * 0.28, 0);
    head.add(eye);
    eye.add(mesh(sphere, scleraMat, { scale: [0.14, 0.15, 0.115] }));
    const look = new THREE.Group();
    eye.add(look);
    look.add(mesh(sphere, irisMat, { pos: [0, 0, 0.068], scale: [0.1, 0.105, 0.055] }));
    look.add(mesh(sphere, pupilMat, { pos: [0, 0, 0.098], scale: [0.068, 0.072, 0.034] }));
    const glint = new THREE.Mesh(sphere, glintMat);
    glint.position.set(0.028, 0.04, 0.128);
    glint.scale.set(0.024, 0.024, 0.01);
    look.add(glint);
    const glint2 = glint.clone();
    glint2.position.set(-0.03, -0.035, 0.124);
    glint2.scale.set(0.011, 0.011, 0.006);
    look.add(glint2);
    // Mí mắt: nửa vỏ cầu, xoay quanh trục x để nhắm/mở
    const lidGeo = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    const lid = mesh(lidGeo, toyMaterial(COLORS.yellow, { side: THREE.DoubleSide }), { scale: [0.152, 0.162, 0.127] });
    const lidPivot = new THREE.Group();
    lidPivot.add(lid);
    eye.add(lidPivot);
    eyes.push({ eye, look, lidPivot, side: sx });
  }

  // Tai
  const ears = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.33, 0.53, -0.04);
    head.add(pivot);
    const ear = new THREE.Group();
    ear.rotation.set(0, -sx * 0.35, sx * 0.32);
    pivot.add(ear);
    ear.add(mesh(sphere, yellow, { pos: [sx * 0.24, 0, 0], scale: [0.27, 0.15, 0.055] }));
    ear.add(mesh(sphere, white, { pos: [sx * 0.26, 0, 0.032], scale: [0.205, 0.105, 0.03] }));
    ears.push({ pivot, side: sx });
  }

  // Sừng (ossicones)
  const hornGeo = new THREE.CylinderGeometry(0.045, 0.058, 0.3, 20);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Group();
    horn.position.set(sx * 0.13, 0.67, -0.04);
    horn.rotation.set(-0.1, 0, -sx * 0.14);
    head.add(horn);
    horn.add(mesh(hornGeo, yellow, { pos: [0, 0.14, 0] }));
    horn.add(mesh(sphere, tipMat, { pos: [0, 0.31, 0], scale: [0.078, 0.075, 0.078] }));
  }
  // Chỏm lông nâu giữa trán
  head.add(mesh(sphere, tuftMat, { pos: [0, 0.71, 0.1], scale: [0.065, 0.11, 0.07], rot: [0.45, 0, 0] }));
  head.add(mesh(sphere, tuftMat, { pos: [0, 0.66, 0.08], scale: [0.08, 0.06, 0.08] }));

  // Bờm sau cổ
  for (let i = 0; i < 6; i++) {
    const h = 0.15 + i * 0.17;
    const radius = THREE.MathUtils.lerp(NECK_R0, NECK_R1, h / NECK_H);
    neck.add(mesh(sphere, tuftMat, { pos: [0, h, -radius + 0.01], scale: [0.04, 0.09, 0.05] }));
  }

  const parts = { body, neck, head, muzzle, jaw, upper, lower, cavity, tongue, eyes, ears, tail, legs };

  // Áp dụng tư thế (pose) cho mô hình. Mọi giá trị đều tương đối, mặc định 0.
  function setPose(p) {
    // Thân: nhún/thở
    body.position.y = 1.36 + (p.bodyY || 0);
    body.scale.set(1 + (p.breath || 0) * 0.5, 1 - (p.squash || 0) + (p.breath || 0), 1);
    body.rotation.z = (p.bodyRoll || 0);
    root.rotation.y = p.turn || 0;

    neck.rotation.set(0.0 + (p.neckPitch || 0), p.neckYaw || 0, p.neckRoll || 0);
    head.rotation.set(p.headPitch || 0, p.headYaw || 0, p.headRoll || 0, 'YXZ');

    // Miệng: hàm + môi biến dạng theo hình miệng (viseme)
    const c01 = (v) => THREE.MathUtils.clamp(v || 0, 0, 1);
    const jawOpen = c01(p.jaw);
    const m = {
      stretch: THREE.MathUtils.clamp(p.stretch || 0, -1, 1),
      pucker: c01(p.pucker),
      upperRaise: c01(p.upperRaise),
      lowerDrop: c01(p.lowerDrop),
      lowerTuck: c01(p.lowerTuck),
      lipPress: c01(p.lipPress),
      smile: THREE.MathUtils.clamp(p.smile || 0, -1, 1),
      smileAsym: THREE.MathUtils.clamp(p.smileAsym || 0, -1, 1),
    };
    jaw.rotation.x = jawOpen * 0.55;
    jaw.position.z = -0.12 + jawOpen * 0.012; // hàm hơi đưa ra khi há to
    deformLips(m);
    // má/mõm co giãn nhẹ theo miệng (squash & stretch)
    muzzle.scale.set(
      1 + jawOpen * 0.04 + m.stretch * 0.05 - m.pucker * 0.06,
      1 + jawOpen * 0.06 - m.lipPress * 0.03,
      1 + m.pucker * 0.05 + m.lipPress * 0.02,
    );
    // nói lệch về một bên miệng
    muzzle.position.x = (p.mouthShift || 0) * 0.025;
    muzzle.rotation.y = (p.mouthShift || 0) * 0.08;
    tongue.position.set(0, -0.05 + c01(p.tongueUp) * 0.035, 0.15 + jawOpen * 0.02);
    tongue.rotation.x = -c01(p.tongueUp) * 0.35;

    // Mắt
    const blink = THREE.MathUtils.clamp(p.blink || 0, 0, 1);
    const eyeWide = THREE.MathUtils.clamp(p.eyeWide || 0, -1, 1);
    const open = -0.75 - eyeWide * 0.25; // góc mí khi mở (âm = mí ra sau)
    const closed = 1.62;
    for (const e of eyes) {
      e.lidPivot.rotation.x = THREE.MathUtils.lerp(open, closed, blink);
      // bù góc xoay ra ngoài của nhãn cầu để con ngươi nhìn thẳng về phía trước
      e.look.rotation.set(-(p.lookY || 0) * 0.35, (p.lookX || 0) * 0.45 - e.side * 0.22, 0);
      const s = 1 + eyeWide * 0.06;
      e.eye.scale.set(s, s, s);
    }

    // Tai
    for (const e of ears) {
      const v = e.side < 0 ? p.earL || 0 : p.earR || 0;
      // v > 0: vểnh lên; v < 0: cụp xuống
      e.pivot.rotation.set(0, -e.side * (p.earBack || 0) * 0.5, e.side * v * 0.45);
    }

    tail.rotation.set(0.1 + (p.tailLift || 0) * 0.4, 0, p.tail || 0);
  }

  setPose({});
  return { root, parts, setPose };
}
