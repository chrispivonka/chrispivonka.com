import PRINTING_CONFIG from "./printing-config.js";

function init3DCanvas(container) {
  if (!container) return;

  container.innerHTML = `
    <canvas id="canvas3d" style="width:100%; height:100%; display:block; cursor:grab;"></canvas>
    <div style="position:absolute; bottom:12px; left:16px; font-family:var(--mono); font-size:0.68rem; color:var(--text-muted); pointer-events:none; background:rgba(13,17,23,0.8); padding:4px 8px; border-radius:4px; border:1px solid var(--border);">
      <i class="bi bi-arrows-move"></i> Interactive 3D Mesh Preview (Drag to Rotate)
    </div>
    <div style="position:absolute; top:12px; right:16px; font-family:var(--mono); font-size:0.68rem; color:var(--green); background:rgba(63,185,80,0.1); border:1px solid rgba(63,185,80,0.25); padding:4px 8px; border-radius:4px;">
      ● TELEMETRY: ${PRINTING_CONFIG.status}
    </div>
  `;

  const canvas = document.getElementById("canvas3d");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = (canvas.width = container.clientWidth);
  let height = (canvas.height = container.clientHeight);

  window.addEventListener("resize", () => {
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      width = canvas.width = container.clientWidth;
      height = canvas.height = container.clientHeight;
    }
  });

  // 3D Cube / Enclosure Vertices
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

    // Rotate Y
    let cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    let x1 = x * cosY - z * sinY;
    let z1 = z * cosY + x * sinY;

    // Rotate X
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

    ctx.strokeStyle = "#58a6ff";
    ctx.lineWidth = 1.8;

    edges.forEach(([i, j]) => {
      ctx.beginPath();
      ctx.moveTo(projected[i][0], projected[i][1]);
      ctx.lineTo(projected[j][0], projected[j][1]);
      ctx.stroke();
    });

    projected.forEach(([x, y]) => {
      ctx.fillStyle = "#bc8cff";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(render);
  }

  render();
}

function renderSpecs() {
  const specsContainer = document.getElementById("printing-specs");
  if (!specsContainer) return;

  specsContainer.innerHTML = PRINTING_CONFIG.specs.map(spec => `
    <div class="spec-card">
      <span class="spec-label">${spec.label}</span>
      <span class="spec-val">${spec.value}</span>
    </div>
  `).join("");
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

function init() {
  const container = document.getElementById("printing-container");
  init3DCanvas(container);
  renderSpecs();
  renderProjects();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
