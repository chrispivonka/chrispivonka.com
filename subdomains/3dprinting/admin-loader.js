function updateClock() {
  const now = new Date();
  const t = now.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "America/Denver"
  });
  const el = document.getElementById("live-clock");
  if (el) {
    el.textContent = `${t} MST`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = (str === null || str === undefined) ? "" : String(str);
  return div.innerHTML;
}

function showBanner(message) {
  const banner = document.getElementById("message-banner");
  banner.textContent = message;
  banner.style.display = "block";
}

function formatDate(iso) {
  if (!iso) {
    return "—";
  }
  try {
    return new Date(iso).toLocaleString("en-US", { timeZone: "America/Denver" });
  } catch {
    return iso;
  }
}

function renderRequest(req) {
  const priorityClass = `priority-${req.priority || "normal"}`;
  return `
    <div class="request-card status-${req.status}" data-id="${escapeHtml(req.id)}">
      <div class="request-top">
        <span class="request-title">
          <i class="bi bi-file-earmark-code"></i> ${escapeHtml(req.fileName)}
          <span class="priority-badge ${priorityClass}">${escapeHtml(req.priority || "normal")}</span>
        </span>
        <span class="priority-badge" style="background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border);">
          ${escapeHtml(req.status)}
        </span>
      </div>
      <div class="request-meta">
        <div>Requested by <span>${escapeHtml(req.requesterEmail)}</span></div>
        <div>Material <span>${escapeHtml(req.material)}${req.color ? ` · ${escapeHtml(req.color)}` : ""}</span></div>
        <div>Quantity <span>${escapeHtml(req.quantity)}</span></div>
        <div>Submitted <span>${formatDate(req.submittedAt)}</span></div>
      </div>
      ${req.notes ? `<div class="request-notes">${escapeHtml(req.notes)}</div>` : ""}
      <div class="request-actions">
        <a href="/api/requests/${encodeURIComponent(req.id)}/download">
          <i class="bi bi-download"></i> Download model
        </a>
        <button class="btn-complete" data-status="completed">Mark Complete</button>
        <button class="btn-danger" data-status="rejected">Reject</button>
        <button data-status="pending">Reset to Pending</button>
      </div>
    </div>
  `;
}

async function loadRequests() {
  const loading = document.getElementById("loading-state");
  const empty = document.getElementById("empty-state");
  const list = document.getElementById("request-list");

  try {
    const res = await fetch("/api/requests");
    if (res.status === 403) {
      loading.style.display = "none";
      showBanner("You're logged in, but this page is only visible to the site admin.");
      return;
    }
    if (!res.ok) {
      throw new Error(`Failed to load requests (${res.status})`);
    }
    const { requests } = await res.json();
    loading.style.display = "none";

    if (!requests.length) {
      empty.style.display = "block";
      return;
    }
    list.innerHTML = requests.map(renderRequest).join("");
    list.querySelectorAll("button[data-status]").forEach((btn) => {
      btn.addEventListener("click", () => updateStatus(btn));
    });
  } catch (err) {
    loading.style.display = "none";
    showBanner(err.message || "Something went wrong loading the queue.");
  }
}

async function updateStatus(btn) {
  const card = btn.closest(".request-card");
  const id = card.dataset.id;
  const status = btn.dataset.status;
  btn.disabled = true;
  try {
    const res = await fetch(`/api/requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      throw new Error(`Update failed (${res.status})`);
    }
    await loadRequests();
  } catch (err) {
    showBanner(err.message || "Could not update that request.");
    btn.disabled = false;
  }
}

function init() {
  updateClock();
  setInterval(updateClock, 1000);

  const yr = document.getElementById("current-year");
  if (yr) {
    yr.textContent = new Date().getFullYear();
  }

  loadRequests();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
