// Contact modal — loaded as an external module so CSP 'self' applies
import {
  sanitizeInput,
  isValidName,
  isValidEmail,
  isValidPhone,
  isValidMessage
} from "./validation-helpers.js";

const API     = "https://674lumu19j.execute-api.us-west-2.amazonaws.com/prod/contact";
const modal   = document.getElementById("contactModal");
const form    = document.getElementById("contactModalForm");
const success = document.getElementById("contactModalSuccess");

if (!modal || !form || !success) {
  // Not on a page with the contact modal — exit silently
  // (guards against this script being accidentally loaded elsewhere)
} else {
  init();
}

function init() {
  // ── Open / close ──
  function openModal() {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    const nameField = document.getElementById("cm-name");
    if (nameField) {
      nameField.focus();
    }
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    form.hidden   = false;
    success.hidden = true;
    form.reset();
    clearErrors();
  }

  // ── Trigger buttons ──
  const openNav     = document.getElementById("openContactModal");
  const openSection = document.getElementById("openContactFromSection");
  const closeBtn    = document.getElementById("closeContactModal");
  const successClose = document.getElementById("contactSuccessClose");

  if (openNav)      {
    openNav.addEventListener("click", openModal);
  }
  if (openSection)  {
    openSection.addEventListener("click", openModal);
  }
  if (closeBtn)     {
    closeBtn.addEventListener("click", closeModal);
  }
  if (successClose) {
    successClose.addEventListener("click", closeModal);
  }

  // Wire any remaining a[href="#contact"] anchor links
  document.querySelectorAll("a[href=\"#contact\"]").forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault(); openModal(); 
    });
  });

  // Close on overlay backdrop click
  modal.addEventListener("click", e => {
    if (e.target === modal) {
      closeModal();
    } 
  });

  // Close on Escape — only when modal is open
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !modal.hidden) {
      closeModal();
    }
  });

  // ── Validation helpers ──
  function clearErrors() {
    ["name", "email", "phone", "message"].forEach(f => {
      const el  = document.getElementById(`cm-${f}`);
      const err = document.getElementById(`cm-${f}-error`);
      if (el)  {
        el.classList.remove("contact-input-error");
      }
      if (err) {
        err.textContent = "";
      }
    });
    const submitErr = document.getElementById("cm-submit-error");
    if (submitErr) {
      submitErr.hidden = true;
    }
  }

  function setError(field, msg) {
    const el  = document.getElementById(`cm-${field}`);
    const err = document.getElementById(`cm-${field}-error`);
    if (el)  {
      el.classList.add("contact-input-error");
    }
    if (err) {
      err.textContent = msg;
    }
  }

  // ── Form submission ──
  form.addEventListener("submit", async e => {
    e.preventDefault();
    clearErrors();

    const name    = sanitizeInput(document.getElementById("cm-name").value);
    const email   = sanitizeInput(document.getElementById("cm-email").value);
    const phone   = sanitizeInput(document.getElementById("cm-phone").value);
    const message = sanitizeInput(document.getElementById("cm-message").value);
    const honey   = document.getElementById("cm-website").value;

    // Honeypot — silently drop bot submissions
    if (honey) {
      return;
    }

    // Validate
    let valid = true;
    if (!name)                      {
      setError("name",    "Name is required");                  valid = false; 
    } else if (!isValidName(name))    {
      setError("name",    "Must be at least 2 characters");     valid = false; 
    }
    if (!email)                     {
      setError("email",   "Email is required");                  valid = false; 
    } else if (!isValidEmail(email))  {
      setError("email",   "Enter a valid email address");        valid = false; 
    }
    if (phone && !isValidPhone(phone)) {
      setError("phone", "Invalid phone format");              valid = false; 
    }
    if (!message)                   {
      setError("message", "Message is required");                valid = false; 
    } else if (!isValidMessage(message)) {
      setError("message", "Between 5–5000 characters");      valid = false; 
    }

    if (!valid) {
      return;
    }

    // Submit to Lambda
    const btn     = document.getElementById("cm-submit");
    const btnText = document.getElementById("cm-submit-text");
    const spinner = document.getElementById("cm-submit-spinner");

    btn.disabled        = true;
    btnText.textContent = "Sending…";
    if (spinner) {
      spinner.hidden = false;
    }

    try {
      const res  = await fetch(API, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, email, phone: phone || "", message })
      });
      const data = await res.json();

      if (res.ok) {
        form.hidden    = true;
        success.hidden = false;
      } else {
        const sub = document.getElementById("cm-submit-error");
        if (sub) {
          sub.textContent = data.message || "Failed to send. Try again."; sub.hidden = false; 
        }
      }
    } catch {
      const sub = document.getElementById("cm-submit-error");
      if (sub) {
        sub.textContent = "Network error — please try again."; sub.hidden = false; 
      }
    } finally {
      btn.disabled        = false;
      btnText.textContent = "Send message";
      if (spinner) {
        spinner.hidden = true;
      }
    }
  });
}
