import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useBrowserRecognition — REAL microphone voice input via the browser's
 * Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 *
 * Recognized text is handed to the SAME conversation flow as typed text —
 * there is no separate "AI brain" for voice.
 */

export function browserRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(
    (w as Record<string, unknown>)["SpeechRecognition"] ||
      (w as Record<string, unknown>)["webkitSpeechRecognition"],
  );
}

export interface BrowserRecognitionController {
  supported: boolean;
  listening: boolean;
  error: string | null;
  clearError: () => void;
  start: (onResult: (text: string) => void) => void;
  stop: () => void;
}

export function useBrowserRecognition(): BrowserRecognitionController {
  const supported = useMemoShim(browserRecognitionSupported);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const onResultRef = useRef<((text: string) => void) | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(
    (onResult: (text: string) => void) => {
      if (!supported) {
        setError("Voice input is not available in this browser.");
        return;
      }
      const w = window as unknown as {
        SpeechRecognition?: new () => {
          start: () => void;
          stop: () => void;
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onresult: ((e: unknown) => void) | null;
          onerror: ((e: unknown) => void) | null;
          onend: (() => void) | null;
        };
        webkitSpeechRecognition?: new () => {
          start: () => void;
          stop: () => void;
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onresult: ((e: unknown) => void) | null;
          onerror: ((e: unknown) => void) | null;
          onend: (() => void) | null;
        };
      };
      const RecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!RecognitionCtor) {
        setError("Voice input is not available in this browser.");
        return;
      }

      try {
        const recognition = new RecognitionCtor();
        recognition.continuous = false;
        recognition.interimResults = false;
        // Best-effort default; Chrome is typically installed with a broader set.
        recognition.lang = "en-US";
        onResultRef.current = onResult;

        recognition.onresult = (event: unknown) => {
          const ev = event as {
            results?: Array<Array<{ transcript?: string }>>;
          };
          const transcript = ev.results?.[0]?.[0]?.transcript;
          if (transcript && transcript.trim()) {
            onResultRef.current?.(transcript.trim());
          }
        };

        recognition.onerror = (event: unknown) => {
          const code = (event as { error?: string })?.error ?? "unknown";
          if (code === "not-allowed" || code === "service-not-allowed") {
            setError("Microphone permission was denied.");
          } else if (code === "no-speech") {
            setError("No speech detected. Please try again.");
          } else if (code === "audio-capture") {
            setError("No microphone found on this device.");
          } else {
            setError(`Voice input error: ${code}`);
          }
          setListening(false);
        };

        recognition.onend = () => setListening(false);

        recognitionRef.current = recognition;
        setError(null);
        recognition.start();
        setListening(true);
      } catch {
        setError("Could not start voice input.");
        setListening(false);
      }
    },
    [supported],
  );

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  return { supported, listening, error, clearError, start, stop };
}

/** Tiny local shim to avoid importing React's useMemo just for a boolean. */
function useMemoShim<T>(factory: () => T): T {
  const ref = useRef<T | null>(null);
  if (ref.current === null) {
    ref.current = factory();
  }
  return ref.current;
}
