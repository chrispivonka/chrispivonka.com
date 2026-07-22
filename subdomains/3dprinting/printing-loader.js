import PRINTING_CONFIG from "./printing-config.js";

let pollTimer = null;
let canvasAnimationId = null;

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

function init3DCanvas(container, statusText = "STANDBY") {
  if (!container) return;

  if (canvasAnimationId) {
    cancelAnimationFrame(canvasAnimationId);
    canvasAnimationId = null;
  }

  container.innerHTML = `
    <canvas id="canvas3d" style="width:100%; height:100%; display:block; cursor:grab;"></canvas>
    <div style="position:absolute; bottom:12px; left:16px; font-family:var(--mono); font-size:0.68rem; color:var(--text-muted); pointer-events:none; background:rgba(13,17,23,0.85); padding:4px 8px; border-radius:4px; border:1px solid var(--border);">
      <i class="bi bi-arrows-move"></i> 3D CAD Mesh Preview (Drag to Rotate)
    </div>
    <div style="position:absolute; top:12px; right:16px; font-family:var(--mono); font-size:0.68rem; color:${statusText === "PRINTING" ? "var(--green)" : "var(--purple)"}; background:rgba(188,140,255,0.1); border:1px solid rgba(188,140,255,0.25); padding:4px 8px; border-radius:4px;">
      ● BAMBU LAB: ${statusText}
    </div>
  `;

  const canvas = document.getElementById("canvas3d");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = (canvas.width = container.clientWidth);
  let height = (canvas.height = container.clientHeight);

  const vertices = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1],  [1, -1, 1],  [1, 1, 1],  [-1, 1, 1]
  ];

  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  let rotX = 0.5, rotY = 0.5;
  let isDragging = false;
  let lastMouseX = 0, lastMouseY = 0;

  canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvas.style.cursor = "grabbing";
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    canvas.style.cursor = "grab";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    rotY += dx * 0.01;
    rotX += dy * 0.01;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  function project(vertex) {
    let [x, y, z] = vertex;
    let cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    let x1 = x * cosY - z * sinY;
    let z1 = z * cosY + x * sinY;
    let cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    let y2 = y * cosX - z1 * sinX;
    let z2 = z1 * cosX + y * sinX;
    const scale = 140 / (z2 + 4);
    return [width / 2 + x1 * scale, height / 2 + y2 * scale];
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    if (!isDragging) {
      rotY += 0.005;
      rotX += 0.002;
    }

    const projected = vertices.map(project);

    ctx.strokeStyle = statusText === "PRINTING" ? "#3fb950" : "#bc8cff";
    ctx.lineWidth = 1.8;

    edges.forEach(([i, j]) => {
      ctx.beginPath();
      ctx.moveTo(projected[i][0], projected[i][1]);
      ctx.lineTo(projected[j][0], projected[j][1]);
      ctx.stroke();
    });

    projected.forEach(([x, y]) => {
      ctx.fillStyle = "#58a6ff";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    canvasAnimationId = requestAnimationFrame(render);
  }

  render();
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

  const specsList = [
    { label: "status", value: activeStatus === "PRINTING" ? "PRINTING LIVE" : "STANDBY" },
    { label: "nozzle temp", value: temps.nozzle ? `${temps.nozzle} (target ${temps.nozzleTarget || "215°C"})` : "215°C" },
    { label: "bed temp", value: temps.bed ? `${temps.bed} (target ${temps.bedTarget || "60°C"})` : "60°C" },
    { label: "cad software", value: "Fusion 360 / OpenSCAD" }
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

  if (telemetry && telemetry.status === "PRINTING" && telemetry.snapshotUrl) {
    viewportContainer.innerHTML = `<img src="${telemetry.snapshotUrl}" alt="Live Printer Camera Snapshot" style="width:100%; height:100%; object-fit:contain; background:#000;" />`;
  } else if (telemetry && telemetry.status === "PRINTING" && telemetry.streamUrl) {
    viewportContainer.innerHTML = `<iframe src="${telemetry.streamUrl}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="width:100%; height:100%;"></iframe>`;
  } else {
    init3DCanvas(viewportContainer, telemetry && telemetry.status ? telemetry.status : "STANDBY");
  }
}

function init() {
  renderProjects();
  updateTelemetryUI();

  // Poll live telemetry every 5 seconds
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(updateTelemetryUI, 5000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
