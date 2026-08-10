import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * useBrowserSpeech — REAL text-to-speech via the browser's Web Speech API
 * (SpeechSynthesis). No fake state: `speaking` only becomes true while an
 * utterance is actually playing, and returns to false when it ends/errors.
 */

export function browserSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "speechSynthesis" in window;
}

/**
 * Prefer a natural female English voice when the browser provides one.
 * We never claim a specific voice identity — we simply prefer names that
 * browsers commonly ship as female English voices, and fall back gracefully.
 */
const FEMALE_VOICE_HINTS = [
  "google us english",
  "microsoft aria",
  "microsoft jenny",
  "microsoft zira",
  "microsoft libby",
  "samantha",
  "google uk english female",
  "google español de estados unidos",
  "karen",
  "moira",
  "tessa",
  "veena",
  "allison",
  "ava",
  "emma",
  "victoria",
  "susan",
  "kate",
  "serena",
  "female",
];

export function pickNaturalVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  // Prefer English voices (Maryam's default language), then anything else.
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = en.length > 0 ? en : voices;

  for (const hint of FEMALE_VOICE_HINTS) {
    const match = pool.find((v) => v.name.toLowerCase().includes(hint));
    if (match) return match;
  }

  return pool[0] ?? null;
}

export interface BrowserSpeechController {
  supported: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  selectedVoiceURI: string | null;
  setSelectedVoiceURI: (uri: string | null) => void;
  speaking: boolean;
  error: string | null;
  clearError: () => void;
  speak: (
    text: string,
    opts?: { rate?: number; pitch?: number; onDone?: () => void },
  ) => void;
  stop: () => void;
}

export function useBrowserSpeech(): BrowserSpeechController {
  const supported = useMemo(browserSpeechSupported, []);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const refreshVoices = useCallback(() => {
    if (!supported) return;
    const list = window.speechSynthesis.getVoices();
    if (list.length > 0) setVoices(list);
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    refreshVoices();
    // Chrome loads voices asynchronously; Safari fires voiceschanged later.
    const synth = window.speechSynthesis;
    synth.addEventListener?.("voiceschanged", refreshVoices);
    return () => synth.removeEventListener?.("voiceschanged", refreshVoices);
  }, [supported, refreshVoices]);

  const selectedVoice = useMemo(() => {
    if (selectedVoiceURI) {
      const found = voices.find((v) => v.voiceURI === selectedVoiceURI);
      if (found) return found;
    }
    return pickNaturalVoice(voices);
  }, [voices, selectedVoiceURI]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setSpeaking(false);
  }, [supported]);

  const clearError = useCallback(() => setError(null), []);

  const speak = useCallback(
    (
      text: string,
      opts?: { rate?: number; pitch?: number; onDone?: () => void },
    ) => {
      if (!supported) {
        setError("Speech synthesis is not supported in this browser.");
        opts?.onDone?.();
        return;
      }
      const clean = text
        .replace(/<<\/?[^>]*>>\s*/g, "")
        .replace(/\[(?:expression:\s*)?[a-zA-Z0-9_\-]+\]\s*/g, "")
        .trim();
      if (!clean) {
        opts?.onDone?.();
        return;
      }

      // Cut anything currently playing so the new utterance starts cleanly.
      window.speechSynthesis.cancel();
      setError(null);

      const utterance = new SpeechSynthesisUtterance(clean);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = "en-US";
      }
      utterance.rate = opts?.rate ?? 1.0;
      utterance.pitch = opts?.pitch ?? 1.05;
      utterance.volume = 1;

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => {
        setSpeaking(false);
        utteranceRef.current = null;
        opts?.onDone?.();
      };
      utterance.onerror = (event) => {
        // "canceled"/"interrupted" happen when stop() is called — not errors.
        if (event.error === "canceled" || event.error === "interrupted") {
          setSpeaking(false);
          return;
        }
        setError(`Voice error: ${event.error}`);
        setSpeaking(false);
        utteranceRef.current = null;
        opts?.onDone?.();
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [supported, selectedVoice],
  );

  return {
    supported,
    voices,
    selectedVoice,
    selectedVoiceURI,
    setSelectedVoiceURI,
    speaking,
    error,
    clearError,
    speak,
    stop,
  };
}
