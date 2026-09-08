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

function setStatus(message, kind) {
  const el = document.getElementById("form-status");
  el.textContent = message;
  el.className = kind;
}

function setupFileDrop() {
  const drop = document.getElementById("file-drop");
  const input = document.getElementById("file-input");
  const label = document.getElementById("file-drop-label");
  const nameDisplay = document.getElementById("file-name-display");

  function showFile(file) {
    if (!file) {
      return;
    }
    label.textContent = "Selected:";
    nameDisplay.textContent = file.name;
  }

  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", () => showFile(input.files[0]));

  ["dragover", "dragenter"].forEach((evt) => {
    drop.addEventListener(evt, (e) => {
      e.preventDefault();
      drop.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    drop.addEventListener(evt, (e) => {
      e.preventDefault();
      drop.classList.remove("drag-over");
    });
  });
  drop.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) {
      input.files = e.dataTransfer.files;
      showFile(file);
    }
  });
}

async function handleSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById("submit-btn");
  const fileInput = document.getElementById("file-input");
  const file = fileInput.files[0];

  if (!file) {
    setStatus("Choose a file first.", "error");
    return;
  }

  submitBtn.disabled = true;
  setStatus("Submitting request...", "");
  document.getElementById("form-status").className = "";

  try {
    const createRes = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        material: document.getElementById("material").value,
        color: document.getElementById("color").value,
        quantity: document.getElementById("quantity").value,
        priority: document.getElementById("priority").value,
        notes: document.getElementById("notes").value,
        filename: file.name,
        contentType: file.type || "application/octet-stream"
      })
    });

    if (!createRes.ok) {
      const body = await createRes.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${createRes.status})`);
    }

    const { uploadUrl } = await createRes.json();

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file
    });

    if (!uploadRes.ok) {
      throw new Error("Request was created, but the file upload failed. Try again.");
    }

    setStatus("Request submitted! I'll take a look and get it queued up.", "success");
    document.getElementById("request-form").reset();
    document.getElementById("file-name-display").textContent = "";
    document.getElementById("file-drop-label").textContent = "Click to choose a file, or drag one here";
  } catch (err) {
    setStatus(err.message || "Something went wrong. Try again.", "error");
  } finally {
    submitBtn.disabled = false;
  }
}

function init() {
  updateClock();
  setInterval(updateClock, 1000);

  const yr = document.getElementById("current-year");
  if (yr) {
    yr.textContent = new Date().getFullYear();
  }

  setupFileDrop();
  document.getElementById("request-form").addEventListener("submit", handleSubmit);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
