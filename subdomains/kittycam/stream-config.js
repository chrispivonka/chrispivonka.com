/**
 * Stream Configuration for Kitty Cam
 *
 * The video ID is loaded dynamically from /stream.json at page load —
 * update it instantly with the go-live.sh script, no redeploy needed.
 *
 * Supported types:
 *
 *   "youtube" - YouTube Live. Video ID is fetched from /stream.json.
 *
 *   "hls"     - HLS stream (.m3u8). For self-hosted streams via
 *               go2rtc, MediaMTX, Frigate, etc.
 *               Set url in /stream.json: "https://your-server/stream.m3u8"
 *
 *   "iframe"  - Generic iframe embed. For go2rtc WebRTC player,
 *               Frigate UI, or any other web-based player.
 *               Set url in /stream.json: "https://your-server/webrtc.html"
 */
const STREAM_CONFIG = {
  type: "youtube",
  title: "Kitty Cam Live Stream",
  offlineMessage: "The stream is currently offline. Check back later!",
};

export default STREAM_CONFIG;
