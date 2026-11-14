/**
 * Blog page behaviour: tag filter on the index, copy buttons on code blocks,
 * copy-link on posts, and table-of-contents highlighting. No dependencies.
 */

function initTagFilter() {
  const buttons = document.querySelectorAll(".tag-filter [data-tag]");
  const items = document.querySelectorAll(".post-item");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const tag = button.getAttribute("data-tag");
      buttons.forEach((b) => b.classList.toggle("on", b === button));
      items.forEach((item) => {
        const tags = (item.getAttribute("data-tags") || "").split(" ");
        item.hidden = Boolean(tag) && !tags.includes(tag);
      });
    });
  });
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = "copied";
    setTimeout(() => {
      button.textContent = label;
    }, 1500);
  } catch (err) {
    console.warn("Copy failed", err);
  }
}

function initCopyButtons() {
  document.querySelectorAll(".copy-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const code = button.closest(".codeblock")?.querySelector("code");
      if (code) {
        copyText(code.textContent, button);
      }
    });
  });
  document.querySelectorAll(".copy-link").forEach((button) => {
    button.addEventListener("click", () => copyText(window.location.href.split("#")[0], button));
  });
}

function initTocHighlight() {
  const links = [...document.querySelectorAll(".toc a[href^='#']")];
  if (!links.length || !("IntersectionObserver" in window)) {
    return;
  }
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        links.forEach((a) => a.classList.remove("on"));
        byId.get(entry.target.id)?.classList.add("on");
      }
    });
  }, { rootMargin: "-40px 0px -70% 0px" });
  byId.forEach((_link, id) => {
    const heading = document.getElementById(id);
    if (heading) {
      observer.observe(heading);
    }
  });
  links[0].classList.add("on");
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    initTagFilter();
    initCopyButtons();
    initTocHighlight();
  });
}
