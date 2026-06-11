// Interactive 3D trace viewer for the project page (replaces the pre-rendered
// MP4 grid in section 1.2). Loads the point cloud (.bin) and trajectories
// (.json) exported by tmp_webpage/export_3d_interactive.py and renders them
// with Three.js. The user can orbit / zoom; the 2D input frame is shown as a
// flat overlay in the top-left. No camera frustum (per design).
//
// Frame convention matches the viser viewer (`set_up_direction("-y")`): world
// up is -Y, so the camera `up` is set to (0, -1, 0).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

const DATA_BASE = './static/data/3d_interactive';
const IMG_BASE = './static/data/3d_interactive';

// --- color helpers -------------------------------------------------------
// Dynamic "age" ramp from the viser viewer: hue = 0.75 * (1 - frac) sweeps
// purple (frac=0, the current keypoint) -> blue -> green -> yellow -> red
// (frac=1, the track's last valid step). s=0.9, v=0.95.
function ageColor(frac) {
  const f = Math.min(Math.max(frac, 0), 1);
  const c = new THREE.Color();
  c.setHSL(0.75 * (1 - f), 0.9, 0.62); // setHSL lightness ~ HSV v with s baked in
  return c;
}
const PURPLE = ageColor(0);

// Build per-segment endpoint positions + colors for one trajectory group
// across all tracks. `tracks` is an array of { pts:[[x,y,z]...], valid:[bool] }
// where pts[0] is the anchor (current kp). Returns flat positions/colors arrays
// suitable for LineSegmentsGeometry. `colorFn(frac)` -> Color, where frac is the
// segment endpoint's position within the track's own valid horizon (0..1).
function buildSegments(tracks, colorFn) {
  const positions = [];
  const colors = [];
  const steps = []; // endpoint index (j+1) per segment, for timestep filtering
  for (const tr of tracks) {
    const pts = tr.pts;
    const valid = tr.valid;
    // first/last valid index for this track's own horizon
    let first = -1, last = -1;
    for (let i = 0; i < pts.length; i++) {
      const ok = valid[i] && isFinite(pts[i][0]);
      if (ok) { if (first < 0) first = i; last = i; }
    }
    if (first < 0 || last <= first) continue;
    for (let j = 0; j + 1 < pts.length; j++) {
      const okA = valid[j] && isFinite(pts[j][0]);
      const okB = valid[j + 1] && isFinite(pts[j + 1][0]);
      if (!okA || !okB) continue;
      positions.push(pts[j][0], pts[j][1], pts[j][2], pts[j + 1][0], pts[j + 1][1], pts[j + 1][2]);
      const frac = (j + 1 - first) / (last - first);
      const col = colorFn(frac);
      colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
      steps.push(j + 1);
    }
  }
  return { positions, colors, steps };
}

// Keep only the segments whose endpoint index is <= maxStep (used by the
// timestep slider to progressively reveal the trace). Colors are fixed per
// segment, so the visible portion grows/shrinks without recoloring.
function filterByStep(data, maxStep) {
  const positions = [];
  const colors = [];
  const { positions: P, colors: C, steps } = data;
  for (let k = 0; k < steps.length; k++) {
    if (steps[k] > maxStep) continue;
    const base = k * 6;
    for (let m = 0; m < 6; m++) { positions.push(P[base + m]); colors.push(C[base + m]); }
  }
  return { positions, colors };
}

class TraceViewer {
  constructor(container) {
    this.container = container;
    this.disposables = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f7);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      55, container.clientWidth / container.clientHeight, 0.01, 100
    );
    this.camera.up.set(0, -1, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.resolution = new THREE.Vector2(container.clientWidth, container.clientHeight);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    this.show = { pred: true, gt: false, kp: true, points: true };
    this.timestep = Infinity;
    this.maxStep = 0;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._animate = this._animate.bind(this);
    this._raf = requestAnimationFrame(this._animate);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.resolution.set(w, h);
    for (const m of this._lineMaterials || []) m.resolution.copy(this.resolution);
  }

  _clear() {
    for (const line of [this.predLine, this.gtLine, this.histLine]) {
      if (line) this._disposeLine(line);
    }
    this.predLine = this.gtLine = this.histLine = null;
    this.predData = this.gtData = null;
    for (const d of this.disposables) {
      if (d.geometry) d.geometry.dispose();
      if (d.material) d.material.dispose();
    }
    this.disposables = [];
    this._lineMaterials = [];
    while (this.group.children.length) this.group.remove(this.group.children[0]);
  }

  _makeLine(positions, colors, width) {
    if (!positions.length) return null;
    const geo = new LineSegmentsGeometry();
    geo.setPositions(positions);
    geo.setColors(colors);
    const mat = new LineMaterial({
      linewidth: width,
      vertexColors: true,
      worldUnits: false,
      alphaToCoverage: true,
    });
    mat.resolution.copy(this.resolution);
    const line = new LineSegments2(geo, mat);
    line.computeLineDistances();
    this.group.add(line);
    this._lineMaterials.push(mat);
    return line;
  }

  _disposeLine(line) {
    this.group.remove(line);
    if (line.geometry) line.geometry.dispose();
    if (line.material) {
      const idx = this._lineMaterials.indexOf(line.material);
      if (idx >= 0) this._lineMaterials.splice(idx, 1);
      line.material.dispose();
    }
  }

  // (Re)build the pred / GT trace lines showing only segments up to `t`.
  _renderTraces(t) {
    this.timestep = t;
    if (this.predLine) { this._disposeLine(this.predLine); this.predLine = null; }
    if (this.gtLine) { this._disposeLine(this.gtLine); this.gtLine = null; }
    if (this.predData) {
      const f = filterByStep(this.predData, t);
      this.predLine = this._makeLine(f.positions, f.colors, 4.5);
      if (this.predLine) this.predLine.visible = this.show.pred;
    }
    if (this.gtData) {
      const f = filterByStep(this.gtData, t);
      this.gtLine = this._makeLine(f.positions, f.colors, 3.0);
      if (this.gtLine) this.gtLine.visible = this.show.gt;
    }
  }

  setTimestep(t) {
    this._renderTraces(t);
  }

  async load(id) {
    this._clear();
    this.resize(); // pick up final layout size before the first render
    const [meta, buf] = await Promise.all([
      fetch(`${DATA_BASE}/${encodeURIComponent(id)}.json`).then((r) => r.json()),
      fetch(`${DATA_BASE}/${encodeURIComponent(id)}.bin`).then((r) => r.arrayBuffer()),
    ]);
    this.meta = meta;

    // --- point cloud: Float32 xyz (N*3) then Uint8 rgb (N*3) ---
    const n = meta.n_points;
    const pos = new Float32Array(buf, 0, n * 3);
    const rgb = new Uint8Array(buf, n * 3 * 4, n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) col[i] = rgb[i] / 255;
    const pcGeo = new THREE.BufferGeometry();
    pcGeo.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
    pcGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pcMat = new THREE.PointsMaterial({ size: 0.007, vertexColors: true, sizeAttenuation: true });
    this.points = new THREE.Points(pcGeo, pcMat);
    this.points.visible = this.show.points;
    this.group.add(this.points);
    this.disposables.push(this.points);

    // --- trajectories ---
    const cur = meta.current_kp;
    // pred: anchor current kp + F predicted steps
    const predTracks = meta.pred.map((steps, i) => ({
      pts: [cur[i], ...steps],
      valid: [true, ...meta.valid_pred[i]],
    }));
    const gtTracks = meta.gt.map((steps, i) => ({
      pts: [cur[i], ...steps],
      valid: [true, ...meta.valid_pred[i]],
    }));
    const histTracks = meta.history.map((steps, i) => ({
      pts: [...steps, cur[i]],
      valid: [...meta.valid_history[i], true],
    }));

    // Pred / GT are kept as raw segment data so the timestep slider can reveal
    // them progressively; history is static context (always shown).
    this.predData = buildSegments(predTracks, ageColor);
    this.gtData = buildSegments(gtTracks, (f) => ageColor(f).lerp(new THREE.Color(0.5, 0.5, 0.5), 0.5));
    this.maxStep = meta.pred.length ? meta.pred[0].length : 0; // F future steps
    this.timestep = this.maxStep;
    this._renderTraces(this.maxStep);

    const histSeg = buildSegments(histTracks, () => PURPLE.clone().lerp(new THREE.Color(1, 1, 1), 0.45));
    this.histLine = this._makeLine(histSeg.positions, histSeg.colors, 2.5);
    if (this.histLine) this.histLine.visible = true;

    // current keypoints as small purple dots
    const kpGeo = new THREE.BufferGeometry();
    kpGeo.setAttribute('position', new THREE.Float32BufferAttribute(cur.flat(), 3));
    const kpMat = new THREE.PointsMaterial({ size: 0.018, color: PURPLE, sizeAttenuation: true });
    this.kp = new THREE.Points(kpGeo, kpMat);
    this.kp.visible = this.show.kp;
    this.group.add(this.kp);
    this.disposables.push(this.kp);

    this._frameCamera(meta);
    return meta;
  }

  // Start near the original camera POV (so it lines up with the 2D overlay),
  // then rotate ~28 deg about the up axis so depth is immediately visible.
  _frameCamera(meta) {
    const cen = new THREE.Vector3().fromArray(meta.camera.centroid);
    const c2w = meta.camera.c2w;
    const camPos = new THREE.Vector3(c2w[0][3], c2w[1][3], c2w[2][3]);
    const up = new THREE.Vector3().fromArray(meta.camera.up).normalize();

    let dir = camPos.clone().sub(cen);
    const dist = dir.length() || 1;
    dir.normalize().applyAxisAngle(up, THREE.MathUtils.degToRad(28));
    const start = cen.clone().add(dir.multiplyScalar(dist * 1.05));

    this.camera.position.copy(start);
    this.camera.up.copy(up);
    this.controls.target.copy(cen);
    this.home = { pos: start.clone(), target: cen.clone() };
    this.controls.update();
  }

  resetView() {
    if (!this.home) return;
    this.camera.position.copy(this.home.pos);
    this.controls.target.copy(this.home.target);
    this.controls.update();
  }

  setVisible(key, on) {
    this.show[key] = on;
    if (key === 'points' && this.points) this.points.visible = on;
    if (key === 'pred' && this.predLine) this.predLine.visible = on;
    if (key === 'gt' && this.gtLine) this.gtLine.visible = on;
    if (key === 'kp' && this.kp) this.kp.visible = on;
  }

  _animate() {
    this._raf = requestAnimationFrame(this._animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// --- page wiring ---------------------------------------------------------
async function init() {
  const mount = document.getElementById('trace-3d-interactive');
  if (!mount) return;

  const manifest = await fetch(`${DATA_BASE}/manifest.json`).then((r) => r.json());
  const groups = manifest.groups;

  const canvasHost = mount.querySelector('.t3d-canvas');
  const imgEl = mount.querySelector('.t3d-overlay-img');
  const taskEl = mount.querySelector('.t3d-task');
  const sampleBar = mount.querySelector('.t3d-samples');
  const groupBtns = mount.querySelectorAll('.t3d-group-buttons button[data-3d-group]');
  const slider = mount.querySelector('.t3d-timestep');
  const stepVal = mount.querySelector('.t3d-timestep-val');
  const stepMax = mount.querySelector('.t3d-timestep-max');

  const viewer = new TraceViewer(canvasHost);

  async function selectSample(s) {
    const meta = await viewer.load(s.id);
    imgEl.src = `${IMG_BASE}/${encodeURIComponent(s.id)}.png`;
    taskEl.textContent = meta.task || s.label;
    if (slider) {
      slider.max = String(viewer.maxStep);
      slider.value = String(viewer.maxStep);
      if (stepVal) stepVal.textContent = String(viewer.maxStep);
      if (stepMax) stepMax.textContent = String(viewer.maxStep);
    }
    Array.from(sampleBar.children).forEach((b) =>
      b.classList.toggle('is-primary', b.dataset.id === s.id)
    );
  }

  function buildSamples(group) {
    sampleBar.innerHTML = '';
    groups[group].forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'button is-small t3d-sample-btn';
      b.textContent = s.label;
      b.dataset.id = s.id;
      b.addEventListener('click', () => selectSample(s));
      sampleBar.appendChild(b);
      if (i === 0) selectSample(s);
    });
  }

  groupBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      groupBtns.forEach((b) => b.classList.remove('is-primary'));
      btn.classList.add('is-primary');
      buildSamples(btn.getAttribute('data-3d-group'));
    });
  });

  // toggles
  mount.querySelectorAll('.t3d-toggle[data-layer]').forEach((cb) => {
    cb.addEventListener('change', () => viewer.setVisible(cb.dataset.layer, cb.checked));
  });
  const resetBtn = mount.querySelector('.t3d-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => viewer.resetView());

  if (slider) {
    slider.addEventListener('input', () => {
      const t = parseInt(slider.value, 10);
      if (stepVal) stepVal.textContent = String(t);
      viewer.setTimestep(t);
    });
  }

  buildSamples('robot');
  // Keep the viewer sized correctly once layout settles.
  setTimeout(() => viewer.resize(), 100);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
