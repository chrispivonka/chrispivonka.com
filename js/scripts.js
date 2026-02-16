/*!
 * Start Bootstrap - Personal v1.0.1 (https://startbootstrap.com/template-overviews/personal)
 * Copyright 2013-2023 Start Bootstrap
 * Licensed under MIT (https://github.com/StartBootstrap/startbootstrap-personal/blob/master/LICENSE)
 */

// Load header and footer partials
async function loadPartials() {
  try {
    // Load header
    const headerResponse = await fetch("partials/header.html");
    if (headerResponse.ok) {
      const headerHtml = await headerResponse.text();
      const headerPlaceholder = document.getElementById("header-placeholder");
      if (headerPlaceholder) {
        // Use DOMParser for safer HTML parsing
        const parser = new DOMParser();
        const doc = parser.parseFromString(headerHtml, "text/html");
        // Check for parse errors
        if (doc.body) {
          headerPlaceholder.replaceChildren(...doc.body.childNodes);
        }
      }
    }

    // Load footer
    const footerResponse = await fetch("partials/footer.html");
    if (footerResponse.ok) {
      const footerHtml = await footerResponse.text();
      const footerPlaceholder = document.getElementById("footer-placeholder");
      if (footerPlaceholder) {
        // Use DOMParser for safer HTML parsing
        const parser = new DOMParser();
        const doc = parser.parseFromString(footerHtml, "text/html");
        // Check for parse errors
        if (doc.body) {
          footerPlaceholder.replaceChildren(...doc.body.childNodes);
        }
      }
    }
  } catch (error) {
    console.error("Error loading partials:", error);
  }
}

// Load partials before other initialization
loadPartials().then(() => {
  // Initialize dark mode and back-to-top after partials are loaded
  initializeScripts();
});

function initializeScripts() {
  // Update current year in footer
  const currentYearElement = document.getElementById("current-year");
  if (currentYearElement) {
    currentYearElement.textContent = new Date().getFullYear();
  }

  // Back to top button functionality
  const backToTopBtn = document.getElementById("backToTopBtn");

  // Only initialize back to top if button exists
  if (backToTopBtn) {
    // Show/hide button based on scroll position
    window.addEventListener("scroll", function () {
      if (window.pageYOffset > 10) {
        backToTopBtn.classList.add("show");
      } else {
        backToTopBtn.classList.remove("show");
      }
    });

    // Smooth scroll to top when button is clicked
    backToTopBtn.addEventListener("click", function (e) {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });
  }

  // Dark mode toggle functionality
  const darkModeToggle = document.getElementById("darkModeToggle");
  const html = document.documentElement;

  // Only initialize dark mode if toggle exists
  if (darkModeToggle) {
    // Check for saved dark mode preference or system preference
    const savedMode = localStorage.getItem("darkMode");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;

    if (savedMode === "enabled" || (savedMode === null && prefersDark)) {
      html.classList.add("dark-mode");
      updateToggleIcon();
    }

    // Toggle dark mode when button is clicked
    darkModeToggle.addEventListener("click", function () {
      html.classList.toggle("dark-mode");

      if (html.classList.contains("dark-mode")) {
        localStorage.setItem("darkMode", "enabled");
      } else {
        localStorage.setItem("darkMode", "disabled");
      }

      updateToggleIcon();
    });
  }

  function updateToggleIcon() {
    const icon = darkModeToggle.querySelector("i");
    if (html.classList.contains("dark-mode")) {
      icon.classList.remove("bi-moon-fill");
      icon.classList.add("bi-sun-fill");
    } else {
      icon.classList.remove("bi-sun-fill");
      icon.classList.add("bi-moon-fill");
    }
  }
}
