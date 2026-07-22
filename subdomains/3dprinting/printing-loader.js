import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as fflate from "fflate";
import PRINTING_CONFIG from "./printing-config.js";

let pollTimer = null;
let currentScene = null;
let currentRenderer = null;
let currentControls = null;
let animFrameId = null;

async function fetchPrinterTelemetry() {
  try {
    const res = await fetch(PRINTING_CONFIG.telemetryUrl || "./printer-status.json", {
      cache: "no-store"
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function cleanupThreeScene() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (currentControls) {
    currentControls.dispose();
    currentControls = null;
  }
  if (currentRenderer) {
    currentRenderer.dispose();
    currentRenderer = null;
  }
  currentScene = null;
}

function parse3MFToGroup(arrayBuffer) {
  const unzipped = fflate.unzipSync(new Uint8Array(arrayBuffer));
  const group = new THREE.Group();
  const parser = new DOMParser();

  for (const filename in unzipped) {
    if (filename.toLowerCase().endsWith(".model")) {
      const modelXmlText = new TextDecoder().decode(unzipped[filename]);
      const xmlDoc = parser.parseFromString(modelXmlText, "text/xml");
      const meshNodes = xmlDoc.getElementsByTagName("mesh");

      for (let m = 0; m < meshNodes.length; m++) {
        const meshNode = meshNodes[m];
        const vertices = [];
        const indices = [];

        const vertexNodes = meshNode.getElementsByTagName("vertex");
        for (let i = 0; i < vertexNodes.length; i++) {
          const v = vertexNodes[i];
          vertices.push(
            parseFloat(v.getAttribute("x") || 0),
            parseFloat(v.getAttribute("y") || 0),
            parseFloat(v.getAttribute("z") || 0)
          );
        }

        const triangleNodes = meshNode.getElementsByTagName("triangle");
        for (let i = 0; i < triangleNodes.length; i++) {
          const t = triangleNodes[i];
          indices.push(
            parseInt(t.getAttribute("v1"), 10),
            parseInt(t.getAttribute("v2"), 10),
            parseInt(t.getAttribute("v3"), 10)
          );
        }

        if (vertices.length > 0) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
          if (indices.length > 0) {
            geometry.setIndex(indices);
          }
          geometry.computeVertexNormals();

          const mat = new THREE.MeshStandardMaterial({
            color: 0x58a6ff,
            roughness: 0.35,
            metalness: 0.3,
            wireframe: false
          });

          const mesh = new THREE.Mesh(geometry, mat);
          group.add(mesh);
        }
      }
    }
  }

  if (group.children.length === 0) {
    throw new Error("No valid meshes found in 3MF XML model files");
  }

  return group;
}

async function render3DArrayBuffer(container, arrayBuffer, fileName = "Model File") {
  cleanupThreeScene();
  if (!container) return;

  const is3MF = fileName.toLowerCase().endsWith(".3mf");

  container.innerHTML = `
    <div id="threejs-viewport" style="width:100%; height:100%; position:relative;"></div>
    <div style="position:absolute; bottom:12px; left:16px; font-family:var(--mono); font-size:0.68rem; color:var(--text); background:rgba(13,17,23,0.85); padding:6px 10px; border-radius:4px; border:1px solid var(--cyan); display:flex; align-items:center; gap:0.6rem; z-index:10;">
      <i class="bi bi-box-seam" style="color:var(--cyan);"></i>
      <span>Model: <strong>${fileName}</strong> (${is3MF ? "3MF Package" : "STL Mesh"})</span>
      <button id="toggle-wireframe-btn" style="background:var(--bg-elevated); color:var(--text); border:1px solid var(--border); padding:2px 6px; border-radius:3px; cursor:pointer; font-size:0.65rem;">Toggle Wireframe</button>
      <label for="stl-file-input" style="background:var(--cyan); color:#000; border:none; padding:2px 8px; border-radius:3px; cursor:pointer; font-weight:600; font-size:0.65rem;">Load STL / 3MF File...</label>
    </div>
  `;

  const viewport = document.getElementById("threejs-viewport");
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x161b22);
  currentScene = scene;

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 0, 100);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewport.appendChild(renderer.domElement);
  currentRenderer = renderer;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  currentControls = controls;

  // Auto-rotation pause & inactivity resumption logic
  let autoRotate = true;
  let inactivityTimer = null;
  const INACTIVITY_DELAY_MS = 5000; // Resumes auto-rotation after 5 seconds of idle

  controls.addEventListener("start", () => {
    autoRotate = false;
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  });

  controls.addEventListener("end", () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      autoRotate = true;
    }, INACTIVITY_DELAY_MS);
  });

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0x58a6ff, 1.2);
  dirLight1.position.set(100, 100, 100);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xbc8cff, 0.8);
  dirLight2.position.set(-100, -100, -50);
  scene.add(dirLight2);

  let modelGroup = new THREE.Group();
  let materialsList = [];

  if (is3MF) {
    try {
      modelGroup = parse3MFToGroup(arrayBuffer);
      modelGroup.traverse((child) => {
        if (child.isMesh && child.material) {
          materialsList.push(child.material);
        }
      });
    } catch (parseErr) {
      console.warn("Direct 3MF XML parse failed, attempting ThreeMFLoader fallback:", parseErr);
      try {
        const { ThreeMFLoader } = await import("three/addons/loaders/3MFLoader.js");
        const loader = new ThreeMFLoader();
        modelGroup = loader.parse(arrayBuffer);
        modelGroup.traverse((child) => {
          if (child.isMesh && child.material) {
            materialsList.push(child.material);
          }
        });
      } catch (err) {
        console.warn("All 3MF loaders failed:", err);
      }
    }
  } else {
    // STL Loader
    const loader = new STLLoader();
    const geometry = loader.parse(arrayBuffer);
    geometry.computeVertexNormals();
    geometry.center();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x58a6ff,
      roughness: 0.3,
      metalness: 0.4,
      wireframe: false
    });
    materialsList.push(mat);

    const mesh = new THREE.Mesh(geometry, mat);
    modelGroup.add(mesh);
  }

  scene.add(modelGroup);

  // Center & Auto-fit camera position to model bounds
  const box = new THREE.Box3().setFromObject(modelGroup);
  const center = box.getCenter(new THREE.Vector3());
  modelGroup.position.sub(center);

  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 40;
  camera.position.set(0, maxDim * 1.2, maxDim * 2.0);
  camera.lookAt(0, 0, 0);

  // Wireframe toggle
  const toggleBtn = document.getElementById("toggle-wireframe-btn");
  if (toggleBtn) {
    let isWire = false;
    toggleBtn.addEventListener("click", () => {
      isWire = !isWire;
      materialsList.forEach((m) => {
        if (m) m.wireframe = isWire;
      });
      toggleBtn.textContent = isWire ? "Solid View" : "Toggle Wireframe";
    });
  }

  // Animation Loop
  function animate() {
    animFrameId = requestAnimationFrame(animate);
    if (autoRotate && modelGroup) {
      modelGroup.rotation.y += 0.003;
    }
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // Window Resize
  const onResize = () => {
    if (!container || container.clientWidth === 0) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", onResize);
}

async function loadSampleModel(container, modelUrl = "./output.stl", fileName = "output.stl") {
  try {
    const res = await fetch(modelUrl);
    if (!res.ok) throw new Error("Failed to fetch model");
    const buffer = await res.arrayBuffer();
    await render3DArrayBuffer(container, buffer, fileName);
  } catch (err) {
    console.warn("Could not load sample model:", err);
  }
}

function setupDragAndDrop(container) {
  if (!container) return;

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

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const ext = file.name.toLowerCase();
      if (ext.endsWith(".stl") || ext.endsWith(".3mf")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          render3DArrayBuffer(container, event.target.result, file.name);
        };
        reader.readAsArrayBuffer(file);
      }
    }
  });
}

function renderLiveJobCard(telemetry) {
  const container = document.getElementById("live-job-container");
  if (!container) return;

  if (!telemetry || telemetry.status !== "PRINTING") {
    container.style.display = "none";
    return;
  }

  container.style.display = "";
  const pct = telemetry.progressPercent || 0;
  const fileName = telemetry.fileName || "Active Print Job";
  const layer = telemetry.currentLayer && telemetry.totalLayers ? `Layer ${telemetry.currentLayer} / ${telemetry.totalLayers}` : "";
  const timeRem = telemetry.timeRemaining ? `Remaining: ${telemetry.timeRemaining}` : "";
  const temps = telemetry.temps || {};

  container.innerHTML = `
    <div class="live-job-card">
      <div class="job-header">
        <span class="job-title"><i class="bi bi-play-circle-fill" style="color: var(--green);"></i> ${fileName}</span>
        <span class="job-percent">${pct}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${pct}%;"></div>
      </div>
      <div class="job-stats-row">
        <span><i class="bi bi-layers"></i> ${layer}</span>
        <span><i class="bi bi-clock-history"></i> ${timeRem}</span>
        <span><i class="bi bi-thermometer-half"></i> Nozzle: ${temps.nozzle || "215°C"}</span>
        <span><i class="bi bi-grid-3x3"></i> Bed: ${temps.bed || "60°C"}</span>
      </div>
    </div>
  `;
}

function renderSpecs(telemetry) {
  const specsContainer = document.getElementById("printing-specs");
  if (!specsContainer) return;

  const temps = telemetry && telemetry.temps ? telemetry.temps : {};
  const activeStatus = telemetry && telemetry.status ? telemetry.status : PRINTING_CONFIG.status;
  const cadModelName = telemetry && telemetry.modelName ? telemetry.modelName : "output.stl";

  const specsList = [
    { label: "status", value: activeStatus === "PRINTING" ? "PRINTING LIVE" : "STANDBY" },
    { label: "active model", value: cadModelName },
    { label: "nozzle temp", value: temps.nozzle ? `${temps.nozzle} (target ${temps.nozzleTarget || "215°C"})` : "215°C" },
    { label: "bed temp", value: temps.bed ? `${temps.bed} (target ${temps.bedTarget || "60°C"})` : "60°C" }
  ];

  specsContainer.innerHTML = specsList.map(spec => `
    <div class="spec-card">
      <span class="spec-label">${spec.label}</span>
      <span class="spec-val" style="${spec.label === 'status' && activeStatus === 'PRINTING' ? 'color: var(--green);' : ''}">${spec.value}</span>
    </div>
  `).join("");
}

function renderAmsSlots(telemetry) {
  const amsContainer = document.getElementById("ams-slots");
  if (!amsContainer) return;

  const amsData = (telemetry && telemetry.ams) || PRINTING_CONFIG.bambuStats.amsSlots;

  amsContainer.innerHTML = amsData.map(slot => {
    const isActive = slot.active === true;
    return `
      <div class="ams-slot ${isActive ? 'active-slot' : ''}">
        <span class="ams-color-dot" style="background: ${slot.color}; border: 1px solid var(--border-bright);"></span>
        <span class="ams-slot-num">Slot ${slot.slot}:</span>
        <span class="ams-mat-name">${slot.material}${isActive ? ' (ACTIVE)' : ''}</span>
      </div>
    `;
  }).join("");
}

function renderPrintHistory(telemetry) {
  const historyContainer = document.getElementById("print-history-table");
  if (!historyContainer) return;

  const history = (telemetry && telemetry.printHistory) || [
    { id: "job-112", name: "ESP32_Environmental_Sensor_Housing.gcode", modelName: "output.stl", modelUrl: "./output.stl", material: "PETG Charcoal", printTime: "1h 26m", filamentWeight: "38.4g", completedAt: "2026-07-21 18:40", status: "COMPLETED" },
    { id: "job-111", name: "RPi4_DIN_Rail_Mount_Bracket.gcode", modelName: "sample-box.stl", modelUrl: "./sample-box.stl", material: "PLA+ White", printTime: "48m", filamentWeight: "19.2g", completedAt: "2026-07-20 14:15", status: "COMPLETED" },
    { id: "job-110", name: "MagicMirror_Corner_Bezel_TL.gcode", modelName: "output.stl", modelUrl: "./output.stl", material: "ABS Black", printTime: "2h 12m", filamentWeight: "51.8g", completedAt: "2026-07-19 09:30", status: "COMPLETED" }
  ];

  historyContainer.innerHTML = history.map(item => `
    <tr class="history-row" data-model-url="${item.modelUrl || './output.stl'}" data-model-name="${item.modelName || item.name}">
      <td class="h-name"><i class="bi bi-file-earmark-code" style="color: var(--cyan);"></i> ${item.name}</td>
      <td class="h-mat">${item.material}</td>
      <td class="h-time">${item.printTime}</td>
      <td class="h-weight">${item.filamentWeight || "N/A"}</td>
      <td class="h-date">${item.completedAt}</td>
      <td class="h-status">
        <button class="view-model-btn" style="background: var(--bg-elevated); color: var(--cyan); border: 1px solid var(--border); padding: 3px 8px; border-radius: 4px; font-family: var(--mono); font-size: 0.68rem; cursor: pointer;">
          <i class="bi bi-box-seam"></i> View 3D Model
        </button>
      </td>
    </tr>
  `).join("");

  const rows = historyContainer.querySelectorAll(".history-row");
  rows.forEach(row => {
    row.addEventListener("click", async () => {
      rows.forEach(r => r.classList.remove("active-history-row"));
      row.classList.add("active-history-row");

      const modelUrl = row.getAttribute("data-model-url");
      const modelName = row.getAttribute("data-model-name");
      const viewportContainer = document.getElementById("printing-container");

      if (viewportContainer && modelUrl) {
        viewportContainer.scrollIntoView({ behavior: "smooth", block: "center" });
        await loadSampleModel(viewportContainer, modelUrl, modelName);
      }
    });
  });
}

function renderProjects() {
  const projectsContainer = document.getElementById("printing-projects");
  if (!projectsContainer) return;

  projectsContainer.innerHTML = PRINTING_CONFIG.projects.map(p => `
    <div class="project-card-sub">
      <div class="card-meta">
        <span class="card-badge">${p.category}</span>
        <span class="card-material">Material: ${p.material}</span>
      </div>
      <h3 class="card-title">${p.title}</h3>
      <p class="card-desc">${p.desc}</p>
      <div class="card-code">${p.codeSnippet}</div>
    </div>
  `).join("");
}

function setupFileInputHandler(container) {
  const fileInput = document.getElementById("stl-file-input");
  if (!fileInput) return;

  fileInput.addEventListener("change", (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        render3DArrayBuffer(container, evt.target.result, file.name);
      };
      reader.readAsArrayBuffer(file);
    }
  });
}

async function updateTelemetryUI() {
  const viewportContainer = document.getElementById("printing-container");
  const pollBadge = document.getElementById("live-poll-badge");

  const telemetry = await fetchPrinterTelemetry();

  if (pollBadge) {
    const nowStr = new Date().toLocaleTimeString("en-US", { hour12: false });
    pollBadge.innerHTML = `<span style="color: var(--green);">● S3 LIVE POLL</span> · updated ${nowStr}`;
  }

  renderLiveJobCard(telemetry);
  renderSpecs(telemetry);
  renderAmsSlots(telemetry);
  renderPrintHistory(telemetry);

  if (telemetry && telemetry.status === "PRINTING" && telemetry.snapshotUrl) {
    viewportContainer.innerHTML = `<img src="${telemetry.snapshotUrl}" alt="Live Printer Camera Snapshot" style="width:100%; height:100%; object-fit:contain; background:#000;" />`;
  } else if (telemetry && telemetry.status === "PRINTING" && telemetry.streamUrl) {
    viewportContainer.innerHTML = `<iframe src="${telemetry.streamUrl}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="width:100%; height:100%;"></iframe>`;
  } else if (!currentScene) {
    const modelUrl = (telemetry && telemetry.modelUrl) ? telemetry.modelUrl : "./output.stl";
    const modelName = (telemetry && telemetry.modelName) ? telemetry.modelName : "output.stl";
    await loadSampleModel(viewportContainer, modelUrl, modelName);
  }
}

function init() {
  const viewportContainer = document.getElementById("printing-container");
  setupDragAndDrop(viewportContainer);
  setupFileInputHandler(viewportContainer);

  renderProjects();
  updateTelemetryUI();

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(updateTelemetryUI, 5000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
