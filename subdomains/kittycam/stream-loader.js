import STREAM_CONFIG from "./stream-config.js";

const MAIN_SITE = "https://chrispivonka.com";
const HLS_JS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";

function rewriteNavLinks() {
  const header = document.getElementById("header-placeholder");
  if (!header) return;

  const observer = new MutationObserver(() => {
    const links = header.querySelectorAll("a.nav-link");
    links.forEach((link) => {
      const href = link.getAttribute("href");
      if (href && !href.startsWith("http") && !href.startsWith("#")) {
        link.setAttribute("href", `${MAIN_SITE}/${href}`);
      }
    });
    if (links.length > 0) observer.disconnect();
  });

  observer.observe(header, { childList: true, subtree: true });
}

function updateBadgeStatus(isLive = false) {
  const badge = document.querySelector(".live-badge");
  if (!badge) return;

  if (isLive) {
    badge.textContent = "LIVE";
    badge.style.background = "rgba(63, 185, 80, 0.15)";
    badge.style.color = "var(--green)";
    badge.style.borderColor = "rgba(63, 185, 80, 0.3)";
  } else {
    badge.textContent = "OFFLINE";
    badge.style.background = "rgba(248, 81, 73, 0.15)";
    badge.style.color = "var(--red)";
    badge.style.borderColor = "rgba(248, 81, 73, 0.3)";
  }
}

function createYouTubeEmbed(videoId, title) {
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
  iframe.title = title;
  iframe.setAttribute("frameborder", "0");
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  iframe.allowFullscreen = true;
  iframe.loading = "lazy";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.position = "absolute";
  iframe.style.top = "0";
  iframe.style.left = "0";
  return iframe;
}

function createHlsEmbed(streamUrl) {
  const video = document.createElement("video");
  video.controls = true;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.position = "absolute";
  video.style.top = "0";
  video.style.left = "0";
  video.style.objectFit = "contain";
  video.style.backgroundColor = "#000";

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = streamUrl;
    updateBadgeStatus(true);
  } else {
    const script = document.createElement("script");
    script.src = HLS_JS_CDN;
    script.onload = () => {
      if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        updateBadgeStatus(true);
        hls.on(window.Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            showOfflineMessage();
          }
        });
      } else {
        showOfflineMessage();
      }
    };
    script.onerror = () => showOfflineMessage();
    document.head.appendChild(script);
  }

  return video;
}

function createIframeEmbed(url, title) {
  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.title = title;
  iframe.setAttribute("frameborder", "0");
  iframe.allow = "autoplay; fullscreen";
  iframe.allowFullscreen = true;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.position = "absolute";
  iframe.style.top = "0";
  iframe.style.left = "0";
  updateBadgeStatus(true);
  return iframe;
}

function showOfflineMessage() {
  const container = document.getElementById("stream-container");
  if (!container) return;

  updateBadgeStatus(false);

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; padding: 2rem; text-align: center; box-sizing: border-box;">
      <i class="bi bi-camera-video-off" style="font-size: 3rem; color: var(--cyan); margin-bottom: 0.75rem; display: block;"></i>
      <p style="margin: 0 0 0.5rem 0; font-size: 0.95rem; color: var(--text); font-weight: 500; font-family: var(--mono); text-align: center;">${STREAM_CONFIG.offlineMessage || "The stream is currently offline. Check back later!"}</p>
      <span style="font-size: 0.72rem; color: var(--text-dim); font-family: var(--mono);">$ status // STANDBY (0 active streams)</span>
    </div>
  `;
}

async function fetchStreamUrl() {
  try {
    const res = await fetch("/stream.json");
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

async function loadStream() {
  const container = document.getElementById("stream-container");
  if (!container) return;

  const { type, title } = STREAM_CONFIG;
  const url = await fetchStreamUrl();

  if (!url) {
    showOfflineMessage();
    return;
  }

  container.innerHTML = "";

  let embed;
  switch (type) {
    case "youtube":
      embed = createYouTubeEmbed(url, title);
      updateBadgeStatus(true);
      break;
    case "hls":
      embed = createHlsEmbed(url);
      break;
    case "iframe":
      embed = createIframeEmbed(url, title);
      break;
    default:
      showOfflineMessage();
      return;
  }

  container.appendChild(embed);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    rewriteNavLinks();
    loadStream();
  });
} else {
  rewriteNavLinks();
  loadStream();
}
