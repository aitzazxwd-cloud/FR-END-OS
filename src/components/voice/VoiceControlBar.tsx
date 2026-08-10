import { memo } from "react";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

interface VoiceControlBarProps {
  state: VoiceState;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onStopSpeaking: () => void;
  voiceName?: string | null;
  error?: string | null;
  compact?: boolean;
}

const STATE_META: Record<VoiceState, { label: string; className: string }> = {
  idle: {
    label: "Idle",
    className: "border-slate-200 bg-white/85 text-slate-500",
  },
  listening: {
    label: "Listening",
    className:
      "voice-state-pill-listening border-rose-300 bg-rose-50/90 text-rose-600",
  },
  thinking: {
    label: "Thinking",
    className:
      "border-amber-200 bg-amber-50/90 text-amber-600",
  },
  speaking: {
    label: "Speaking",
    className:
      "voice-state-pill-speaking border-indigo-300 bg-indigo-50/90 text-indigo-600",
  },
};

/**
 * VoiceControlBar — real voice controls + honest state display.
 *
 * The state pill only shows SPEAKING while the browser speech API (or the
 * desktop TTS engine) is actually producing audio, LISTENING while the
 * microphone is actually capturing, THINKING while the AI is processing,
 * and IDLE otherwise.
 */
export const VoiceControlBar = memo(function VoiceControlBar({
  state,
  voiceEnabled,
  onToggleVoice,
  onStopSpeaking,
  voiceName,
  error,
  compact = false,
}: VoiceControlBarProps) {
  const meta = STATE_META[state] ?? STATE_META.idle;
  const showStop = state === "speaking";

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 ${
        compact ? "flex-wrap" : ""
      }`}
    >
      {/* State pill */}
      <div
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm backdrop-blur-md ${meta.className}`}
        title="Live voice state"
      >
        {state === "speaking" && (
          <span className="flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
            </span>
          </span>
        )}
        {state === "listening" && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
        )}
        {state === "thinking" && (
          <span className="thinking-dots text-[12px] leading-none">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        )}
        <span className="text-[11px] font-bold uppercase tracking-widest">
          {meta.label}
        </span>
      </div>

      {/* Voice on/off */}
      <button
        type="button"
        onClick={onToggleVoice}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md transition-all ${
          voiceEnabled
            ? "border-emerald-300 bg-emerald-50/90 text-emerald-700 hover:bg-emerald-100/90"
            : "border-slate-300 bg-white/85 text-slate-500 hover:bg-slate-100"
        }`}
        title={voiceEnabled ? "Turn voice off" : "Turn voice on"}
      >
        {voiceEnabled ? (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12a7 7 0 0114 0M12 5v14m-5-2.5A7.5 7.5 0 0117 16.5" />
            <path strokeLinecap="round" d="M3 3l18 18" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12a7 7 0 0114 0M12 5v14m-5-2.5A7.5 7.5 0 0117 16.5" />
          </svg>
        )}
        {voiceEnabled ? "Voice on" : "Voice off"}
      </button>

      {/* Stop speaking */}
      {showStop && (
        <button
          type="button"
          onClick={onStopSpeaking}
          className="flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-600 shadow-sm backdrop-blur-md transition-all hover:bg-rose-100"
          title="Stop speaking"
        >
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Stop
        </button>
      )}

      {/* Voice error — honest failure feedback */}
      {error && (
        <div
          className="max-w-[220px] rounded-full border border-red-300 bg-red-50/95 px-3 py-1.5 text-[11px] font-semibold text-red-600 shadow-sm backdrop-blur-md"
          title={error}
        >
          <span className="mr-1">⚠</span>
          {error.length > 48 ? error.slice(0, 48) + "…" : error}
        </div>
      )}

      {voiceEnabled && voiceName && !compact && (
        <div className="hidden max-w-[180px] truncate rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[10px] font-medium text-slate-400 backdrop-blur-md sm:block" title={voiceName}>
          {voiceName}
        </div>
      )}
    </div>
  );
});
