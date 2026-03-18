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

function createYouTubeEmbed(videoId, title) {
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
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
  } else {
    const script = document.createElement("script");
    script.src = HLS_JS_CDN;
    script.onload = () => {
      if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
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
  return iframe;
}

function showOfflineMessage() {
  const container = document.getElementById("stream-container");
  if (!container) return;
  container.innerHTML = "";
  const msg = document.createElement("div");
  msg.className =
    "d-flex align-items-center justify-content-center bg-dark text-white";
  msg.style.position = "absolute";
  msg.style.inset = "0";
  msg.innerHTML = `
    <div class="text-center p-4">
      <i class="bi bi-camera-video-off" style="font-size: 3rem;"></i>
      <p class="mt-3 mb-0">${STREAM_CONFIG.offlineMessage}</p>
    </div>
  `;
  container.appendChild(msg);
}

function loadStream() {
  const container = document.getElementById("stream-container");
  if (!container) return;

  const { type, url, title } = STREAM_CONFIG;

  if (!url || url === "YOUR_VIDEO_ID") {
    showOfflineMessage();
    return;
  }

  container.innerHTML = "";

  let embed;
  switch (type) {
    case "youtube":
      embed = createYouTubeEmbed(url, title);
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
