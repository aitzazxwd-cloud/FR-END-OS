import { memo, useEffect, useRef, useState } from "react";
import type { MaryamExpression } from "../lib/maryamExpressions";

import baseImg from "../assets/maryam/base.jpg";
import blinkImg from "../assets/maryam/blink.jpg";
import talkingImg from "../assets/maryam/talking.jpg";
import happyImg from "../assets/maryam/happy.jpg";
import warmImg from "../assets/maryam/warm.jpg";
import curiousImg from "../assets/maryam/curious.jpg";
import thinkingImg from "../assets/maryam/thinking.jpg";
import concernedImg from "../assets/maryam/concerned.jpg";
import surprisedImg from "../assets/maryam/surprised.jpg";
import calmImg from "../assets/maryam/calm.jpg";

const EXPRESSION_IMAGES: Record<MaryamExpression, string> = {
  neutral: baseImg,
  warm: warmImg,
  happy: happyImg,
  curious: curiousImg,
  thinking: thinkingImg,
  concerned: concernedImg,
  surprised: surprisedImg,
  calm: calmImg,
};

interface MaryamAvatarProps {
  expression: MaryamExpression;
  speaking: boolean;
  listening: boolean;
  thinking: boolean;
  userTyping: boolean;
  uiMode?: "full" | "mini";
  background?: string;
  zoom?: number;
  framing?: "full" | "half";
}

/**
 * MaryamAvatar — an original, animated anime-style AI companion.
 *
 * Everything here is driven by real application state:
 *  - `speaking`  → talking frame + waveform (only while actually speaking)
 *  - `listening` → attentive pose + pulse ring (only while mic is live)
 *  - `thinking`  → thoughtful pose + "…" cue (only while the AI is thinking)
 *  - expression  → context-selected expression image
 *
 * Idle life (blinking, breathing, sway) runs continuously so she feels
 * present even when nothing else is happening.
 */
export const MaryamAvatar = memo(function MaryamAvatar({
  expression,
  speaking,
  listening,
  thinking,
  userTyping,
  uiMode = "full",
  background,
  zoom = 1.1,
  framing = "full",
}: MaryamAvatarProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLImageElement>(null); // blink / talking layer
  const rafRef = useRef<number>(0);

  const stateRef = useRef({ expression, speaking, listening, thinking, userTyping });
  stateRef.current = { expression, speaking, listening, thinking, userTyping };

  // Blink + talking flicker are driven imperatively (no re-renders).
  const blinkUntilRef = useRef(0);
  const nextBlinkAtRef = useRef(2000 + Math.random() * 2000);
  const talkTickRef = useRef(0);
  const talkOnRef = useRef(false);

  const [imageSrc, setImageSrc] = useState(EXPRESSION_IMAGES[expression]);
  const [showThinkingCue, setShowThinkingCue] = useState(false);
  const prevExpressionRef = useRef<MaryamExpression>(expression);

  // Swap the expression image with a soft crossfade.
  useEffect(() => {
    if (expression === prevExpressionRef.current) return;
    prevExpressionRef.current = expression;
    const next = EXPRESSION_IMAGES[expression] ?? baseImg;
    setImageSrc((prev) => {
      if (prev === next) return prev;
      return next;
    });
  }, [expression]);

  // Thinking "…" cue (only while really thinking).
  useEffect(() => {
    if (!thinking) {
      setShowThinkingCue(false);
      return;
    }
    setShowThinkingCue(true);
    const id = window.setTimeout(() => setShowThinkingCue(false), 2600);
    return () => window.clearTimeout(id);
  }, [thinking]);

  // Master animation loop: breathing, sway, head motion, blink, talking.
  useEffect(() => {
    const loop = (now: number) => {
      const s = stateRef.current;
      const t = now / 1000;

      // Breathing + idle sway on the wrapper.
      const breath = Math.sin(t * 1.15) * 0.006;
      const sway = Math.sin(t * 0.42 + 1.7) * 0.9;
      const bob = Math.sin(t * 0.9) * 3;
      const speakBob = s.speaking ? Math.sin(t * 9.5) * 2.6 : 0;
      const lean = s.userTyping ? 0.6 : 0; // subtle lean-in while user types
      const listener = s.listening ? Math.sin(t * 1.8) * 0.5 : 0;

      if (wrapperRef.current) {
        wrapperRef.current.style.transform =
          `translateY(${bob + speakBob - lean}px) rotate(${sway + listener}deg) ` +
          `scale(${1 + breath})`;
      }

      // Blinking.
      if (now > nextBlinkAtRef.current && !s.speaking) {
        blinkUntilRef.current = now + 150;
        nextBlinkAtRef.current = now + 2400 + Math.random() * 3200;
      }
      const blinking = now < blinkUntilRef.current;

      // Talking flicker (only while speaking).
      if (s.speaking) {
        if (now - talkTickRef.current > 120) {
          talkTickRef.current = now;
          talkOnRef.current = !talkOnRef.current;
        }
      } else {
        talkOnRef.current = false;
      }

      if (overlayRef.current) {
        const target = blinking ? blinkImg : talkOnRef.current ? talkingImg : "";
        if (target !== overlayRef.current.dataset.src) {
          overlayRef.current.dataset.src = target;
          overlayRef.current.src = target;
        }
        overlayRef.current.style.opacity = target ? "1" : "0";
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const mini = uiMode === "mini";

  // Zoom: full = show whole half-body, half = frame the face closer.
  const coverScale = framing === "half" ? zoom * 1.55 : zoom;
  const objectPosition = framing === "half" ? "50% 26%" : "50% 38%";

  return (
    <div
      className={`relative flex items-end justify-center overflow-hidden ${
        mini ? "" : "h-full w-full"
      }`}
      style={{
        background: background && background !== "transparent" ? background : undefined,
      }}
    >
      {/* Ambient gradient wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 8%, rgba(99,102,241,0.16) 0%, rgba(139,92,246,0.08) 38%, rgba(15,23,42,0) 72%)",
        }}
      />

      {/* Floating ambient particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="maryam-particle"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              animationDelay: p.delay,
              animationDuration: p.duration,
            }}
          />
        ))}
      </div>

      {/* Character */}
      <div
        ref={wrapperRef}
        className={`relative will-change-transform ${mini ? "h-full w-full" : "h-full w-full"}`}
        style={{ perspective: 900 }}
      >
        <img
          src={imageSrc}
          alt="Maryam — your AI companion"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-300"
          style={{
            transform: `scale(${coverScale})`,
            objectPosition,
            opacity: listening ? 0.94 : 1,
          }}
        />
        {/* Blink / talking overlay — same composition, opaque, crossfaded */}
        <img
          ref={overlayRef}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover"
          style={{
            transform: `scale(${coverScale})`,
            objectPosition,
            opacity: 0,
          }}
        />

        {/* Listening pulse ring */}
        {listening && (
          <div className="maryam-listening-ring pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
        )}

        {/* Thinking cue */}
        {showThinkingCue && !speaking && (
          <div className="absolute bottom-[14%] left-1/2 -translate-x-1/2 rounded-full border border-indigo-200/50 bg-white/70 px-4 py-1.5 text-[12px] font-medium tracking-wide text-indigo-700 shadow-lg backdrop-blur-md">
            <span className="thinking-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
            <span className="ml-2">thinking</span>
          </div>
        )}
      </div>

      {/* Speaking waveform — only while speech is actually playing */}
      {speaking && !mini && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-end gap-1 rounded-2xl border border-indigo-200/60 bg-white/75 px-4 py-2.5 shadow-[0_8px_32px_rgba(79,70,229,0.18)] backdrop-blur-md">
          <span className="speaking-dot speaking-dot-1" />
          <span className="speaking-dot speaking-dot-2" />
          <span className="speaking-dot speaking-dot-3" />
          <span className="ml-2 text-[12px] font-semibold uppercase tracking-widest text-indigo-600">
            Speaking
          </span>
        </div>
      )}

      {/* Listening indicator */}
      {listening && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-rose-200/60 bg-white/80 px-4 py-2.5 shadow-[0_8px_32px_rgba(225,29,72,0.15)] backdrop-blur-md">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
          </span>
          <span className="text-[12px] font-semibold uppercase tracking-widest text-rose-500">
            Listening
          </span>
        </div>
      )}
    </div>
  );
});

const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  left: `${6 + ((i * 7) % 88)}%`,
  top: `${8 + ((i * 13) % 70)}%`,
  size: `${3 + (i % 3)}px`,
  delay: `${-i * 1.7}s`,
  duration: `${9 + (i % 6)}s`,
}));
