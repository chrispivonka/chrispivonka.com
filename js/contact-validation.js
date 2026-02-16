// Contact form validation
const API_ENDPOINT =
  "https://674lumu19j.execute-api.us-west-2.amazonaws.com/prod/contact";

// CSRF Token - generated server-side, embedded in page
let CSRF_TOKEN = "";

// Initialize CSRF token from meta tag or generate one
function initCsrfToken() {
  const metaToken = document.querySelector("meta[name=\"csrf-token\"]");
  if (metaToken) {
    CSRF_TOKEN = metaToken.getAttribute("content");
  }
}

const wittyErrorMessages = [
  "Looks like you forgot something! Mind filling out the required fields?",
  "Houston, we have a problem. Some fields are missing!",
  "Not so fast! We need Name, Email, and Message to proceed.",
  "Error 404: Required fields not found!",
  "Come on, you can do better than that! Fill out the required fields.",
  "Oops! Looks like your form is incomplete. We need the essentials!",
  "Hold up! Name, Email, and Message are required. No pressure though!",
  "Nice try! But we're gonna need Name, Email, and Message to make this work."
];

// Sanitization function to remove HTML/script tags and malicious content
function sanitizeInput(input) {
  if (!input) {
    return "";
  }

  // Remove any HTML tags
  let sanitized = input.replace(/<[^>]*>/g, "");

  // Remove script-like patterns
  sanitized = sanitized.replace(/javascript:/gi, "");
  sanitized = sanitized.replace(/on\w+\s*=/gi, "");

  // Decode HTML entities to prevent double encoding
  sanitized = sanitized.replace(/&/g, "&amp;");
  sanitized = sanitized.replace(/</g, "&lt;");
  sanitized = sanitized.replace(/>/g, "&gt;");
  sanitized = sanitized.replace(/"/g, "&quot;");
  sanitized = sanitized.replace(/'/g, "&#x27;");

  return sanitized.trim();
}

// Validate name format (letters, spaces, hyphens, apostrophes)
function isValidName(name) {
  const cleaned = sanitizeInput(name).trim();
  if (!cleaned || cleaned.length < 2) {
    return false;
  }
  if (cleaned.length > 100) {
    return false;
  }

  // Allow letters, spaces, hyphens, apostrophes
  const nameRegex = /^[a-zA-Z\s\-']+$/;
  return nameRegex.test(cleaned);
}

// Validate email format
function isValidEmail(email) {
  const cleaned = sanitizeInput(email).trim().toLowerCase();
  // RFC 5322 simplified email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleaned)) {
    return false;
  }

  // Additional checks
  if (cleaned.length > 254) {
    return false;
  }
  if (cleaned.split("@")[0].length > 64) {
    return false;
  }

  return true;
}

// Validate phone number format (basic validation, optional field)
function isValidPhone(phone) {
  if (!phone || phone.trim() === "") {
    return true; // Optional field
  }

  const cleaned = sanitizeInput(phone).trim();

  // Allow various phone formats
  const phoneRegex = /^[\d\s\-()+]+$/;
  if (!phoneRegex.test(cleaned)) {
    return false;
  }

  // Remove non-digits to check length
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    return false;
  }

  return true;
}

// Validate message length and content
function isValidMessage(message) {
  const cleaned = sanitizeInput(message).trim();
  if (!cleaned || cleaned.length < 5) {
    return false;
  }
  if (cleaned.length > 5000) {
    return false;
  }

  return true;
}

function validateContactForm(event) {
  event.preventDefault();

  // Get form values and sanitize them
  const nameInput = document.getElementById("name").value;
  const emailInput = document.getElementById("email").value;
  const phoneInput = document.getElementById("phone").value;
  const messageInput = document.getElementById("message").value;

  const name = sanitizeInput(nameInput);
  const email = sanitizeInput(emailInput);
  const phone = sanitizeInput(phoneInput);
  const message = sanitizeInput(messageInput);

  // Clear previous errors
  document.getElementById("name").classList.remove("is-invalid");
  document.getElementById("email").classList.remove("is-invalid");
  document.getElementById("phone").classList.remove("is-invalid");
  document.getElementById("message").classList.remove("is-invalid");

  // Validate required fields and formats
  const errors = [];

  if (!name) {
    document.getElementById("name").classList.add("is-invalid");
    errors.push("Name is required");
  } else if (!isValidName(name)) {
    document.getElementById("name").classList.add("is-invalid");
    errors.push(
      "Name must be at least 2 characters and contain only letters, spaces, hyphens, and apostrophes"
    );
  }

  if (!email) {
    document.getElementById("email").classList.add("is-invalid");
    errors.push("Email is required");
  } else if (!isValidEmail(email)) {
    document.getElementById("email").classList.add("is-invalid");
    errors.push("Please enter a valid email address");
  }

  if (phone && !isValidPhone(phone)) {
    document.getElementById("phone").classList.add("is-invalid");
    errors.push("Phone number format is invalid");
  }

  if (!message) {
    document.getElementById("message").classList.add("is-invalid");
    errors.push("Message is required");
  } else if (!isValidMessage(message)) {
    document.getElementById("message").classList.add("is-invalid");
    errors.push("Message must be between 5 and 5000 characters");
  }

  // If there are errors, show the modal
  if (errors.length > 0) {
    showErrorModal(errors);
    return false;
  }

  // If validation passes, submit the form to Lambda
  const formData = {
    name: name,
    email: email,
    phone: phone || "",
    message: message,
    csrf_token: CSRF_TOKEN
  };

  submitForm(formData);
}

function showErrorModal(errors) {
  // Get a random witty message
  const wittyMessage =
    wittyErrorMessages[Math.floor(Math.random() * wittyErrorMessages.length)];

  // Create modal if it doesn't exist
  let modal = document.getElementById("validationErrorModal");
  if (!modal) {
    modal = createErrorModal();
  }

  // Update modal content
  const modalBody = modal.querySelector(".modal-body");
  const errorList = errors.map((error) => `<li>${error}</li>`).join("");

  modalBody.innerHTML = `
    <p class="fw-bold mb-3">${wittyMessage}</p>
    <ul class="mb-0">
      ${errorList}
    </ul>
  `;

  // Show the modal using Bootstrap
  const bootstrapModal = new bootstrap.Modal(modal);
  bootstrapModal.show();
}

function createErrorModal() {
  const modal = document.createElement("div");
  modal.id = "validationErrorModal";
  modal.className = "modal fade";
  modal.tabIndex = -1;
  modal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header bg-danger text-white">
          <h5 class="modal-title">
            <i class="bi bi-exclamation-circle me-2"></i>Oops!
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <!-- Content will be inserted here -->
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Got it!</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

// Submit form data to Lambda function via API Gateway
async function submitForm(formData) {
  try {
    // Show loading state
    const submitButton = document.getElementById("submitButton");
    submitButton.disabled = true;
    submitButton.innerHTML =
      "<span class=\"spinner-border spinner-border-sm me-2\"></span>Sending...";

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(formData)
    });

    const result = await response.json();

    if (response.ok) {
      showSuccessModal();
      document.getElementById("contactForm").reset();
      submitButton.disabled = false;
      submitButton.innerHTML = "Submit";
    } else {
      showErrorModal([result.message || "Failed to send message"]);
      submitButton.disabled = false;
      submitButton.innerHTML = "Submit";
    }
  } catch (error) {
    console.error("Error:", error);
    showErrorModal(["Failed to send message. Please try again later."]);
    const submitButton = document.getElementById("submitButton");
    submitButton.disabled = false;
    submitButton.innerHTML = "Submit";
  }
}

// Show success modal
function showSuccessModal() {
  let modal = document.getElementById("successModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "successModal";
    modal.className = "modal fade";
    modal.tabIndex = -1;
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-success text-white">
            <h5 class="modal-title">
              <i class="bi bi-check-circle me-2"></i>Success!
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="mb-0">Thank you for your message! I'll get back to you soon.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-success" data-bs-dismiss="modal">Great!</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const bootstrapModal = new bootstrap.Modal(modal);
  bootstrapModal.show();
}

// Initialize form validation when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
  // Initialize CSRF token
  initCsrfToken();

  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", validateContactForm);
  }
});
