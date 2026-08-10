import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { ChatPanel } from "./components/ChatPanel";
import { HistoryDrawer } from "./components/chat/HistoryDrawer";
import { StageCornerToolbar } from "./components/chat/StageCornerToolbar";
import { FloatingChatInput } from "./components/chat/FloatingChatInput";
import { AddCharacterModal } from "./components/AddCharacterModal";
import { CharacterSelect } from "./components/CharacterSelect";
import { Onboarding } from "./components/Onboarding";
import { Settings } from "./components/Settings";
import { MiniWidget } from "./components/MiniWidget";
import { MaryamAvatar } from "./components/MaryamAvatar";
import { VoiceControlBar } from "./components/voice/VoiceControlBar";
import type { VoiceState } from "./components/voice/VoiceControlBar";
import { useChat, cleanCompanionDisplayText } from "./hooks/useChat";
import { useAudioQueue } from "./hooks/useAudioQueue";
import { useVoice } from "./hooks/useVoice";
import { useWindow } from "./hooks/useWindow";
import { useBrowserSpeech, browserSpeechSupported } from "./hooks/useBrowserSpeech";
import {
  useBrowserRecognition,
  browserRecognitionSupported,
} from "./hooks/useBrowserRecognition";
import { isTauri } from "./lib/browserEnv";
import {
  normalizeMaryamExpression,
  guessExpressionForUserText,
  guessExpressionForAssistantText,
} from "./lib/maryamExpressions";
import {
  getConfig,
  listCharacters,
  listModels,
  getExpressions,
  getModelExpressions,
  getChatHistory,
  clearChat,
  resolveAssetUrl,
} from "./API/tauri";
import type { Character, ModelInfo } from "./types";

/** Built-in Maryam companion used in browser-only (preview) mode. */
const MARYAM_BUILTIN: Character = {
  id: "maryam",
  name: "Maryam",
  live2d_model: "builtin-maryam",
  voice: "browser",
  default_emotion: "neutral",
  source_type: "directory",
};

/** Synthetic model entry so Maryam's avatar shows in pickers without a backend. */
const MARYAM_MODEL: ModelInfo = {
  id: "builtin-maryam",
  type: "maryam",
  model_file: "",
  path: "",
  mapping: null,
  animations: [],
};

const MARYAM_WELCOME =
  "Hi Aitzaz, I'm Maryam. I'm here with you. What would you like to talk about? 😊";

const Live2DCanvas = lazy(() =>
  import("./components/Live2DCanvas").then((m) => ({ default: m.Live2DCanvas }))
);
const VRMCanvas = lazy(() =>
  import("./components/VRMCanvas").then((m) => ({ default: m.VRMCanvas }))
);


function App() {
  const { isMiniMode, miniCharacterId, toggleMini } = useWindow();

  // Refs for global shortcut callbacks (so they always see latest state)
  const selectedCharIdRef = useRef("");

  // Trigger to open mini composer from global shortcut
  const [miniComposerTrigger, setMiniComposerTrigger] = useState(0);
  // Ref for focus chat input in full mode
  const fullChatInputRef = useRef<HTMLInputElement>(null);
  // Ref for mic toggle
  const handleMicToggleRef = useRef<() => void>(() => {});

  // Global shortcuts — registered once from main window, work in all modes
  // Actions are dispatched via Tauri events so both windows can respond
  useEffect(() => {
    if (isMiniMode) return; // only main window registers shortcuts

    const TOGGLE = "CommandOrControl+Shift+E";
    const TEXT = "CommandOrControl+Shift+Space";
    const MIC = "CommandOrControl+Shift+M";
    const registered: string[] = [];

    const setup = async () => {
      const broadcast = (event: string) => invoke("broadcast_event", { event }).catch(() => {});

      try {
        await register(TOGGLE, (event) => {
          if (event.state === "Pressed") {
            toggleMini(selectedCharIdRef.current || undefined);
          }
        });
        registered.push(TOGGLE);
      } catch (err) {
        console.error("Failed to register toggle shortcut:", err);
      }

      try {
        await register(TEXT, (event) => {
          if (event.state === "Pressed") {
            broadcast("shortcut:text");
          }
        });
        registered.push(TEXT);
      } catch (err) {
        console.error("Failed to register text shortcut:", err);
      }

      try {
        await register(MIC, (event) => {
          if (event.state === "Pressed") {
            broadcast("shortcut:mic");
          }
        });
        registered.push(MIC);
      } catch (err) {
        console.error("Failed to register mic shortcut:", err);
      }
    };

    void setup();
    return () => {
      for (const s of registered) {
        unregister(s).catch(() => {});
      }
    };
  }, [isMiniMode, toggleMini]);

  // Listen for shortcut events (both windows listen, only the active one acts)
  useEffect(() => {
    const unlistenText = listen("shortcut:text", () => {
      if (isMiniMode) {
        setMiniComposerTrigger((n) => n + 1);
      } else {
        fullChatInputRef.current?.focus();
      }
    });
    const unlistenMic = listen("shortcut:mic", () => {
      handleMicToggleRef.current();
    });
    return () => {
      unlistenText.then((fn) => fn());
      unlistenMic.then((fn) => fn());
    };
  }, [isMiniMode]);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedCharId, setSelectedCharId] = useState("");
  selectedCharIdRef.current = selectedCharId;
  const [charSelectOpen, setCharSelectOpen] = useState(false);
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [currentExpression, setCurrentExpression] = useState("neutral");
  const [background, setBackground] = useState("transparent");
  const [zoom, setZoom] = useState(1.1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expressionsConfigured, setExpressionsConfigured] = useState<boolean | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [userTyping, setUserTyping] = useState(false);

  // ── Maryam voice (browser Web Speech API — real, no fake states) ──────
  const isBrowserOnly = !isTauri();
  const browserSpeech = useBrowserSpeech();
  const browserRecognition = useBrowserRecognition();
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const voiceEnabledRef = useRef(true);
  voiceEnabledRef.current = voiceEnabled;
  const browserSpeechRef = useRef(browserSpeech);
  browserSpeechRef.current = browserSpeech;
  // Which TTS engine should speak AI sentences? "browser" = SpeechSynthesis.
  const ttsProviderRef = useRef<string>("browser");
  useEffect(() => {
    if (!isTauri()) {
      ttsProviderRef.current = "browser";
      return;
    }
    getConfig()
      .then((cfg) => {
        const c = cfg as { tts?: { provider?: string } };
        ttsProviderRef.current = c?.tts?.provider ?? "browser";
      })
      .catch(() => {
        ttsProviderRef.current = "browser";
      });
  }, []);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const previewNoticeTimeoutRef = useRef<number | null>(null);

  const {
    messages,
    setMessages,
    timeline,
    isStreaming,
    streamingText,
    send,
    setOnSentence,
    setOnAudio,
    setOnAudioFailed,
    setOnDone,
    setOnError,
    toolCalls,
    handleConfirm,
  } = useChat();
  const { listening, startListening, stopListening } = useVoice();
  const {
    speaking,
    speakingSentence,
    speechSessionActive,
    beginRequest,
    addSentence,
    addAudio,
    failAudio,
    markTextDone,
    failRequest,
    clearQueue,
    getAudioLevels,
    setOnExpressionChange,
    setNeutralExpression,
  } = useAudioQueue();

  const selectedCharRef = useRef<Character | undefined>(undefined);

  const loadHistory = useCallback(
    async (characterId: string) => {
      try {
        const history = (await getChatHistory(characterId)) as Array<{
          role: "user" | "assistant";
          content?: string;
          text?: string;
          expression?: string;
        }>;
        setMessages(
          history.map((m) => ({
            role: m.role,
            content: m.content ?? m.text ?? "",
            expression: m.expression,
          }))
        );
      } catch (err) {
        console.error("History load error:", err);
      }
    },
    [setMessages]
  );

  const clearMessages = useCallback(
    async (characterId?: string) => {
      if (characterId) {
        await clearChat(characterId).catch(console.error);
      }
      setMessages([]);
    },
    [setMessages]
  );

  const refreshCharacters = useCallback(
    async (preferredId?: string) => {
      try {
        const data = await listCharacters();
        const chars = data as Character[];
        setCharacters(chars);

        if (preferredId && chars.some((char) => char.id === preferredId)) {
          setSelectedCharId(preferredId);
          return;
        }

        if (!selectedCharId && chars.length > 0) {
          setSelectedCharId(chars[0].id);
        } else if (selectedCharId && !chars.some((char) => char.id === selectedCharId) && chars.length > 0) {
          setSelectedCharId(chars[0].id);
        }
      } catch (err) {
        console.error("Character list load error:", err);
        // Browser-only mode: fall back to the built-in Maryam companion.
        if (!isTauri()) {
          setCharacters([MARYAM_BUILTIN]);
          if (!preferredId || preferredId === "maryam") {
            setSelectedCharId("maryam");
          }
        }
      }
    },
    [selectedCharId]
  );

  // Wire audio queue events to model
  useEffect(() => {
    setOnExpressionChange((expr: string) => {
      setCurrentExpression(expr);
    });
  }, [setOnExpressionChange]);

  // Wire chat sentence events to audio queue + browser voice
  useEffect(() => {
    setOnSentence((payload) => {
      addSentence(payload.request_id, payload);
      // Browser voice: speak the sentence with SpeechSynthesis (real TTS).
      if (voiceEnabledRef.current && browserSpeechRef.current.supported) {
        browserSpeechRef.current.speak(payload.text, { rate: 1.0 });
      }
    });
    setOnAudio((payload) => {
      addAudio(payload.request_id, payload.index, payload.data);
    });
    setOnAudioFailed((payload) => {
      failAudio(payload.request_id, payload.index);
    });
    setOnDone((payload) => {
      markTextDone(payload.request_id);
    });
    setOnError((requestId) => {
      failRequest(requestId);
    });
  }, [
    setOnSentence,
    setOnAudio,
    setOnAudioFailed,
    setOnDone,
    setOnError,
    addSentence,
    addAudio,
    failAudio,
    markTextDone,
    failRequest,
  ]);

  useEffect(() => {
    refreshCharacters();
    listModels()
      .then((data) => {
        const list = data as ModelInfo[];
        if (!isTauri() && !list.some((m) => m.id === MARYAM_MODEL.id)) {
          setModels([MARYAM_MODEL, ...list]);
        } else {
          setModels(list);
        }
      })
      .catch(() => {
        if (!isTauri()) setModels([MARYAM_MODEL]);
      });
  }, [refreshCharacters]);

  useEffect(() => {
    getConfig()
      .then((data) => {
        console.log("[App] config loaded:", JSON.stringify(data));
        const cfg = data as Record<string, unknown>;
        const complete = !!(cfg.onboarding_complete ?? cfg.onboardingComplete ?? false);
        console.log("[App] onboardingComplete =", complete);
        setOnboardingComplete(complete);
        const activeChar = ((cfg.active_character ?? cfg.activeCharacter ?? "") as string);
        if (miniCharacterId) {
          setSelectedCharId(miniCharacterId);
        } else if (activeChar) {
          setSelectedCharId(activeChar);
        }
      })
      .catch((err) => {
        console.error("[App] config load error:", err);
        setOnboardingComplete(false);
      });
  }, [miniCharacterId]);

  const selectedChar = useMemo(
    () => characters.find((c) => c.id === selectedCharId),
    [characters, selectedCharId]
  );
  selectedCharRef.current = selectedChar;

  const selectedModel = useMemo(() => {
    if (!selectedChar?.live2d_model) return null;
    return models.find((m) => m.id === selectedChar.live2d_model) ?? null;
  }, [selectedChar, models]);

  const [resolvedModelPath, setResolvedModelPath] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedModel?.path || selectedModel.type === "maryam") {
      setResolvedModelPath(null);
      return;
    }

    let cancelled = false;
    resolveAssetUrl(selectedModel.path)
      .then((url) => {
        if (!cancelled) {
          setResolvedModelPath(url);
        }
      })
      .catch((err) => {
        console.error("[App] Failed to resolve model asset URL:", err);
        if (!cancelled) {
          setResolvedModelPath(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedModel?.path]);

  const modelPath = resolvedModelPath;
  const modelType = selectedModel?.type === "vrm" ? "vrm" : selectedModel?.type === "maryam" ? "maryam" : "live2d";
  const modelMapping = selectedModel?.mapping ?? null;

  // Match chat backend: expression files are keyed by character.live2d_model.
  const expressionModelId = selectedChar?.live2d_model || selectedModel?.id || null;

  const refreshExpressionConfiguration = useCallback(async () => {
    if (!expressionModelId) {
      setExpressionsConfigured(true);
      return;
    }

    try {
      const [modelExpressions, mapping] = await Promise.all([
        getModelExpressions(expressionModelId),
        getExpressions(expressionModelId),
      ]);

      const hasModelExpressions = modelExpressions.length > 0;
      const hasMapping = Object.values(mapping).some((value) => value.trim().length > 0);

      setExpressionsConfigured(!hasModelExpressions || hasMapping);
      if (mapping["neutral"]) {
        setNeutralExpression(mapping["neutral"]);
      }
    } catch (err) {
      console.error("Expression configuration load error:", err);
      setExpressionsConfigured(true);
    }
  }, [expressionModelId, setNeutralExpression]);

  // Check if expression mapping is configured for current model
  useEffect(() => {
    refreshExpressionConfiguration();
  }, [refreshExpressionConfiguration]);

  const handleSettingsClose = useCallback(() => {
    setSettingsOpen(false);
    refreshCharacters();
    if (selectedCharId) {
      loadHistory(selectedCharId);
    }
    if (expressionModelId) {
      refreshExpressionConfiguration().catch(console.error);
    }
  }, [
    refreshCharacters,
    selectedCharId,
    loadHistory,
    expressionModelId,
    refreshExpressionConfiguration,
  ]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!selectedCharId || !expressionsConfigured) return;

      // Maryam reacts to what the user actually says.
      setCurrentExpression(guessExpressionForUserText(text));

      // Browser-only preview: there is no AI engine here. Be honest — do not
      // fake a reply; explain where the real engine runs.
      if (!isTauri()) {
        setPreviewNotice(
          "Maryam's AI engine runs in the desktop app — this preview shows her presence, expressions and real voice.",
        );
        if (previewNoticeTimeoutRef.current) {
          window.clearTimeout(previewNoticeTimeoutRef.current);
        }
        previewNoticeTimeoutRef.current = window.setTimeout(
          () => setPreviewNotice(null),
          7000,
        );
        return;
      }

      const requestId = crypto.randomUUID();
      beginRequest(requestId);
      await send(selectedCharId, text, requestId);
    },
    [selectedCharId, expressionsConfigured, send, beginRequest],
  );

  useEffect(() => {
    if (!selectedCharId) return;
    setMessages([]);
    loadHistory(selectedCharId);
  }, [selectedCharId, loadHistory, setMessages]);

  // Reload chat history when switching from mini mode back to full mode
  useEffect(() => {
    const unlisten = listen<{ mode: string }>("app:mode-changed", (event) => {
      if (event.payload.mode === "full" && selectedCharId) {
        loadHistory(selectedCharId);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [selectedCharId, loadHistory]);

  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      setUserTyping(isTyping);
    },
    []
  );

  const pendingToolConfirm = toolCalls.find((tc) => tc.status === "awaiting_confirmation") ?? null;

  // ── Real voice states ───────────────────────────────────────────────────
  // SPEAKING only while actual audio is playing; LISTENING only while the
  // microphone is live; THINKING while the AI is processing; else IDLE.
  const effectiveSpeaking = speaking || browserSpeech.speaking;
  const effectiveListening = listening || browserRecognition.listening;
  const voiceState: VoiceState = effectiveListening
    ? "listening"
    : effectiveSpeaking
      ? "speaking"
      : isStreaming
        ? "thinking"
        : "idle";
  const voiceError = browserSpeech.error || browserRecognition.error || null;

  const maryamExpression = useMemo(() => {
    if (effectiveListening) return "curious" as const;
    if (effectiveSpeaking) {
      const n = normalizeMaryamExpression(currentExpression);
      return n !== "neutral"
        ? n
        : guessExpressionForAssistantText(streamingText || "");
    }
    if (isStreaming) return "thinking" as const;
    return normalizeMaryamExpression(currentExpression);
  }, [effectiveListening, effectiveSpeaking, isStreaming, currentExpression, streamingText]);

  const handleMicToggle = useCallback(() => {
    if (effectiveListening) {
      if (browserRecognition.listening) browserRecognition.stop();
      else stopListening();
      return;
    }
    // Browser voice input (real SpeechRecognition) when available.
    if (!isTauri() && browserRecognitionSupported()) {
      browserRecognition.start((transcript) => {
        void handleSend(transcript);
      });
    } else {
      startListening((transcript) => {
        void handleSend(transcript);
      });
    }
  }, [effectiveListening, browserRecognition, startListening, stopListening, handleSend]);
  handleMicToggleRef.current = handleMicToggle;

  const handleToggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      if (!next) browserSpeechRef.current.stop();
      return next;
    });
  }, []);

  const handleStopSpeaking = useCallback(() => {
    browserSpeechRef.current.stop();
    clearQueue();
  }, [clearQueue]);

  const handleSayHello = useCallback(() => {
    if (browserSpeechSupported()) {
      browserSpeechRef.current.speak(MARYAM_WELCOME.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}]/gu, ""), {
        rate: 1.0,
      });
    }
  }, []);

  const showWelcome = !isStreaming && messages.length === 0;

  const handleCharacterChange = useCallback(
    (id: string) => {
      setSelectedCharId(id);
      setMessages([]);
      clearQueue();
      setCurrentExpression("neutral");
      setZoom(1.1);
    },
    [setMessages, clearQueue]
  );

  const handleCharacterCreated = useCallback(
    async (characterId: string) => {
      try {
        const data = await listModels();
        setModels(data as ModelInfo[]);
      } catch (err) {
        console.error("Model list load error:", err);
      }
      await refreshCharacters(characterId);
      setMessages([]);
      clearQueue();
      setCurrentExpression("neutral");
      setZoom(1.1);
      setSettingsOpen(false);
    },
    [refreshCharacters, setMessages, clearQueue]
  );

  const [framing, setFraming] = useState<"full" | "half">("full");

  const canvasProps = useMemo(
    () => ({
      modelPath,
      expression: currentExpression,
      speaking,
      userTyping,
      uiMode: isMiniMode ? "mini" as const : "full" as const,
      background,
      zoom,
      framing,
      onZoomChange: setZoom,
      onBackgroundChange: setBackground,
      onFramingChange: setFraming,
      getAudioLevels,
    }),
    [modelPath, currentExpression, speaking, userTyping, isMiniMode, background, zoom, framing, getAudioLevels]
  );

  // Maryam's built-in avatar renders when her model type is selected, or in
  // browser-only mode when no backend model is available.
  const useMaryamAvatar = modelType === "maryam" || (!modelPath && isBrowserOnly);

  const avatarCanvas = useMemo(() => (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center text-slate-400 font-medium">
          Loading model...
        </div>
      }
    >
      {useMaryamAvatar ? (
        <MaryamAvatar
          key={`maryam-${selectedCharId}`}
          expression={maryamExpression}
          speaking={effectiveSpeaking}
          listening={effectiveListening}
          thinking={isStreaming}
          userTyping={userTyping}
          uiMode={isMiniMode ? "mini" : "full"}
          background={background}
          zoom={zoom}
          framing={framing}
        />
      ) : modelType === "vrm" ? (
        <VRMCanvas
          key={`vrm-${selectedCharId}`}
          {...canvasProps}
          animations={selectedModel?.animations}
        />
      ) : (
        <Live2DCanvas
          key={`l2d-${selectedCharId}`}
          {...canvasProps}
          modelMapping={modelMapping}
        />
      )}
    </Suspense>
  ), [useMaryamAvatar, maryamExpression, effectiveSpeaking, effectiveListening, isStreaming, userTyping, isMiniMode, background, zoom, framing, modelType, selectedCharId, canvasProps, selectedModel?.animations, modelMapping]);

  const charName = selectedChar?.name || "Companion";

  const spokenCaption = useMemo(() => {
    if (speaking && speakingSentence?.trim()) {
      return cleanCompanionDisplayText(speakingSentence);
    }
    return null;
  }, [speaking, speakingSentence]);

  // Mini mode: render just the avatar in MiniWidget
  if (isMiniMode) {
    return (
      <MiniWidget
        avatarComponent={avatarCanvas}
        listening={listening}
        speaking={speaking}
        isStreaming={isStreaming}
        speechSessionActive={speechSessionActive}
        caption={spokenCaption}
        captionSpeaker={spokenCaption ? charName : undefined}
        toolCalls={toolCalls}
        onSend={handleSend}
        onMicToggle={handleMicToggle}
        onToolConfirm={handleConfirm}
        pendingConfirmation={pendingToolConfirm !== null}
        openComposerTrigger={miniComposerTrigger}
      />
    );
  }

  if (onboardingComplete === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-5">
          <div className="flex gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-3 h-3 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-3 h-3 rounded-full bg-blue-400 animate-bounce" />
          </div>
          <div className="text-slate-400 font-semibold text-sm tracking-wide uppercase">AITZAZ AI 2070</div>
        </div>
      </div>
    );
  }

  if (!onboardingComplete) {
    return (
      <Onboarding
        onComplete={() => {
          setOnboardingComplete(true);
          getConfig()
            .then((cfg) => {
              const config = cfg as { active_character?: string };
              refreshCharacters(config.active_character);
            })
            .catch(() => refreshCharacters());
          listModels()
            .then((data) => setModels(data as ModelInfo[]))
            .catch(console.error);
        }}
        onSkipToPreview={() => {
          setOnboardingComplete(true);
          refreshCharacters("maryam");
          setModels([MARYAM_MODEL]);
        }}
      />
    );
  }

  return (
    <div className="companion-stage-light relative flex h-screen flex-col overflow-hidden font-sans text-slate-900">
      <div className="relative flex min-h-0 flex-1">
        <main className="relative min-h-0 min-w-0 flex-1">
          {expressionsConfigured === null ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400/60 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400/60 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400/60 animate-bounce" />
              </div>
            </div>
          ) : !expressionsConfigured ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <p className="mb-6 max-w-sm text-sm text-slate-500 leading-relaxed">
                Map avatar expressions in Settings before you chat.
              </p>
              <button
                onClick={() => setSettingsOpen(true)}
                className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Open Settings
              </button>
            </div>
          ) : (
            <>
              <div className="absolute inset-0">{avatarCanvas}</div>

              <StageCornerToolbar
                historyOpen={historyOpen}
                onHistoryToggle={() => {
                  setHistoryOpen((o) => !o);
                  setCharSelectOpen(false);
                }}
                onMini={() => {
                  toggleMini(selectedCharId).catch(() => {
                    // Mini mode needs the Tauri window shell (desktop app).
                  });
                }}
                onSettings={() => {
                  setSettingsOpen((o) => !o);
                  setCharSelectOpen(false);
                }}
                settingsOpen={settingsOpen}
                onCharacters={() => {
                  setCharSelectOpen((o) => !o);
                  setHistoryOpen(false);
                }}
                charSelectOpen={charSelectOpen}
                framing={framing}
                onFramingChange={setFraming}
              />

              <CharacterSelect
                menuOnly
                characters={characters}
                selected={selectedCharId}
                onSelect={handleCharacterChange}
                onAddCharacter={() => setAddCharacterOpen(true)}
                open={charSelectOpen}
                onToggle={() => setCharSelectOpen(false)}
              />

              <div className="pointer-events-none absolute bottom-6 left-5 z-20 hidden sm:block">
                <p className="text-sm font-semibold text-slate-800">{charName}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  AITZAZ AI 2070
                </p>
              </div>

              <div className="pointer-events-none absolute bottom-6 right-5 z-20 hidden sm:flex">
                <VoiceControlBar
                  state={voiceState}
                  voiceEnabled={voiceEnabled}
                  onToggleVoice={handleToggleVoice}
                  onStopSpeaking={handleStopSpeaking}
                  voiceName={browserSpeech.selectedVoice?.name ?? null}
                  error={voiceError}
                />
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center px-4 pb-6 pt-16">
                {showWelcome && (
                  <div className="pointer-events-auto mb-2 flex w-full max-w-md flex-col items-center gap-2 animate-in fade-in slide-up duration-500">
                    <div className="w-full rounded-3xl border border-indigo-100/80 bg-white/90 px-5 py-3.5 shadow-[0_10px_40px_rgba(79,70,229,0.14)] backdrop-blur-xl">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[12px] font-bold text-white shadow-md">
                          M
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                            Maryam · AITZAZ AI 2070
                          </p>
                          <p className="mt-1 text-[14px] leading-snug text-slate-700">
                            {MARYAM_WELCOME}
                          </p>
                        </div>
                      </div>
                    </div>
                    {browserSpeechSupported() && (
                      <button
                        type="button"
                        onClick={handleSayHello}
                        className="pointer-events-auto flex items-center gap-2 rounded-full border border-indigo-200 bg-white/90 px-4 py-2 text-[12px] font-semibold text-indigo-600 shadow-sm backdrop-blur-md transition-all hover:bg-indigo-50"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12a7 7 0 0114 0M12 5v14m-5-2.5A7.5 7.5 0 0117 16.5" />
                        </svg>
                        Say hello
                      </button>
                    )}
                  </div>
                )}

                {previewNotice && (
                  <div className="pointer-events-auto mb-2 max-w-md rounded-2xl border border-amber-200/80 bg-amber-50/95 px-4 py-2.5 text-center text-[12px] font-medium text-amber-700 shadow-sm backdrop-blur-md">
                    {previewNotice}
                  </div>
                )}

                <FloatingChatInput
                  isProcessing={isStreaming}
                  onSend={handleSend}
                  onTypingChange={handleTypingChange}
                  listening={effectiveListening}
                  onMicToggle={handleMicToggle}
                  inputRef={fullChatInputRef}
                  caption={spokenCaption}
                  captionSpeaker={spokenCaption ? charName : undefined}
                  statusLabel={
                    spokenCaption
                      ? null
                      : voiceState === "thinking"
                        ? "Thinking…"
                        : null
                  }
                />
              </div>
            </>
          )}
        </main>

        {expressionsConfigured && (
          <HistoryDrawer
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            title={`Chat with ${charName}`}
          >
            <ChatPanel
              hideInput
              appearance="light"
              timeline={timeline}
              loading={isStreaming}
              streamingText={streamingText}
              characterName={charName}
              onSend={handleSend}
              onTypingChange={handleTypingChange}
              listening={listening}
              onMicToggle={handleMicToggle}
              onToolConfirm={handleConfirm}
            />
          </HistoryDrawer>
        )}

        {settingsOpen && (
          <aside
            className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[420px] flex-col border-l border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl"
          >
            <Settings
              characterId={selectedCharId}
              characterName={charName}
              modelId={expressionModelId || ""}
              onPreviewExpression={(expr) => setCurrentExpression(expr)}
              onExpressionsSaved={() => {
                refreshExpressionConfiguration().catch(console.error);
              }}
              onConversationCleared={async () => {
                await clearMessages(selectedCharId);
              }}
              onResetAll={() => {
                setSettingsOpen(false);
                setOnboardingComplete(false);
                setCharacters([]);
                setSelectedCharId("");
                setMessages([]);
                clearQueue();
                setExpressionsConfigured(null);
                setCurrentExpression("neutral");
              }}
              onResetOnboarding={() => {
                setSettingsOpen(false);
                setOnboardingComplete(false);
              }}
              onClose={handleSettingsClose}
              avatarZoom={zoom}
              avatarBackground={background}
              onAvatarZoomChange={setZoom}
              onAvatarBackgroundChange={setBackground}
            />
          </aside>
        )}
      </div>

      <AddCharacterModal
        open={addCharacterOpen}
        onClose={() => setAddCharacterOpen(false)}
        onCreated={handleCharacterCreated}
      />
    </div>
  );
}

export default App;
