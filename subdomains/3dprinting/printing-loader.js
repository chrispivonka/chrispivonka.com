import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as fflate from "fflate";
import PRINTING_CONFIG from "./printing-config.js";
import {
  escapeHtml, jobTitle, prettyJobName, modelFormatFromUrl, modelFormatFromBytes,
  slicedPlateNumber, parse3mfTransform, formatUptime, isTelemetryStale, formatCompletedAt
} from "./printing-format.js";

const POLL_INTERVAL_MS = 5000;
const PRODUCTION_NS = "http://schemas.microsoft.com/3dmanufacturing/production/2015/06";
const MODEL_COLORS = [0x58a6ff, 0x3fb950, 0xbc8cff, 0xd29922, 0xf778ba, 0x39c5cf];

let pollTimer = null;
let latestTelemetry = null;

// What the viewport is showing.
//  - viewKey: identity of the current live view, so a poll only re-renders
//    the viewport when the live job/model actually changed.
//  - selection: set when the visitor picked a history row or loaded a file;
//    polling then leaves the viewport alone until they return to live.
let viewKey = null;
let selection = null;
let loadGeneration = 0;
let historySignature = null;

// three.js scene state + listeners to tear down on the next render.
let animFrameId = null;
let sceneDisposers = [];

async function fetchPrinterTelemetry() {
  try {
    const res = await fetch(PRINTING_CONFIG.telemetryUrl || "./printer-status.json", {
      cache: "no-store"
    });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

function cleanupViewport() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  sceneDisposers.forEach(dispose => {
    try {
      dispose();
    } catch (err) {
      console.warn("Viewport cleanup failed:", err);
    }
  });
  sceneDisposers = [];
}

// ─────────────────────────────────────────────
// 3MF parsing (Bambu Studio / OrcaSlicer project + sliced files)
// ─────────────────────────────────────────────

function normalizeZipPath(path) {
  return String(path || "").replace(/^\/+/, "");
}

function findRootModelPath(files) {
  const rels = files["_rels/.rels"];
  if (rels) {
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(rels), "text/xml");
    for (const rel of doc.getElementsByTagName("Relationship")) {
      const target = normalizeZipPath(rel.getAttribute("Target"));
      if (target.toLowerCase().endsWith(".model") && files[target]) {
        return target;
      }
    }
  }
  if (files["3D/3dmodel.model"]) {
    return "3D/3dmodel.model";
  }
  return Object.keys(files).find(f => f.toLowerCase().endsWith(".model")) || null;
}

/** Object ids that belong to the sliced plate, from Bambu's Metadata/model_settings.config. */
function plateObjectIds(files) {
  const plate = slicedPlateNumber(Object.keys(files));
  const config = files["Metadata/model_settings.config"];
  if (!plate || !config) {
    return null;
  }
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(config), "text/xml");
  for (const plateEl of doc.getElementsByTagName("plate")) {
    const meta = [...plateEl.children].filter(c => c.tagName === "metadata");
    const id = meta.find(m => m.getAttribute("key") === "plater_id");
    if (!id || id.getAttribute("value") !== plate) {
      continue;
    }
    const ids = new Set();
    for (const inst of plateEl.getElementsByTagName("model_instance")) {
      for (const m of inst.getElementsByTagName("metadata")) {
        if (m.getAttribute("key") === "object_id") {
          ids.add(m.getAttribute("value"));
        }
      }
    }
    return ids.size ? ids : null;
  }
  return null;
}

function meshToGeometry(meshEl) {
  const vertexEls = meshEl.getElementsByTagName("vertex");
  const positions = new Float32Array(vertexEls.length * 3);
  for (let i = 0; i < vertexEls.length; i++) {
    const v = vertexEls[i];
    positions[i * 3] = parseFloat(v.getAttribute("x")) || 0;
    positions[i * 3 + 1] = parseFloat(v.getAttribute("y")) || 0;
    positions[i * 3 + 2] = parseFloat(v.getAttribute("z")) || 0;
  }
  const triangleEls = meshEl.getElementsByTagName("triangle");
  const indices = new Uint32Array(triangleEls.length * 3);
  for (let i = 0; i < triangleEls.length; i++) {
    const t = triangleEls[i];
    indices[i * 3] = parseInt(t.getAttribute("v1"), 10);
    indices[i * 3 + 1] = parseInt(t.getAttribute("v2"), 10);
    indices[i * 3 + 2] = parseInt(t.getAttribute("v3"), 10);
  }
  if (positions.length === 0 || indices.length === 0) {
    return null;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function applyTransform(object3d, attr) {
  const m = parse3mfTransform(attr);
  if (m) {
    new THREE.Matrix4().set(...m).decompose(object3d.position, object3d.quaternion, object3d.scale);
  }
}

function makeMaterial(index) {
  return new THREE.MeshStandardMaterial({
    color: MODEL_COLORS[index % MODEL_COLORS.length],
    roughness: 0.35,
    metalness: 0.3,
    side: THREE.DoubleSide
  });
}

export function parse3MFToGroup(arrayBuffer) {
  const files = fflate.unzipSync(new Uint8Array(arrayBuffer));
  const parser = new DOMParser();
  const docs = new Map();
  const getDoc = (path) => {
    const key = normalizeZipPath(path);
    if (!docs.has(key)) {
      const bytes = files[key];
      docs.set(key, bytes ? parser.parseFromString(new TextDecoder().decode(bytes), "text/xml") : null);
    }
    return docs.get(key);
  };
  const findObject = (path, id) => {
    const doc = getDoc(path);
    if (!doc) {
      return null;
    }
    return [...doc.getElementsByTagName("object")].find(o => o.getAttribute("id") === id) || null;
  };

  const geometryCache = new Map();
  let colorIndex = 0;

  const buildObject = (path, id, depth = 0) => {
    const objectEl = depth < 8 ? findObject(path, id) : null;
    if (!objectEl) {
      return null;
    }
    const meshEl = objectEl.getElementsByTagName("mesh")[0];
    if (meshEl && meshEl.parentNode === objectEl) {
      const key = `${normalizeZipPath(path)}#${id}`;
      if (!geometryCache.has(key)) {
        geometryCache.set(key, meshToGeometry(meshEl));
      }
      const geometry = geometryCache.get(key);
      return geometry ? new THREE.Mesh(geometry, makeMaterial(colorIndex)) : null;
    }
    const group = new THREE.Group();
    for (const comp of objectEl.getElementsByTagName("component")) {
      const compPath = comp.getAttributeNS(PRODUCTION_NS, "path") || comp.getAttribute("p:path") || path;
      const child = buildObject(compPath, comp.getAttribute("objectid"), depth + 1);
      if (child) {
        applyTransform(child, comp.getAttribute("transform"));
        group.add(child);
      }
    }
    return group.children.length ? group : null;
  };

  const rootPath = findRootModelPath(files);
  const root = new THREE.Group();
  const rootDoc = rootPath ? getDoc(rootPath) : null;

  if (rootDoc) {
    let items = [...rootDoc.getElementsByTagName("item")];
    const onPlate = plateObjectIds(files);
    if (onPlate) {
      const filtered = items.filter(item => onPlate.has(item.getAttribute("objectid")));
      if (filtered.length) {
        items = filtered;
      }
    }
    for (const item of items) {
      const obj = buildObject(item.getAttribute("p:path") || rootPath, item.getAttribute("objectid"));
      if (obj) {
        applyTransform(obj, item.getAttribute("transform"));
        root.add(obj);
        colorIndex++;
      }
    }
  }

  // Fallback for files without a usable build section: show every mesh.
  if (root.children.length === 0) {
    for (const name of Object.keys(files)) {
      if (!name.toLowerCase().endsWith(".model")) {
        continue;
      }
      for (const meshEl of getDoc(name).getElementsByTagName("mesh")) {
        const geometry = meshToGeometry(meshEl);
        if (geometry) {
          root.add(new THREE.Mesh(geometry, makeMaterial(colorIndex++)));
        }
      }
    }
  }

  if (root.children.length === 0) {
    throw new Error("This 3MF file has no 3D geometry in it");
  }
  return root;
}

// ─────────────────────────────────────────────
// Viewport rendering
// ─────────────────────────────────────────────

function overlayHtml({ title, kind, wireframe = false }) {
  const backBtn = selection
    ? "<button type=\"button\" id=\"back-to-live-btn\" class=\"viewer-btn viewer-btn-live\">● Back to live</button>"
    : "";
  const wireBtn = wireframe
    ? "<button type=\"button\" id=\"toggle-wireframe-btn\" class=\"viewer-btn\">Wireframe</button>"
    : "";
  return `
    <div class="viewer-overlay">
      <i class="bi bi-box-seam" style="color:var(--cyan);"></i>
      <span><strong>${escapeHtml(title)}</strong>${kind ? ` <span class="viewer-kind">${escapeHtml(kind)}</span>` : ""}</span>
      ${wireBtn}
      <label for="stl-file-input" class="viewer-btn viewer-btn-primary">Open STL / 3MF…</label>
      ${backBtn}
    </div>
  `;
}

function wireOverlay(container) {
  const back = container.querySelector("#back-to-live-btn");
  if (back) {
    back.addEventListener("click", () => {
      selection = null;
      viewKey = null;
      document.querySelectorAll(".history-row").forEach(r => r.classList.remove("active-history-row"));
      if (latestTelemetry) {
        showLiveView(container, latestTelemetry);
      }
    });
  }
}

function renderMessage(container, { title, message, kind = "" }) {
  cleanupViewport();
  container.innerHTML = `
    <div class="viewer-message">
      <i class="bi bi-box" style="font-size:2rem; color:var(--text-muted);"></i>
      <p>${escapeHtml(message)}</p>
    </div>
    ${overlayHtml({ title, kind })}
  `;
  wireOverlay(container);
}

function renderImage(container, { url, title, kind }) {
  cleanupViewport();
  container.innerHTML = `
    <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#0d1117;">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(`Plate preview of ${title}`)}" style="max-width:100%; max-height:100%; object-fit:contain;" />
    </div>
    ${overlayHtml({ title, kind })}
  `;
  const img = container.querySelector("img");
  img.addEventListener("error", () => {
    renderMessage(container, { title, message: "The preview image for this print couldn't be loaded." });
  });
  wireOverlay(container);
}

function renderScene(container, modelGroup, { title, kind }) {
  cleanupViewport();
  container.innerHTML = `
    <div class="threejs-viewport" style="width:100%; height:100%; position:relative;"></div>
    ${overlayHtml({ title, kind, wireframe: true })}
  `;
  wireOverlay(container);

  const viewport = container.querySelector(".threejs-viewport");
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 450;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x161b22);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewport.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight1.position.set(100, 200, 100);
  scene.add(dirLight1);
  const dirLight2 = new THREE.DirectionalLight(0xbc8cff, 0.6);
  dirLight2.position.set(-100, -100, -50);
  scene.add(dirLight2);

  // Printer files are Z-up; three.js is Y-up. Rotate, then center on origin
  // inside a pivot so auto-rotation spins the model around its own middle.
  modelGroup.rotation.x = -Math.PI / 2;
  const pivot = new THREE.Group();
  pivot.add(modelGroup);
  scene.add(pivot);

  const box = new THREE.Box3().setFromObject(pivot);
  if (!box.isEmpty()) {
    modelGroup.position.sub(box.getCenter(new THREE.Vector3()));
  }
  const size = box.isEmpty() ? new THREE.Vector3(40, 40, 40) : box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 40;
  camera.position.set(0, maxDim * 0.9, maxDim * 1.8);
  camera.near = maxDim / 100;
  camera.far = maxDim * 100;
  camera.updateProjectionMatrix();
  camera.lookAt(0, 0, 0);

  // Dragging pauses auto-rotation for a few seconds; zooming doesn't.
  let autoRotate = true;
  let inactivityTimer = null;
  const onDragStart = () => {
    autoRotate = false;
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  };
  const onDragEnd = () => {
    if (!autoRotate && !inactivityTimer) {
      inactivityTimer = setTimeout(() => {
        autoRotate = true;
        inactivityTimer = null;
      }, 5000);
    }
  };
  const onResize = () => {
    if (!container.clientWidth) {
      return;
    }
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  renderer.domElement.addEventListener("pointerdown", onDragStart);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("resize", onResize);

  const materials = [];
  modelGroup.traverse(child => {
    if (child.isMesh && child.material) {
      materials.push(child.material);
    }
  });
  const toggleBtn = container.querySelector("#toggle-wireframe-btn");
  let isWire = false;
  toggleBtn.addEventListener("click", () => {
    isWire = !isWire;
    materials.forEach(m => {
      m.wireframe = isWire;
    });
    toggleBtn.textContent = isWire ? "Solid" : "Wireframe";
  });

  sceneDisposers.push(() => {
    clearTimeout(inactivityTimer);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("resize", onResize);
    controls.dispose();
    modelGroup.traverse(child => {
      if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
    renderer.dispose();
  });

  const animate = () => {
    animFrameId = requestAnimationFrame(animate);
    if (autoRotate) {
      pivot.rotation.y += 0.003;
    }
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
}

function buildModelGroup(arrayBuffer, formatHint) {
  // Trust the bytes over the hint: a 3MF is a ZIP, anything else is STL.
  const format = modelFormatFromBytes(arrayBuffer) === "3mf" ? "3mf" : (formatHint === "3mf" ? "3mf" : "stl");
  if (format === "3mf") {
    return { group: parse3MFToGroup(arrayBuffer), kind: "3MF" };
  }
  const geometry = new STLLoader().parse(arrayBuffer);
  if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
    throw new Error("This STL file has no triangles in it");
  }
  geometry.computeVertexNormals();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, makeMaterial(0)));
  return { group, kind: "STL" };
}

function renderArrayBuffer(container, arrayBuffer, { title, formatHint }) {
  try {
    const { group, kind } = buildModelGroup(arrayBuffer, formatHint);
    renderScene(container, group, { title, kind });
  } catch (err) {
    console.warn("Could not render model:", err);
    renderMessage(container, { title, message: `This model couldn't be displayed: ${err.message}` });
  }
}

async function renderModelUrl(container, { url, title, thumbnailUrl }) {
  const generation = ++loadGeneration;
  renderMessage(container, { title, message: "Loading 3D model…" });
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`the file returned HTTP ${res.status}`);
    }
    const buffer = await res.arrayBuffer();
    if (generation !== loadGeneration) {
      return; // a newer load started while this one was downloading
    }
    renderArrayBuffer(container, buffer, { title, formatHint: modelFormatFromUrl(url) });
  } catch (err) {
    if (generation !== loadGeneration) {
      return;
    }
    console.warn("Could not load model:", err);
    if (thumbnailUrl) {
      renderImage(container, { url: thumbnailUrl, title, kind: "plate preview" });
    } else {
      renderMessage(container, { title, message: `The saved model for this print couldn't be loaded (${err.message}).` });
    }
  }
}

/** Show a history entry or the live job: real model > plate preview > honest message. */
function showEntry(container, entry, { liveTitle } = {}) {
  const title = liveTitle || jobTitle(entry);
  if (entry && entry.modelUrl) {
    renderModelUrl(container, { url: entry.modelUrl, title, thumbnailUrl: entry.thumbnailUrl });
  } else if (entry && entry.thumbnailUrl) {
    ++loadGeneration;
    renderImage(container, { url: entry.thumbnailUrl, title, kind: "plate preview" });
  } else {
    ++loadGeneration;
    renderMessage(container, {
      title,
      message: "No 3D model or preview was saved for this print."
    });
  }
}

function renderStreamFeed(container, telemetry) {
  cleanupViewport();
  ++loadGeneration;
  const isIframe = Boolean(telemetry.streamUrl);
  const badgeText = isIframe ? "● LIVE STREAM" : "● LIVE SNAPSHOT";
  container.innerHTML = `
    <div style="width:100%; height:100%; position:relative; background:#000;">
      ${isIframe
    ? `<iframe src="${escapeHtml(telemetry.streamUrl)}" title="Live printer camera" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="width:100%; height:100%;"></iframe>`
    : `<img src="${escapeHtml(telemetry.snapshotUrl)}" alt="Live printer camera snapshot" style="width:100%; height:100%; object-fit:contain;" />`}
      <div class="viewer-stream-badge">
        <span>${badgeText}</span>
        <button type="button" id="switch-to-cad-btn" class="viewer-btn">View model</button>
      </div>
    </div>
  `;
  container.querySelector("#switch-to-cad-btn").addEventListener("click", () => {
    selection = { source: "live-model" };
    showEntry(container, telemetry, { liveTitle: jobTitle(telemetry) });
  });
}

function liveViewKey(telemetry) {
  if (!telemetry) {
    return "none";
  }
  const isPrinting = telemetry.status === "PRINTING";
  const hasStream = Boolean(telemetry.streamUrl || telemetry.snapshotUrl);
  if (isPrinting && hasStream) {
    return `stream|${telemetry.streamUrl || telemetry.snapshotUrl}`;
  }
  const entry = liveEntry(telemetry);
  return `entry|${jobTitle(entry)}|${entry.modelUrl || ""}|${entry.thumbnailUrl || ""}`;
}

/** What to show when nobody picked anything: the current job, else the most recent print. */
function liveEntry(telemetry) {
  if (telemetry.status === "PRINTING" || telemetry.modelUrl || telemetry.thumbnailUrl) {
    return { ...telemetry, title: telemetry.title || telemetry.fileName };
  }
  const last = (telemetry.printHistory || [])[0];
  return last || telemetry;
}

function showLiveView(container, telemetry) {
  if (!container) {
    return;
  }
  const key = liveViewKey(telemetry);
  if (key === viewKey) {
    return;
  }
  viewKey = key;
  if (!telemetry) {
    ++loadGeneration;
    renderMessage(container, {
      title: "Printer offline",
      message: "Live printer telemetry isn't available right now. You can still open an STL or 3MF file to view it."
    });
    return;
  }
  if (key.startsWith("stream|")) {
    renderStreamFeed(container, telemetry);
    return;
  }
  showEntry(container, liveEntry(telemetry));
}

// ─────────────────────────────────────────────
// Telemetry panels
// ─────────────────────────────────────────────

function renderLiveJobCard(telemetry) {
  const container = document.getElementById("live-job-container");
  if (!container) {
    return;
  }
  if (!telemetry || telemetry.status !== "PRINTING") {
    container.style.display = "none";
    return;
  }

  container.style.display = "";
  const pct = Number(telemetry.progressPercent) || 0;
  const layer = telemetry.currentLayer && telemetry.totalLayers ? `Layer ${telemetry.currentLayer} / ${telemetry.totalLayers}` : "";
  const timeRem = telemetry.timeRemaining ? `Remaining: ${telemetry.timeRemaining}` : "";
  const temps = telemetry.temps || {};

  container.innerHTML = `
    <div class="live-job-card">
      <div class="job-header">
        <span class="job-title"><i class="bi bi-play-circle-fill" style="color: var(--green);"></i> ${escapeHtml(jobTitle({ title: telemetry.title || telemetry.fileName }))}</span>
        <span class="job-percent">${pct}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${pct}%;"></div>
      </div>
      <div class="job-stats-row">
        <span><i class="bi bi-layers"></i> ${escapeHtml(layer)}</span>
        <span><i class="bi bi-clock-history"></i> ${escapeHtml(timeRem)}</span>
        <span><i class="bi bi-thermometer-half"></i> Nozzle: ${escapeHtml(temps.nozzle || "—")}</span>
        <span><i class="bi bi-grid-3x3"></i> Bed: ${escapeHtml(temps.bed || "—")}</span>
      </div>
    </div>
  `;
}

function renderSpecs(telemetry) {
  const specsContainer = document.getElementById("printing-specs");
  if (!specsContainer) {
    return;
  }

  const temps = (telemetry && telemetry.temps) || {};
  const status = telemetry ? telemetry.status : "OFFLINE";
  const isPrinting = status === "PRINTING";
  const statusLabel = { PRINTING: "PRINTING LIVE", PAUSED: "PAUSED", IDLE: "IDLE" }[status] || "OFFLINE";
  const current = telemetry && isPrinting ? jobTitle({ title: telemetry.title || telemetry.fileName }) : "—";
  const withTarget = (val, target) => (val ? `${val}${target ? ` (target ${target})` : ""}` : "—");

  const specsList = [
    { label: "status", value: statusLabel },
    { label: "current job", value: current },
    { label: "nozzle temp", value: withTarget(temps.nozzle, temps.nozzleTarget) },
    { label: "bed temp", value: withTarget(temps.bed, temps.bedTarget) }
  ];

  specsContainer.innerHTML = specsList.map(spec => `
    <div class="spec-card">
      <span class="spec-label">${spec.label}</span>
      <span class="spec-val" style="${spec.label === "status" && isPrinting ? "color: var(--green);" : ""}">${escapeHtml(spec.value)}</span>
    </div>
  `).join("");
}

function renderAmsSlots(telemetry) {
  const amsContainer = document.getElementById("ams-slots");
  if (!amsContainer) {
    return;
  }

  const amsData = (telemetry && telemetry.ams && telemetry.ams.length) ? telemetry.ams : PRINTING_CONFIG.bambuStats.amsSlots;

  amsContainer.innerHTML = amsData.map(slot => {
    const isActive = slot.active === true;
    const color = /^#[0-9a-f]{3,8}$/i.test(slot.color || "") ? slot.color : "#888888";
    return `
      <div class="ams-slot ${isActive ? "active-slot" : ""}">
        <span class="ams-color-dot" style="background: ${color}; border: 1px solid var(--border-bright);"></span>
        <span class="ams-slot-num">Slot ${escapeHtml(slot.slot)}:</span>
        <span class="ams-mat-name">${escapeHtml(slot.material)}${isActive ? " (ACTIVE)" : ""}</span>
      </div>
    `;
  }).join("");
}

function historyActionLabel(item) {
  if (item.modelUrl) {
    return "<i class=\"bi bi-box-seam\"></i> View 3D model";
  }
  if (item.thumbnailUrl) {
    return "<i class=\"bi bi-image\"></i> View preview";
  }
  return null;
}

function renderPrintHistory(telemetry) {
  const historyContainer = document.getElementById("print-history-table");
  if (!historyContainer) {
    return;
  }

  const history = (telemetry && Array.isArray(telemetry.printHistory)) ? telemetry.printHistory : [];
  const signature = JSON.stringify(history);
  if (signature === historySignature) {
    return; // unchanged since the last poll; keep the selected row highlighted
  }
  historySignature = signature;

  if (history.length === 0) {
    historyContainer.innerHTML = "<tr><td colspan=\"6\" class=\"h-empty\">No prints recorded yet.</td></tr>";
    return;
  }

  historyContainer.innerHTML = history.map((item, index) => {
    const action = historyActionLabel(item);
    const failed = item.status && item.status !== "COMPLETED";
    const rawName = item.fileName || item.name || "";
    const title = jobTitle(item);
    const tooltip = rawName && prettyJobName(rawName) !== rawName ? ` title="${escapeHtml(rawName)}"` : "";
    const isActive = selection && selection.source === "history" && selection.index === index;
    return `
      <tr class="history-row${action ? "" : " history-row-disabled"}${isActive ? " active-history-row" : ""}" data-index="${index}">
        <td class="h-name"${tooltip}>
          ${escapeHtml(title)}
          ${failed ? `<span class="h-badge h-badge-failed">${escapeHtml(item.status === "FAILED" ? "failed" : String(item.status).toLowerCase())}</span>` : ""}
        </td>
        <td class="h-mat">${escapeHtml(item.material && item.material !== "Unknown" ? item.material : "—")}</td>
        <td class="h-time">${escapeHtml(item.printTime || "—")}</td>
        <td class="h-weight">${escapeHtml(item.filamentWeight || "—")}</td>
        <td class="h-date">${escapeHtml(formatCompletedAt(item.completedAt))}</td>
        <td class="h-status">
          ${action
    ? `<button type="button" class="view-model-btn">${action}</button>`
    : "<span class=\"h-none\">No model saved</span>"}
        </td>
      </tr>
    `;
  }).join("");

  historyContainer.querySelectorAll(".history-row:not(.history-row-disabled)").forEach(row => {
    row.addEventListener("click", () => {
      const index = Number(row.getAttribute("data-index"));
      const entry = history[index];
      historyContainer.querySelectorAll(".history-row").forEach(r => r.classList.remove("active-history-row"));
      row.classList.add("active-history-row");
      selection = { source: "history", index };
      const viewportContainer = document.getElementById("printing-container");
      viewportContainer.scrollIntoView({ behavior: "smooth", block: "center" });
      showEntry(viewportContainer, entry);
    });
  });
}

function renderStatusBar(telemetry) {
  const upEl = document.getElementById("uptime-counter");
  const centerEl = document.getElementById("printer-status-banner");
  const stale = !telemetry || isTelemetryStale(telemetry.updatedAt);

  if (upEl) {
    const since = telemetry && Date.parse(telemetry.publisherStartedAt || "");
    if (stale) {
      upEl.textContent = "telemetry offline";
    } else if (since && !Number.isNaN(since)) {
      upEl.textContent = `telemetry up ${formatUptime(Date.now() - since)}`;
    } else {
      upEl.textContent = "telemetry online";
    }
  }
  if (centerEl) {
    const label = stale ? "OFFLINE" : ({ PRINTING: "PRINTING", PAUSED: "PAUSED", IDLE: "IDLE" }[telemetry.status] || "OFFLINE");
    centerEl.textContent = `● PRINTER ${label}`;
    centerEl.style.color = label === "OFFLINE" ? "var(--text-muted)" : (label === "PAUSED" ? "var(--yellow)" : "var(--green)");
  }
}

async function updateTelemetryUI() {
  const viewportContainer = document.getElementById("printing-container");
  const pollBadge = document.getElementById("live-poll-badge");

  const telemetry = await fetchPrinterTelemetry();
  latestTelemetry = telemetry;

  if (pollBadge) {
    const nowStr = new Date().toLocaleTimeString("en-US", { hour12: false });
    pollBadge.innerHTML = `<span style="color: var(--green);">● S3 LIVE POLL</span> · updated ${nowStr}`;
  }

  renderStatusBar(telemetry);
  renderLiveJobCard(telemetry);
  renderSpecs(telemetry);
  renderAmsSlots(telemetry);
  renderPrintHistory(telemetry);

  if (!selection) {
    showLiveView(viewportContainer, telemetry);
  }
}

// ─────────────────────────────────────────────
// Local file loading (drag & drop / file picker)
// ─────────────────────────────────────────────

function openLocalFile(container, file) {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".stl") && !name.endsWith(".3mf")) {
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    selection = { source: "file" };
    ++loadGeneration;
    document.querySelectorAll(".history-row").forEach(r => r.classList.remove("active-history-row"));
    renderArrayBuffer(container, event.target.result, { title: file.name, formatHint: modelFormatFromUrl(name) });
  };
  reader.readAsArrayBuffer(file);
}

function setupFileInputs(container) {
  if (!container) {
    return;
  }
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    container.style.outline = "2px dashed var(--cyan)";
  });
  container.addEventListener("dragleave", () => {
    container.style.outline = "none";
  });
  container.addEventListener("drop", (e) => {
    e.preventDefault();
    container.style.outline = "none";
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      openLocalFile(container, file);
    }
  });

  const fileInput = document.getElementById("stl-file-input");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        openLocalFile(container, file);
      }
      fileInput.value = "";
    });
  }
}

function updateClock() {
  const t = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "America/Denver", timeZoneName: "short"
  });
  const el = document.getElementById("live-clock");
  if (el) {
    el.textContent = t;
  }
}

function init() {
  const viewportContainer = document.getElementById("printing-container");
  setupFileInputs(viewportContainer);

  updateClock();
  setInterval(updateClock, 1000);
  const yr = document.getElementById("current-year");
  if (yr) {
    yr.textContent = new Date().getFullYear();
  }

  updateTelemetryUI();
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(updateTelemetryUI, POLL_INTERVAL_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
