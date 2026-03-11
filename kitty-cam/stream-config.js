/**
 * Stream Configuration for Kitty Cam
 *
 * Change the settings below to configure the live stream source.
 * No other files need to be modified when switching stream providers.
 *
 * Supported types:
 *
 *   "youtube" - YouTube Live (unlisted). Set url to the video ID.
 *               Example: url: "dQw4w9WgXcQ"
 *
 *   "hls"     - HLS stream (.m3u8). For self-hosted streams via
 *               go2rtc, MediaMTX, Frigate, etc.
 *               Example: url: "https://your-server/stream.m3u8"
 *
 *   "iframe"  - Generic iframe embed. For go2rtc WebRTC player,
 *               Frigate UI, or any other web-based player.
 *               Example: url: "https://your-server/webrtc.html"
 */
const STREAM_CONFIG = {
  type: "youtube",
  url: "YOUR_VIDEO_ID",
  title: "Kitty Cam Live Stream",
  offlineMessage: "The stream is currently offline. Check back later!",
};

export default STREAM_CONFIG;
