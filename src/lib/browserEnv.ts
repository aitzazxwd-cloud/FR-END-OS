/**
 * Environment helpers — detect whether the app is running inside the Tauri
 * shell (Rust backend available) or in a plain browser (preview / demo mode).
 *
 * In a plain browser there is no Rust backend, so chat (ACP agents), backend
 * TTS and whisper transcription are unavailable. Browser-native Web Speech
 * APIs (speech synthesis + speech recognition) ARE available and are used
 * there for real voice.
 */

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__,
  );
}

/** True when running in a plain browser (no Tauri backend). */
export function isBrowserOnly(): boolean {
  return !isTauri();
}
