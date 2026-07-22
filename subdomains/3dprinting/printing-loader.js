import PRINTING_CONFIG from "./printing-config.js";

const MAIN_SITE = "https://chrispivonka.com";

function renderOfflineState() {
  const container = document.getElementById("printing-container");
  if (!container) return;

  container.innerHTML = `
    <div class="offline-placeholder">
      <i class="bi bi-box-seam" style="font-size: 3rem; color: var(--purple);"></i>
      <h3 style="margin-top: 1rem; font-family: var(--mono); font-size: 1.1rem; color: var(--text);">
        ${PRINTING_CONFIG.title}
      </h3>
      <p style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-muted); max-width: 480px;">
        ${PRINTING_CONFIG.offlineMessage}
      </p>
    </div>
  `;
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

function init() {
  renderOfflineState();
  renderSpecs();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
