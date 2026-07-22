export async function loadPartials() {
  try {
    const headerResponse = await fetch("/partials/header.html");
    if (headerResponse.ok) {
      const headerHtml = await headerResponse.text();
      const headerPlaceholder = document.getElementById("header-placeholder");
      if (headerPlaceholder) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(headerHtml, "text/html");
        if (doc.body) {
          headerPlaceholder.replaceChildren(...doc.body.childNodes);
        }
      }
    }
    const footerResponse = await fetch("/partials/footer.html");
    if (footerResponse.ok) {
      const footerHtml = await footerResponse.text();
      const footerPlaceholder = document.getElementById("footer-placeholder");
      if (footerPlaceholder) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(footerHtml, "text/html");
        if (doc.body) {
          footerPlaceholder.replaceChildren(...doc.body.childNodes);
        }
      }
    }
  } catch (error) {
    console.error("Error loading partials:", error);
  }
}

// Auto-init
if (typeof document !== "undefined" && document.readyState !== "loading") {
  loadPartials().then(() => initializeScripts());
} else if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    loadPartials().then(() => initializeScripts());
  });
}

export function initializeScripts() {
  // Navbar toggler
  const toggler = document.querySelector(".navbar-toggler");
  const navCollapse = document.getElementById("navbarSupportedContent");
  if (toggler && navCollapse) {
    toggler.addEventListener("click", function() {
      if (typeof bootstrap !== "undefined") {
        const bsCollapse = bootstrap.Collapse.getOrCreateInstance(navCollapse);
        bsCollapse.toggle();
      } else {
        navCollapse.classList.toggle("show");
        toggler.setAttribute("aria-expanded", String(navCollapse.classList.contains("show")));
      }
    });
  }

  // Current year
  const currentYearEl = document.getElementById("current-year");
  if (currentYearEl) {
    currentYearEl.textContent = new Date().getFullYear();
  }

  // Set active nav link
  setActiveNavLink();

  // Back to top
  const backToTopBtn = document.getElementById("backToTopBtn");
  if (backToTopBtn) {
    window.addEventListener("scroll", () => {
      backToTopBtn.classList[window.pageYOffset > 300 ? "add" : "remove"]("show");
    });
    backToTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  // Dark mode toggle
  const darkModeToggle = document.getElementById("darkModeToggle");
  const html = document.documentElement;
  if (darkModeToggle) {
    const savedMode = localStorage.getItem("darkMode");
    const prefersDark = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches : true;
    if (savedMode === "enabled" || (savedMode === null && prefersDark) || savedMode === null) {
      html.classList.add("dark-mode");
    }
    darkModeToggle.addEventListener("click", () => {
      html.classList.toggle("dark-mode");
      localStorage.setItem("darkMode", html.classList.contains("dark-mode") ? "enabled" : "disabled");
      updateToggleIcon();
    });
    function updateToggleIcon() {
      const icon = darkModeToggle.querySelector("i");
      if (!icon) {
        return;
      }
      if (html.classList.contains("dark-mode")) {
        icon.classList.remove("bi-moon-fill");
        icon.classList.add("bi-sun-fill");
      } else {
        icon.classList.remove("bi-sun-fill");
        icon.classList.add("bi-moon-fill");
      }
    }
    updateToggleIcon();
  }

  // Initialize all subsystems
  initConstellationCanvas();
  initScrollReveal();
  initGlitchEffects();
  initLiveClock();
  initSmoothScroll();
  initCommandPalette();
  initCodeTabs();
  initInteractiveCLI();
  initModeSwitcher();
  initTopologyNodes();
  initWebAudioSFX();
  initEasterEggs();
  initFloatingNav();
  initLiveStats(); // async — updates UI when GitHub API responds
}

function setActiveNavLink() {
  if (typeof window === "undefined") {
    return;
  }
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach(link => {
    const href = link.getAttribute("href");
    if (href && href !== "/" && currentPath.startsWith(href)) {
      link.classList.add("active");
    } else if (href === "/" && currentPath === "/") {
      link.classList.add("active");
    }
  });
}

function initConstellationCanvas() {
  if (typeof document === "undefined") {
    return;
  }
  const canvas = document.getElementById("constellation-canvas");
  if (!canvas) {
    return;
  }
  let ctx;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    return; 
  }
  if (!ctx) {
    return;
  }
  
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;
  const particles = [];
  const mouse = { x: -1000, y: -1000 };

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  
  for(let i = 0; i < 70; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      radius: Math.random() * 1.5 + 0.5
    });
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > width) {
        p.vx *= -1;
      }
      if (p.y < 0 || p.y > height) {
        p.vy *= -1;
      }
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(88, 166, 255, 0.6)";
      ctx.fill();
    });

    for(let i = 0; i < particles.length; i++) {
      for(let j = i+1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if(dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(88, 166, 255, ${(1 - dist/120) * 0.4})`;
          ctx.stroke();
        }
      }
      const dxM = particles[i].x - mouse.x;
      const dyM = particles[i].y - mouse.y;
      const distM = Math.sqrt(dxM*dxM + dyM*dyM);
      if (distM < 150) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.strokeStyle = `rgba(188, 140, 255, ${1 - distM/150})`;
        ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

function initScrollReveal() {
  if (typeof document === "undefined") {
    return;
  }
  const reveals = document.querySelectorAll(".reveal");
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    }, { threshold: 0.1 });
    reveals.forEach(el => observer.observe(el));
  } else {
    reveals.forEach(el => el.classList.add("visible"));
  }
}

function initLiveClock() {
  if (typeof document === "undefined") {
    return;
  }
  const clock = document.getElementById("live-clock");
  const uptime = document.getElementById("uptime-counter");
  const startDate = new Date("2022-01-01T00:00:00Z");
  
  function update() {
    const now = new Date();
    if (clock) {
      clock.textContent = now.toLocaleTimeString("en-US", { timeZone: "America/Denver", hour12: false }) + " MST";
    }
    
    if (uptime) {
      const diff = now - startDate;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / 1000 / 60) % 60);
      uptime.textContent = `uptime: ${days}d ${hours}h ${minutes}m`;
    }
  }
  update();
  setInterval(update, 1000);
}

function initSmoothScroll() {
  if (typeof document === "undefined") {
    return;
  }
  document.querySelectorAll(".nav-pill").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute("href"));
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}

function escapeHtml(unsafe) {
  return (unsafe || "").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function initInteractiveCLI() {
  if (typeof document === "undefined") {
    return;
  }
  const cliInput = document.getElementById("cliInput");
  const cliBody  = document.getElementById("cliBody");
  if (!cliInput || !cliBody) {
    return;
  }

  const history = [];
  let histIdx = -1;

  // inject clickable hint chips into the terminal panel
  const termPanel = document.getElementById("tab-terminal");
  if (termPanel) {
    const chips = document.createElement("div");
    chips.className = "terminal-chips";
    chips.innerHTML = [
      "help","whoami","ls projects","ls skills","cat bio.json",
      "ping","neofetch","sudo hire chris","clear"
    ].map(c => `<span class="cmd-chip">${c}</span>`).join("");
    // insert before the input row
    const inputRow = termPanel.querySelector(".terminal-input-row");
    if (inputRow) {
      termPanel.insertBefore(chips, inputRow);
    }
    chips.querySelectorAll(".cmd-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        cliInput.value = chip.textContent;
        processCommand(chip.textContent);
        cliInput.value = "";
        cliInput.focus();
      });
    });
  }

  function printLine(html, extraClass = "") {
    const line = document.createElement("div");
    line.className = "term-line" + (extraClass ? " " + extraClass : "");
    line.innerHTML = html;
    cliBody.appendChild(line);
    cliBody.scrollTop = cliBody.scrollHeight;
  }

  function processCommand(cmd) {
    const trimmed = cmd.trim();

    // echo the prompt + command
    if (trimmed !== "") {
      printLine(
        "<span class=\"term-prompt-echo\">guest@chrispivonka.com</span>" +
        "<span class=\"term-dim\">:</span><span style=\"color:var(--cyan)\">~</span>" +
        `<span class="term-dim">$</span> ${escapeHtml(trimmed)}`
      );
    }

    if (trimmed === "") {
      return;
    } else if (trimmed === "clear") {
      cliBody.innerHTML = "";
      return;
    } else if (trimmed === "help") {
      printLine("<span class=\"term-info\">available commands:</span>");
      const cmds = [
        ["help",            "show this message"],
        ["whoami",          "identify the operator"],
        ["cat bio.json",    "read the source file"],
        ["ls projects",     "list active deployments"],
        ["ls skills",       "list installed packages"],
        ["ping",            "check latency to Denver"],
        ["neofetch",        "system info (obviously)"],
        ["sudo hire chris", "initiate hire sequence"],
        ["clear",           "clear the terminal"]
      ];
      cmds.forEach(([c, d]) =>
        printLine(`  <span class="term-cmd">${c.padEnd(20)}</span><span class="term-dim">${d}</span>`)
      );
    } else if (trimmed === "whoami") {
      printLine("<span class=\"term-info\">Chris Pivonka — Software Engineer, Fandango. Denver, CO.</span>");
    } else if (trimmed === "cat bio.json") {
      printLine("<span class=\"term-dim\">{</span>");
      printLine("  <span class=\"term-cmd\">\"name\"</span><span class=\"term-dim\">: </span><span class=\"term-success\">\"Chris Pivonka\"</span><span class=\"term-dim\">,</span>");
      printLine("  <span class=\"term-cmd\">\"role\"</span><span class=\"term-dim\">: </span><span class=\"term-success\">\"Software Engineer\"</span><span class=\"term-dim\">,</span>");
      printLine("  <span class=\"term-cmd\">\"employer\"</span><span class=\"term-dim\">: </span><span class=\"term-success\">\"Fandango\"</span><span class=\"term-dim\">,</span>");
      printLine("  <span class=\"term-cmd\">\"location\"</span><span class=\"term-dim\">: </span><span class=\"term-success\">\"Denver, CO\"</span><span class=\"term-dim\">,</span>");
      printLine("  <span class=\"term-cmd\">\"yearsExp\"</span><span class=\"term-dim\">: </span><span style=\"color:var(--orange)\">10</span>");
      printLine("<span class=\"term-dim\">}</span>");
    } else if (trimmed === "ls projects") {
      printLine("<span class=\"term-success\">kittycam-infra</span>        <span class=\"term-dim\">LIVE — AWS CloudFront + Lambda@Edge</span>");
      printLine("<span class=\"term-success\">ci-cd-pipeline</span>        <span class=\"term-dim\">PRODUCTION — GitHub Actions + Lighthouse</span>");
      printLine("<span class=\"term-success\">backend-microservices</span>  <span class=\"term-dim\">ENTERPRISE — C# .NET + Redis + DynamoDB</span>");
    } else if (trimmed === "ls skills") {
      printLine("<span class=\"term-info\">languages:</span>        <span class=\"term-cmd\">C#  JS  Python  Node  C++  Java  SQL  Bash</span>");
      printLine("<span class=\"term-info\">infrastructure:</span>   <span class=\"term-cmd\">AWS  Docker  Terraform  PostgreSQL  Redis  DynamoDB</span>");
      printLine("<span class=\"term-info\">devtools:</span>         <span class=\"term-cmd\">GitHub Actions  CloudWatch  Elasticsearch  Jest</span>");
    } else if (trimmed === "ping denver" || trimmed === "ping") {
      printLine("<span class=\"term-dim\">PING denver.local (127.0.0.1): 56 bytes</span>");
      [12, 11, 13].forEach((ms, i) =>
        printLine(`<span class="term-dim">64 bytes: icmp_seq=${i} ttl=64 time=</span><span class="term-success">${ms} ms</span>`)
      );
      printLine("<span class=\"term-info\">--- denver.local ping statistics ---</span>");
      printLine("<span class=\"term-dim\">3 packets transmitted, 3 received, </span><span class=\"term-success\">0% packet loss</span>");
    } else if (trimmed === "neofetch") {
      printLine("       <span class=\"term-success\">chris@chrispivonka.com</span>");
      printLine("       <span class=\"term-dim\">----------------------</span>");
      printLine("       <span class=\"term-cmd\">OS:</span>      <span class=\"term-info\">macOS / Linux (prod)</span>");
      printLine("       <span class=\"term-cmd\">Host:</span>    <span class=\"term-info\">Fandango Platform Engineering</span>");
      printLine("       <span class=\"term-cmd\">Shell:</span>   <span class=\"term-info\">zsh 5.9</span>");
      printLine("       <span class=\"term-cmd\">Editor:</span>  <span class=\"term-info\">VS Code (obviously)</span>");
      printLine("       <span class=\"term-cmd\">Coffee:</span>  <span style=\"color:var(--orange)\">∞ cups consumed</span>");
      printLine("       <span class=\"term-cmd\">Status:</span>  <span class=\"term-success\">✓ operational</span>");
    } else if (trimmed === "sudo hire" || trimmed === "sudo hire chris") {
      printLine("<span class=\"term-dim\">[sudo] password for guest: ••••••••</span>");
      setTimeout(() => {
        printLine("<span class=\"term-info\">Checking qualifications...</span>");
        setTimeout(() => {
          printLine("  <span class=\"term-success\">✓ distributed systems — PASS</span>");
          printLine("  <span class=\"term-success\">✓ cloud infrastructure — PASS</span>");
          printLine("  <span class=\"term-success\">✓ coffee tolerance — PASS</span>");
          printLine("  <span class=\"term-warn\">⚠ WARNING: once hired, cannot be un-hired</span>");
          printLine("<span class=\"term-success\">✓ Hire request sent → chris@chrispivonka.com</span>");
          cliBody.scrollTop = cliBody.scrollHeight;
          showToast("📨 Hire request sent! (check your conscience)");
        }, 600);
      }, 400);
    } else if (trimmed === "konami") {
      printLine("<span class=\"term-dim\">initiating... ↑↑↓↓←→←→</span>");
      setTimeout(() => {
        if (typeof window !== "undefined" && window._triggerGodMode) {
          window._triggerGodMode();
        }
        cliBody.scrollTop = cliBody.scrollHeight;
      }, 400);

    // ─── secret terminal commands ─────────────────────────────────
    } else if (trimmed === "rm -rf /" || trimmed === "sudo rm -rf /") {
      printLine("<span class=\"term-err\">rm: cannot remove '/': Permission denied</span>");
      printLine("<span class=\"term-warn\">nice try. the prod database thanks you for your restraint.</span>");

    } else if (trimmed === "top") {
      printLine("<span class=\"term-info\">PID   COMMAND            %CPU  MEM</span>");
      [
        ["1",    "coffee-daemon",    "94.2", "12.1 GB"],
        ["42",   "anxiety.exe",      "67.1", "4.3 GB"],
        ["1337", "stackoverflow",    "44.8", "8.7 GB"],
        ["9001", "npm-install",      "31.0", "∞ GB"],
        ["512",  "rubber-duck.sh",   "12.3", "0.1 GB"],
        ["7",    "todo-never-done",   "8.9", "0.8 GB"],
        ["404",  "work-life-balance", "0.0", "0.0 GB"]
      ].forEach(([pid, cmd, cpu, mem]) =>
        printLine(`<span class="term-dim">${pid.padStart(5)}  </span><span class="term-cmd">${cmd.padEnd(18)}</span><span class="term-warn">${cpu.padStart(5)}%</span>  <span class="term-info">${mem}</span>`)
      );
      printLine("<span class=\"term-dim\">press q to quit (you can't)</span>");

    } else if (trimmed === "npm install") {
      printLine("<span class=\"term-info\">npm warn deprecated sanity@0.0.1</span>");
      printLine("<span class=\"term-dim\">added 2,847 packages in 4 minutes</span>");
      setTimeout(() => {
        printLine("<span class=\"term-dim\">found <span class=\"term-err\">847 vulnerabilities</span> (412 low, 291 moderate, 144 high)</span>");
        printLine("<span class=\"term-dim\">run 'npm audit fix' to maybe make it worse</span>");
        cliBody.scrollTop = cliBody.scrollHeight;
      }, 900);

    } else if (trimmed === "git blame") {
      printLine("<span class=\"term-dim\">running git blame on career choices...</span>");
      [
        ["a3f9c12", "Caffeine         ", "src/decisions/architecture.ts:47"],
        ["e81b447", "Caffeine         ", "src/decisions/tech-stack.ts:12"],
        ["c290df1", "Stack Overflow   ", "src/decisions/that-regex.ts:891"],
        ["bb34a09", "Past Me          ", "src/decisions/no-comments.ts:1"],
        ["3e29a14", "Chris Pivonka    ", "src/decisions/marquette.ts:1"]
      ].forEach(([hash, author, file]) =>
        printLine(`<span class="term-warn">${hash}</span> <span class="term-dim">(</span><span class="term-cmd">${author}</span><span class="term-dim">) ${file}</span>`)
      );

    } else if (trimmed === "cat .env") {
      printLine("<span class=\"term-err\">cat: .env: Permission denied</span>");
      printLine("<span class=\"term-dim\">(nice try — that's a classic)</span>");

    } else if (trimmed === "exit" || trimmed === "logout") {
      printLine("<span class=\"term-warn\">logout</span>");
      setTimeout(() => {
        printLine("<span class=\"term-dim\">There is no escape. The terminal is eternal.</span>");
        printLine("<span class=\"term-dim\">Connection to chrispivonka.com kept alive.</span>");
        cliBody.scrollTop = cliBody.scrollHeight;
      }, 600);

    } else if (trimmed === "ls -la" || trimmed === "ls") {
      printLine("<span class=\"term-dim\">total 42</span>");
      [
        ["drwxr-xr-x", "chris", "chris", "about/"],
        ["drwxr-xr-x", "chris", "chris", "projects/"],
        ["drwxr-xr-x", "chris", "chris", "experience/"],
        ["-rw-r--r--", "chris", "chris", ".secrets"],
        ["-rw-------", "root",  "root",  ".env"],
        ["-rwxr-xr-x", "chris", "chris", "hire.sh"]
      ].forEach(([perms, user, group, name]) =>
        printLine(`<span class="term-dim">${perms} ${user} ${group} </span><span class="term-cmd">${name}</span>`)
      );

    } else if (trimmed === "cat .secrets") {
      printLine("<span class=\"term-success\">☕ Drink more coffee.</span>");
      printLine("<span class=\"term-success\">🚀 Ship it. Revert if needed.</span>");
      printLine("<span class=\"term-success\">📖 Read the docs. No, actually read them.</span>");
      printLine("<span class=\"term-success\">🐛 It's always a missing semicolon.</span>");

    } else if (trimmed === "fortune") {
      const fortunes = [
        "The best debugging tool is a good night's sleep.",
        "It works on my machine. Ship the machine.",
        "Any fool can write code a computer understands. Good luck with the other kind.",
        "The first 90% of the code accounts for the first 90% of the development time.",
        "sudo make me a sandwich.",
        "To understand recursion, see: recursion.",
        "A bug is just an undocumented feature."
      ];
      printLine(`<span class="term-info">${fortunes[Math.floor(Math.random() * fortunes.length)]}</span>`);

    } else {
      printLine(`<span class="term-err">command not found: ${escapeHtml(trimmed)}</span> <span class="term-dim">— try 'help'</span>`);
    }
  }

  cliInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const val = cliInput.value;
      if (val.trim()) {
        history.unshift(val); histIdx = -1; 
      }
      processCommand(val);
      cliInput.value = "";
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (histIdx < history.length - 1) {
        histIdx++;
      }
      cliInput.value = history[histIdx] || "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx > 0) {
        histIdx--;
      } else {
        histIdx = -1; cliInput.value = ""; return; 
      }
      cliInput.value = history[histIdx] || "";
    }
  });

  // focus input whenever the terminal tab panel is clicked
  if (termPanel) {
    termPanel.addEventListener("click", () => cliInput.focus());
  }
}


function initModeSwitcher() {
  if (typeof document === "undefined") {
    return;
  }
  const tabs = document.querySelectorAll(".mode-tab");
  const views = document.querySelectorAll(".mode-view");
  
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const mode = tab.getAttribute("data-mode");
      views.forEach(v => {
        if (v.getAttribute && v.getAttribute("id") === `view-${mode}` || v.id === `view-${mode}`) {
          v.style.display = "block";
        } else {
          v.style.display = "none";
        }
      });
    });
  });
}

const nodeData = {
  edge: { title: "Edge CDN & Lambda@Edge Routing", desc: "Edge processing and caching.", code: "code1" },
  microservices: { title: "High-Scale Distributed Microservices", desc: "Microservices desc.", code: "code2" },
  datastores: { title: "Distributed Datastores & Redis", desc: "Datastores desc.", code: "code3" },
  telemetry: { title: "SRE Telemetry & Observability", desc: "Telemetry desc.", code: "code4" }
};

function initTopologyNodes() {
  if (typeof document === "undefined") {
    return;
  }
  const nodes = document.querySelectorAll(".topo-node");
  const title = document.getElementById("nodeDetailTitle");
  const desc = document.getElementById("nodeDetailDesc");
  const code = document.getElementById("nodeDetailCode");
  
  nodes.forEach(node => {
    node.addEventListener("click", () => {
      nodes.forEach(n => n.classList.remove("active"));
      node.classList.add("active");
      const key = node.getAttribute("data-node");
      const data = nodeData[key];
      if (data && title && desc && code) {
        title.textContent = data.title;
        desc.textContent = data.desc;
        code.textContent = data.code;
      }
    });
  });
}

function initWebAudioSFX() {
  if (typeof document === "undefined") {
    return;
  }
  let audioEnabled = false;
  const toggle = document.getElementById("audioToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      audioEnabled = !audioEnabled;
      toggle.textContent = audioEnabled ? "Audio: ON" : "Audio: OFF";
    });
  }
  
  window.playCyberBeep = function() {
    if (!audioEnabled) {
      return;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        return;
      }
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.connect(ctx.destination);
      osc.start();
    } catch {
      /* ignore audio context errors */
    }
  };

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t && (t.tagName === "BUTTON" || (t.classList && t.classList.contains("cmd-chip")) || (t.closest && t.closest("button, .cmd-chip")))) {
      window.playCyberBeep();
    }
  });
}

function initGlitchEffects() {
  if (typeof document === "undefined") {
    return;
  }
  const role = document.querySelector(".hero-role");
  if (!role) {
    return;
  }
  const originalText = "Software Engineer";
  const chars = "!<>-_\\\\/[]{}—=+*^?#_";
  
  let interval = null;
  role.addEventListener("mouseover", () => {
    let iteration = 0;
    clearInterval(interval);
    interval = setInterval(() => {
      role.innerHTML = originalText.split("").map((letter, index) => {
        if(index < iteration) {
          return letter;
        }
        return chars[Math.floor(Math.random() * chars.length)];
      }).join("") + "<span class=\"cursor\"></span>";
      
      if(iteration >= originalText.length){ 
        clearInterval(interval);
      }
      iteration += 1 / 2;
    }, 30);
  });
}

function initCommandPalette() {
  if (typeof document === "undefined") {
    return;
  }

  const overlay  = document.getElementById("cmdPaletteOverlay");
  const input    = document.getElementById("cmdPaletteInput");
  const openBtn  = document.getElementById("openCmdK");
  if (!overlay || !input) {
    return;
  }

  const allResults = () => Array.from(document.querySelectorAll(".cmd-result"));

  function open() {
    overlay.classList.add("open");
    setTimeout(() => input && input.focus(), 50);
    resetFilter();
  }

  function close() {
    overlay.classList.remove("open");
    if (input) {
      input.value = "";
    }
    resetFilter();
  }

  function resetFilter() {
    allResults().forEach(r => {
      r.style.display = ""; r.classList.remove("active"); 
    });
    const first = allResults().find(r => r.style.display !== "none");
    if (first) {
      first.classList.add("active");
    }
  }

  function getActive() {
    return allResults().find(r => r.classList.contains("active") && r.style.display !== "none");
  }

  function setActive(el) {
    allResults().forEach(r => r.classList.remove("active"));
    if (el) {
      el.classList.add("active"); el.scrollIntoView({ block: "nearest" }); 
    }
  }

  function activate(el) {
    if (!el) {
      return;
    }
    const action = el.getAttribute("data-action");
    const target = el.getAttribute("data-target");
    const href   = el.getAttribute("data-href");
    close();
    if (action === "scroll" && target) {
      const dest = document.querySelector(target);
      if (dest) {
        dest.scrollIntoView({ behavior: "smooth" });
      }
    } else if (action === "link" && href) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else if (action === "mailto" && href) {
      window.location.href = href;
    }
  }

  // keyboard shortcut to open
  document.addEventListener("keydown", e => {
    const isMac = navigator.platform && navigator.platform.toUpperCase().includes("MAC");
    const modifier = isMac ? e.metaKey : e.ctrlKey;
    if (modifier && e.key === "k") {
      e.preventDefault();
      overlay.classList.contains("open") ? close() : open();
      return;
    }
    if (!overlay.classList.contains("open")) {
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault(); close(); return; 
    }
    if (e.key === "Enter") {
      e.preventDefault(); activate(getActive()); return; 
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const visible = allResults().filter(r => r.style.display !== "none");
      const idx = visible.indexOf(getActive());
      setActive(visible[Math.min(idx + 1, visible.length - 1)]);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const visible = allResults().filter(r => r.style.display !== "none");
      const idx = visible.indexOf(getActive());
      setActive(visible[Math.max(idx - 1, 0)]);
      return;
    }
  });

  // filter on type
  if (input) {
    input.addEventListener("input", () => {
      const q = input.value.toLowerCase().trim();
      allResults().forEach(r => {
        const label = (r.querySelector(".cmd-result-label") || {}).textContent || "";
        r.style.display = (!q || label.toLowerCase().includes(q)) ? "" : "none";
      });
      const visible = allResults().filter(r => r.style.display !== "none");
      setActive(visible[0] || null);
    });
  }

  // click on result
  allResults().forEach(r => {
    r.addEventListener("click", () => activate(r));
    r.addEventListener("mouseenter", () => setActive(r));
  });

  // click overlay to close
  overlay.addEventListener("click", e => {
    if (e.target === overlay) {
      close();
    } 
  });

  // open via button
  if (openBtn) {
    openBtn.addEventListener("click", open);
  }
}

function initCodeTabs() {
  if (typeof document === "undefined") {
    return;
  }
  const tabs = document.querySelectorAll(".code-editor-pane .code-tab[data-tab]");
  if (!tabs.length) {
    return;
  }

  // Defensive init: enforce correct panel visibility on page load
  // (guards against any FOUC where display:none was briefly overridden)
  const activeTab = document.querySelector(".code-editor-pane .code-tab.active");
  const activeTarget = activeTab ? activeTab.getAttribute("data-tab") : "config";
  document.querySelectorAll(".code-body[id^=\"tab-\"]").forEach(panel => {
    panel.style.display = panel.id === `tab-${activeTarget}` ? "" : "none";
  });

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      // only toggle editor panels — terminal is always visible
      document.querySelectorAll(".code-body[id^=\"tab-\"]").forEach(panel => {
        panel.style.display = panel.id === `tab-${target}` ? "" : "none";
      });
    });
  });
}

// ─── Live Stats (GitHub API + Performance API) ────────────────────────────
async function initLiveStats() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  // 1. Page performance — no network needed, fires after load
  const reportPerf = () => {
    try {
      const [nav] = performance.getEntriesByType("navigation");
      if (!nav) {
        return;
      }
      const ms = Math.round(nav.loadEventEnd - nav.startTime);
      if (ms <= 0) {
        return;
      }
      const el = document.getElementById("term-perf");
      if (el) {
        el.textContent = `loaded ${ms}ms`;
        el.className = `term-stat ${ms < 1000 ? "good" : "warn"}`;
      }
    } catch { /* ignore */ }
  };
  if (document.readyState === "complete") {
    reportPerf();
  } else {
    window.addEventListener("load", reportPerf);
  }

  // 2. Connection type (if available)
  const conn = navigator && navigator.connection;
  if (conn) {
    const el = document.getElementById("term-conn");
    if (el) {
      el.textContent = conn.effectiveType || "";
      el.className = "term-stat" + (["4g","wifi"].includes(conn.effectiveType) ? " good" : " warn");
    }
  }

  // 3. GitHub API — real commits + system health check
  const statusCenter = document.querySelector(".status-center");
  const statusDot    = document.querySelector(".status-bar .status-dot");

  // Optimistic — assume operational until we know otherwise
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      "https://api.github.com/repos/chrispivonka/chrispivonka.com/commits?per_page=8",
      { signal: controller.signal, headers: { Accept: "application/vnd.github.v3+json" } }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`GitHub ${res.status}`);
    }
    const commits = await res.json();

    // ── update git.log tab with real commits ──
    const gitLogPanel = document.getElementById("tab-gitlog");
    if (gitLogPanel && Array.isArray(commits) && commits.length) {
      gitLogPanel.innerHTML = commits.map(c => {
        const hash = c.sha ? c.sha.slice(0, 7) : "???????";
        const msg  = (c.commit && c.commit.message
          ? c.commit.message.split("\n")[0].slice(0, 58)
          : "(no message)");
        const date = c.commit && c.commit.author && c.commit.author.date
          ? new Date(c.commit.author.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "";
        const url  = c.html_url || "#";
        return `<a href="${url}" target="_blank" rel="noopener" class="code-line git-commit-link">` +
               `<span class="git-hash">${hash}</span> ` +
               `<span class="git-msg">${escapeHtml(msg)}</span>` +
               `<span class="git-date">${date}</span></a>`;
      }).join("");
    }

    // ── update footer: keep version, append short sha ──
    const footerHash = document.getElementById("footer-commit-hash");
    if (footerHash && commits[0]) {
      const short = commits[0].sha.slice(0, 7);
      footerHash.textContent = `v2.0.0 \u00b7 ${short}`;
      if (commits[0].html_url) {
        footerHash.href = commits[0].html_url;
      }
    }

    // ── update uptime label ──
    if (commits[0] && commits[0].commit) {
      const commitDateStr = (commits[0].commit.committer && commits[0].commit.committer.date) ||
                            (commits[0].commit.author && commits[0].commit.author.date);
      const lastPush   = new Date(commitDateStr);
      const diffMs     = Date.now() - lastPush.getTime();
      const ageMinutes = Math.max(0, Math.floor(diffMs / 60000));
      const uptimeEl   = document.querySelector(".status-uptime");
      if (uptimeEl) {
        if (isNaN(ageMinutes) || ageMinutes > 43200) {
          uptimeEl.textContent = "uptime: 99.9%";
        } else if (ageMinutes < 60) {
          uptimeEl.textContent = `last push ${Math.max(1, ageMinutes)}m ago`;
        } else if (ageMinutes < 1440) {
          uptimeEl.textContent = `last push ${Math.floor(ageMinutes / 60)}h ago`;
        } else {
          uptimeEl.textContent = `last push ${Math.floor(ageMinutes / 1440)}d ago`;
        }
      }
    }

    // ── system status: OPERATIONAL ──
    if (statusCenter) {
      statusCenter.textContent = "● ALL SYSTEMS OPERATIONAL";
    }
    if (statusDot) {
      statusDot.style.background = "";
      statusDot.style.boxShadow  = "";
    }

  } catch(err) {
    // GitHub unreachable or rate-limited — mark degraded but don't break the page
    if (statusCenter && err.name !== "AbortError") {
      statusCenter.textContent = "● DEGRADED — api.github.com unreachable";
      statusCenter.style.color = "var(--yellow)";
    }
    if (statusDot) {
      statusDot.style.background = "var(--yellow)";
      statusDot.style.boxShadow  = "0 0 6px rgba(210,153,34,0.7)";
    }
  }
}

// ═══════════════════════════════════════
// EASTER EGGS
// ═══════════════════════════════════════

export function showToast(msg, duration = 3500) {
  if (typeof document === "undefined") {
    return;
  }
  let toast = document.getElementById("_egg-toast");
  if (!toast) {
    toast = document.createElement("div");
    if (!toast || !toast.style) {
      return;
    } // guard: test environment mock
    toast.id = "_egg-toast";
    toast.style.cssText = [
      "position:fixed", "bottom:2rem", "right:2rem", "z-index:99999",
      "background:#161b22", "border:1px solid #30363d", "border-radius:8px",
      "padding:0.75rem 1.25rem",
      "font-family:'Fira Code',monospace", "font-size:0.8rem", "color:#c9d1d9",
      "box-shadow:0 8px 32px rgba(0,0,0,0.5)",
      "transform:translateY(20px)", "opacity:0",
      "transition:all 0.3s cubic-bezier(0.16,1,0.3,1)",
      "max-width:320px", "pointer-events:none"
    ].join(";");
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  requestAnimationFrame(() => {
    toast.style.transform = "translateY(0)";
    toast.style.opacity = "1";
  });
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.style.transform = "translateY(20px)";
    toast.style.opacity = "0";
  }, duration);
}

function initEasterEggs() {
  if (typeof document === "undefined") {
    return;
  }

  /**
   * Security note: the two keydown listeners below do client-side pattern
   * matching ONLY. No keystrokes are buffered beyond 6 chars, logged,
   * or transmitted anywhere. Both listeners are gated behind isBodyFocused()
   * and only fire when no input/textarea/select/contenteditable has focus.
   */


  /* eslint-disable no-console */
  if (typeof console !== "undefined") {
    const art = [
      "  ██████╗██╗  ██╗██████╗ ██╗███████╗",
      " ██╔════╝██║  ██║██╔══██╗██║██╔════╝",
      " ██║     ███████║██████╔╝██║███████╗ ",
      " ██║     ██╔══██║██╔══██╗██║╚════██║",
      " ╚██████╗██║  ██║██║  ██║██║███████║",
      "  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝"
    ].join("\n");
    console.log("%c" + art, "color:#58a6ff;font-family:monospace;line-height:1.3;");
    console.log("%cHey. Nice to meet a fellow curious engineer. 👋",
      "color:#3fb950;font-size:14px;font-weight:bold;font-family:monospace;");
    console.log("%cSource code → %chttps://github.com/chrispivonka/chrispivonka.com",
      "color:#8b949e;font-family:monospace;",
      "color:#bc8cff;font-family:monospace;");
    console.log("%c(And yes, there are more easter eggs on this page. Go find them.)",
      "color:#484f58;font-size:11px;font-family:monospace;font-style:italic;");
  }

  // ─── 2. KONAMI CODE → GOD MODE (terminal command only) ────────
  // No global keystroke capture. Type "konami" in the terminal instead.
  window._triggerGodMode = triggerGodMode;

  function triggerGodMode() {
    if (typeof document === "undefined") {
      return;
    }
    if (!document.getElementById("_godStyle")) {
      const s = document.createElement("style");
      s.id = "_godStyle";
      s.textContent = `@keyframes _godFlash {
        0%   { opacity:0; transform:scale(0.92); }
        15%  { opacity:1; transform:scale(1.02); }
        75%  { opacity:1; }
        100% { opacity:0; transform:scale(1.05); }
      }`;
      document.head.appendChild(s);
    }
    const overlay = document.createElement("div");
    if (!overlay.style) {
      return;
    }
    overlay.style.cssText = "position:fixed;inset:0;z-index:99998;pointer-events:none;display:flex;align-items:center;justify-content:center;animation:_godFlash 2.2s ease-out forwards;";
    overlay.innerHTML = `<div style="font-family:'Fira Code',monospace;font-size:clamp(1.4rem,4vw,2.8rem);color:#58a6ff;font-weight:700;letter-spacing:0.1em;text-shadow:0 0 40px rgba(88,166,255,0.9),0 0 80px rgba(88,166,255,0.4);animation:_godFlash 2.2s ease-out forwards;text-align:center;">
      ⚡ GOD MODE ACTIVATED ⚡<br>
      <span style="font-size:0.38em;color:#8b949e;letter-spacing:0.06em;font-weight:400;">you found it. impressive.</span>
    </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2300);
    showToast("⚡ found the konami command. nice.");
  }

  // ─── 3. CLICK THE ∞ METRIC → COFFEE EASTER EGG ────────────────
  // No global keystroke capture. Click the infinity card instead.
  document.querySelectorAll(".metric").forEach(card => {
    const val = card.querySelector(".metric-value");
    if (val && val.textContent.includes("∞")) {
      card.style.cursor = "pointer";
      let coffeeClicks = 0, coffeeTimer;
      card.addEventListener("click", () => {
        coffeeClicks++;
        clearTimeout(coffeeTimer);
        coffeeTimer = setTimeout(() => {
          coffeeClicks = 0; 
        }, 1500);
        val.style.transition = "color 0.2s,transform 0.3s";
        val.style.color = "#d29922";
        val.style.transform = `scale(${1.1 + coffeeClicks * 0.08}) rotate(${coffeeClicks * 5}deg)`;
        setTimeout(() => {
          val.style.color = ""; val.style.transform = ""; 
        }, 700);
        if (coffeeClicks >= 3) {
          coffeeClicks = 0;
          showToast("☕ coffee++ — running on fumes since 2010");
        }
      });
    }
  });

  // ─── 4. CLICK STATUS DOT 5 TIMES → CRITICAL ALERT ────────────
  const dot = document.querySelector(".status-bar .status-dot");
  if (dot) {
    let dotClicks = 0, dotTimer;
    dot.style.cursor = "pointer";
    dot.addEventListener("click", () => {
      dotClicks++;
      clearTimeout(dotTimer);
      dotTimer = setTimeout(() => {
        dotClicks = 0; 
      }, 2000);
      if (dotClicks >= 5) {
        dotClicks = 0;
        dot.style.background = "#f85149";
        dot.style.boxShadow = "0 0 12px rgba(248,81,73,0.9)";
        showToast("🚨 CRITICAL: Engineer dangerously low on coffee. Dispatching supply drone.", 5000);
        setTimeout(() => {
          dot.style.background = ""; dot.style.boxShadow = ""; 
        }, 3000);
      }
    });
  }

  // ─── 5. HOVER "ALL SYSTEMS OPERATIONAL" FOR 3s ────────────────
  const statusCenter = document.querySelector(".status-center");
  if (statusCenter) {
    let hoverTimer;
    const original = statusCenter.textContent;
    statusCenter.addEventListener("mouseenter", () => {
      hoverTimer = setTimeout(() => {
        statusCenter.textContent = "● COFFEE CRITICALLY LOW";
        statusCenter.style.color = "#d29922";
        setTimeout(() => {
          statusCenter.textContent = original;
          statusCenter.style.color = "";
        }, 2500);
      }, 3000);
    });
    statusCenter.addEventListener("mouseleave", () => clearTimeout(hoverTimer));
  }

  // ─── 6. TRIPLE-CLICK HERO TITLE → LETTER SCRAMBLE ────────────
  const heroTitle = document.querySelector(".hero-title");
  if (heroTitle) {
    let titleClicks = 0, titleTimer;
    heroTitle.style.cursor = "default";
    heroTitle.addEventListener("click", () => {
      titleClicks++;
      clearTimeout(titleTimer);
      titleTimer = setTimeout(() => {
        titleClicks = 0; 
      }, 600);
      if (titleClicks >= 3) {
        titleClicks = 0;
        const original = heroTitle.innerHTML;
        const chars = "!<>-_/[]{}—=+*^?#@$%&";
        let iter = 0;
        const plain = heroTitle.textContent;
        const iv = setInterval(() => {
          heroTitle.innerHTML = plain.split("").map((l, i) =>
            i < iter ? (original.includes("gradient-text") && i > 5
              ? `<span class="gradient-text">${l}</span>` : l)
              : chars[Math.floor(Math.random() * chars.length)]
          ).join("");
          if (iter >= plain.length) {
            clearInterval(iv); heroTitle.innerHTML = original; 
          }
          iter += 0.7;
        }, 28);
        showToast("👀 curious one.");
      }
    });
  }

  // ─── 7. DOUBLE-CLICK RED TRAFFIC LIGHT → EDITOR "CLOSES" ─────
  const redLight = document.querySelector(".code-traffic .t-red");
  const codeBlock = document.querySelector(".hero-code-block");
  if (redLight && codeBlock) {
    redLight.style.cursor = "pointer";
    redLight.addEventListener("dblclick", () => {
      codeBlock.style.transition = "transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.3s";
      codeBlock.style.transformOrigin = "top left";
      codeBlock.style.transform = "scale(0.05)";
      codeBlock.style.opacity = "0";
      showToast("🟥 unsaved changes. classic.");
      setTimeout(() => {
        codeBlock.style.transform = "";
        codeBlock.style.opacity = "";
      }, 1400);
    });
  }

  // ─── 7b. CLICK YELLOW TRAFFIC LIGHT → RETRO AMBER CRT ────────
  const yellowLight = document.querySelector(".code-traffic .t-yellow");
  if (yellowLight && codeBlock) {
    yellowLight.style.cursor = "pointer";
    let amberMode = false;
    yellowLight.addEventListener("click", () => {
      amberMode = !amberMode;
      if (amberMode) {
        codeBlock.style.filter = "sepia(1) hue-rotate(15deg) saturate(3)";
        showToast("📟 retro amber CRT mode: on");
      } else {
        codeBlock.style.filter = "";
        showToast("📟 modern theme restored");
      }
    });
  }

  // ─── 8. CLICK LIVE CLOCK → TOGGLE COFFEE TIME ─────────────────
  const clock = document.getElementById("live-clock");
  if (clock) {
    let coffeeMode = false;
    const coffeeStart = new Date();
    coffeeStart.setHours(7, 32, 0, 0); // first coffee of the day
    clock.style.cursor = "pointer";
    clock.title = "click me";
    clock.addEventListener("click", () => {
      coffeeMode = !coffeeMode;
      if (coffeeMode) {
        const diff = Math.floor((Date.now() - coffeeStart) / 1000 / 60);
        clock.textContent = `☕ ${diff}m since coffee`;
        clock.style.color = "#d29922";
        showToast("☕ coffee mode: on");
      } else {
        clock.style.color = "";
        clock.textContent = new Date().toLocaleTimeString("en-US", { timeZone: "America/Denver", hour12: false }) + " MST";
        showToast("⏱ back to reality");
      }
    });
  }

  // ─── 9. ?hired=true URL PARAM → CELEBRATION ──────────────────
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("hired") === "true") {
      setTimeout(() => {
        showToast("🎉 Welcome to the team! (kidding. maybe.) — chris@chrispivonka.com", 6000);
        if (document.getElementById("_godStyle")) {
          return;
        }
        const s = document.createElement("style");
        s.id = "_godStyle";
        s.textContent = `@keyframes _godFlash {
          0%   { opacity:0; transform:scale(0.92); }
          15%  { opacity:1; transform:scale(1.02); }
          75%  { opacity:1; }
          100% { opacity:0; transform:scale(1.05); }
        }`;
        document.head.appendChild(s);
      }, 800);
    }
  }
}

// ─── Floating Draggable Navigation Window ───
function initFloatingNav() {
  if (typeof document === "undefined") {
    return;
  }
  const panel    = document.getElementById("floatingNav");
  const header   = document.getElementById("floatingNavDrag");
  const closeBtn = document.getElementById("floatingNavClose");
  const bubble   = document.getElementById("floatingNavBubble");

  if (!panel || !header) {
    return;
  }

  // On small mobile screens (< 768px), auto-minimise on load so it doesn't block the screen
  if (typeof window !== "undefined" && window.innerWidth < 768) {
    panel.style.display = "none";
    if (bubble) {
      bubble.hidden = false;
    }
  }

  let isDragging = false;
  let currentX = 0, currentY = 0, initialX = 0, initialY = 0;
  let xOffset = 0, yOffset = 0;

  function resetPosition() {
    currentX = 0;
    currentY = 0;
    xOffset = 0;
    yOffset = 0;
    panel.style.transform = "";
  }

  header.addEventListener("mousedown", dragStart);
  document.addEventListener("mouseup", dragEnd);
  document.addEventListener("mousemove", drag);

  header.addEventListener("touchstart", dragStart, { passive: true });
  document.addEventListener("touchend", dragEnd);
  document.addEventListener("touchmove", drag, { passive: false });

  // Double-click header to reset position
  header.addEventListener("dblclick", (e) => {
    e.preventDefault();
    resetPosition();
    showToast("📌 Nav window position reset");
  });

  function dragStart(e) {
    if (e.target === closeBtn) {
      return;
    }
    const event = e.type === "touchstart" ? e.touches[0] : e;
    initialX = event.clientX - xOffset;
    initialY = event.clientY - yOffset;
    if (header.contains(e.target)) {
      isDragging = true;
    }
  }

  function dragEnd() {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }

  function drag(e) {
    if (isDragging) {
      if (e.cancelable && e.type === "touchmove") {
        e.preventDefault();
      }
      const event = e.type === "touchmove" ? e.touches[0] : e;
      const proposedX = event.clientX - initialX;
      const proposedY = event.clientY - initialY;

      // Clamp dragging so nav modal cannot be dragged off-screen
      const rect = panel.getBoundingClientRect();
      const minX = -rect.left + xOffset + 10;
      const maxX = (window.innerWidth || document.documentElement.clientWidth) - rect.right + xOffset - 10;
      const minY = -rect.top + yOffset + 10;
      const maxY = (window.innerHeight || document.documentElement.clientHeight) - rect.bottom + yOffset - 10;

      currentX = Math.min(Math.max(proposedX, minX), maxX);
      currentY = Math.min(Math.max(proposedY, minY), maxY);

      xOffset = currentX;
      yOffset = currentY;
      panel.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }
  }

  const yellowBtn = document.getElementById("floatingNavReset");
  const greenBtn  = document.getElementById("floatingNavExpand");

  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.style.display = "none";
      if (bubble) {
        bubble.hidden = false;
      }
    });
  }

  if (yellowBtn) {
    yellowBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      resetPosition();
      showToast("📌 Nav position reset");
    });
  }

  if (greenBtn) {
    let isCollapsed = false;
    const navBody = panel.querySelector(".floating-nav-body");
    greenBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      isCollapsed = !isCollapsed;
      if (navBody) {
        navBody.style.display = isCollapsed ? "none" : "";
      }
      showToast(isCollapsed ? "🔽 Nav collapsed" : "🔼 Nav expanded");
    });
  }

  if (bubble) {
    bubble.addEventListener("click", () => {
      resetPosition();
      panel.style.display = "";
      bubble.hidden = true;
    });
  }
}
