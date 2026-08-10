import { useState, useEffect, useCallback, useRef } from "react";
import type { JSX } from "react";
import { ModelSettings } from "./ModelSettings";
import { MemoryStatePanel } from "./MemoryStatePanel";
import {
  getConfig,
  saveConfig,
  resetAllAppData,
  resetOnboarding,
  getVoices,
} from "../API/tauri";
import { ACP_AGENT_PRESET_IDS, ACP_AGENT_PRESETS } from "../lib/agentPresets";
import { DEFAULT_TTS_PROVIDER, TTS_PRESETS_UI } from "../lib/ttsPresets";
import { AgentPresetCard } from "./agents/AgentPresetCard";
import { AgentPresetIcon } from "./agents/AgentPresetIcon";
import { AgentSetupPanel } from "./agents/AgentSetupPanel";
import { MeuxeMark } from "./UI/MeuxeMark";
import { AvatarViewportSettings } from "./settings/AvatarViewportSettings";
import type { AcpAgentPresetId } from "../lib/agentPresets";

interface Voice {
  id: string;
  name: string;
}

type SettingsPage =
  | null
  | "profile"
  | "agent"
  | "tts"
  | "memory"
  | "avatar"
  | "expressions"
  | "nexus"
  | "privacy";

type NexusConnectionState = "idle" | "checking" | "connected" | "disconnected" | "error";

interface NexusHealthResult {
  state: NexusConnectionState;
  message: string;
  checkedAt: Date | null;
}

interface NexusConfig {
  backend_url: string;
  api_key: string;
  auto_connect: boolean;
  retry_enabled: boolean;
  retry_count: number;
  retry_delay: number;
}

interface AppConfig {
  user?: { name?: string; about?: string };
  tts?: { provider?: string; voice?: string; api_key?: string };
  tts_providers?: Record<string, { voice?: string; api_key?: string }>;
  agent?: { preset?: string; program?: string; args?: string[] };
  nexus?: Partial<NexusConfig>;
  [key: string]: unknown;
}

const DEFAULT_NEXUS_URL = "http://127.0.0.1:8000";

const DEFAULT_NEXUS_CONFIG: NexusConfig = {
  backend_url: DEFAULT_NEXUS_URL,
  api_key: "",
  auto_connect: false,
  retry_enabled: true,
  retry_count: 3,
  retry_delay: 2000,
};

function isValidBackendUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.password) return false;
    return true;
  } catch {
    return false;
  }
}

async function checkNexusHealth(
  backendUrl: string,
  timeoutMs = 5000
): Promise<NexusHealthResult> {
  const trimmed = backendUrl.trim().replace(/\/+$/, "");
  if (!isValidBackendUrl(trimmed)) {
    return { state: "error", message: "Invalid backend URL.", checkedAt: new Date() };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${trimmed}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    if (res.ok) {
      return { state: "connected", message: "Backend is healthy.", checkedAt: new Date() };
    }
    return {
      state: "error",
      message: `Backend responded with status ${res.status}.`,
      checkedAt: new Date(),
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { state: "disconnected", message: "Connection timed out.", checkedAt: new Date() };
    }
    return {
      state: "disconnected",
      message: "Could not reach the backend.",
      checkedAt: new Date(),
    };
  } finally {
    clearTimeout(timer);
  }
}

const ProfileIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
);
const SpeakerIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
);
const MaskIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const ShieldIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3l7 4v5c0 4.5-2.8 7.7-7 9-4.2-1.3-7-4.5-7-9V7l7-4z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4" /></svg>
);
const ArchiveIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 12h10M5 16h8M4 4h16v16H4z" /></svg>
);
const FrameIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v18M15 3v18" /></svg>
);
const CpuIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 7h10v10H7V7z" /></svg>
);
const LinkIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
);
const ChevronIcon = () => (
  <svg className="w-4 h-4 shrink-0 text-slate-300 group-hover:text-blue-400" fill="none" viewBox="0 0 16 16"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const BackArrowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const CheckCircleIcon = () => (
  <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
);

interface NavItem {
  id: SettingsPage & string;
  label: string;
  description: string;
  icon: () => JSX.Element;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "profile", label: "Profile", description: "Name and about yourself", icon: ProfileIcon, group: "General" },
  { id: "agent", label: "AI Agent", description: "CLI agent and presets", icon: CpuIcon, group: "AI" },
  { id: "tts", label: "Voice & TTS", description: "Speech synthesis provider", icon: SpeakerIcon, group: "AI" },
  { id: "memory", label: "Memory", description: "Companion memory and history", icon: ArchiveIcon, group: "AI" },
  { id: "avatar", label: "Avatar", description: "Zoom and background", icon: FrameIcon, group: "Appearance" },
  { id: "expressions", label: "Expressions", description: "Emotion mapping", icon: MaskIcon, group: "Appearance" },
  { id: "nexus", label: "Nexus AI Agent", description: "Backend connection", icon: LinkIcon, group: "System" },
  { id: "privacy", label: "Privacy", description: "Data and resets", icon: ShieldIcon, group: "System" },
];

const NAV_GROUPS = ["General", "AI", "Appearance", "System"] as const;

const inputClass = "w-full px-5 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/50 text-slate-700 text-[15px] outline-none transition-all placeholder-slate-400 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 mb-5";
const labelClass = "block text-sm font-semibold text-slate-700 tracking-wide mb-2 pl-1";
const buttonClass = "w-full py-3.5 rounded-2xl bg-blue-500 text-white text-[15px] font-semibold hover:bg-blue-600 shadow-md shadow-blue-500/20 disabled:opacity-50 hover:-translate-y-0.5 transition-all active:translate-y-0";

function LocalFirstNotice({ variant = "blue" }: { variant?: "blue" | "emerald" | "amber" }) {
  const colors = {
    blue: "border-blue-100 bg-blue-50 text-blue-800",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-800",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
  };
  return (
    <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm leading-snug ${colors[variant]}`}>
      Memory and chat stay on this device. Voice and your CLI agent only use the network when you configure them.
    </div>
  );
}

function PrivacyCard({ title, items, tone }: { title: string; items: string[]; tone: "emerald" | "blue" | "amber" | "violet" | "red" }) {
  const toneClass: Record<string, string> = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    violet: "border-violet-100 bg-violet-50 text-violet-700",
    red: "border-red-100 bg-red-50 text-red-700",
  };
  return (
    <section className={`rounded-[1.75rem] border px-5 py-5 ${toneClass[tone] || toneClass.blue}`}>
      <h3 className="text-lg font-bold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-current opacity-70 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SaveStatus({ saving, saved, error }: { saving: boolean; saved: boolean; error: string | null }) {
  if (saving) return <span className="text-sm text-blue-500 font-medium ml-3">Saving…</span>;
  if (saved) return <span className="text-sm text-emerald-600 font-medium ml-3">✓ Saved!</span>;
  if (error) return <span className="text-sm text-red-500 font-medium ml-3">{error}</span>;
  return null;
}

function StatusDot({ state }: { state: NexusConnectionState }) {
  const colors: Record<NexusConnectionState, string> = {
    idle: "bg-slate-300",
    checking: "bg-amber-400 animate-pulse",
    connected: "bg-emerald-500",
    disconnected: "bg-red-400",
    error: "bg-red-500",
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[state]}`} />;
}

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      <button
        onClick={onBack}
        className="w-10 h-10 rounded-full bg-white border border-slate-100 shadow-sm shadow-blue-900/5 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-center text-slate-500 hover:text-blue-500 transition-all"
      >
        <BackArrowIcon />
      </button>
      <h2 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h2>
    </div>
  );
}

export function Settings({
  onClose,
  characterId,
  characterName,
  modelId,
  onPreviewExpression,
  onExpressionsSaved,
  onConversationCleared,
  onResetAll,
  onResetOnboarding,
  avatarZoom,
  avatarBackground,
  onAvatarZoomChange,
  onAvatarBackgroundChange,
}: {
  onClose: () => void;
  characterId?: string;
  characterName: string;
  modelId?: string;
  onPreviewExpression?: (expr: string) => void;
  onExpressionsSaved?: () => void;
  onConversationCleared?: () => void;
  onResetAll?: () => void;
  onResetOnboarding?: () => void;
  avatarZoom?: number;
  avatarBackground?: string;
  onAvatarZoomChange?: (zoom: number) => void;
  onAvatarBackgroundChange?: (bg: string) => void;
}) {
  const [page, setPage] = useState<SettingsPage>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);

  const [userName, setUserName] = useState("");
  const [userAbout, setUserAbout] = useState("");
  const [agentPreset, setAgentPreset] = useState("opencode");
  const [agentProgram, setAgentProgram] = useState("");
  const [agentArgs, setAgentArgs] = useState("");
  const [ttsProvider, setTtsProvider] = useState(DEFAULT_TTS_PROVIDER);
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [ttsVoice, setTtsVoice] = useState("jp_001");
  const [configuredTts, setConfiguredTts] = useState<Record<string, { configured: boolean; voice: string }>>({});

  const [nexusUrl, setNexusUrl] = useState(DEFAULT_NEXUS_URL);
  const [nexusApiKey, setNexusApiKey] = useState("");
  const [nexusAutoConnect, setNexusAutoConnect] = useState(false);
  const [nexusRetryEnabled, setNexusRetryEnabled] = useState(true);
  const [nexusRetryCount, setNexusRetryCount] = useState(3);
  const [nexusRetryDelay, setNexusRetryDelay] = useState(2000);
  const [nexusHealth, setNexusHealth] = useState<NexusHealthResult>({ state: "idle", message: "Not checked yet.", checkedAt: null });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resettingOnboarding, setResettingOnboarding] = useState(false);
  const [onboardingResetError, setOnboardingResetError] = useState<string | null>(null);

  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deriveConfigured = useCallback((cfg: AppConfig) => {
    const ttsConfigured: Record<string, { configured: boolean; voice: string }> = {};
    if (cfg.tts_providers) {
      for (const [id, prov] of Object.entries(cfg.tts_providers)) {
        ttsConfigured[id] = { configured: true, voice: prov.voice || "" };
      }
    }
    if (cfg.tts?.provider) {
      ttsConfigured[cfg.tts.provider] = {
        configured: true,
        voice: cfg.tts.voice || "",
      };
    }
    setConfiguredTts(ttsConfigured);
  }, []);

  const applyConfig = useCallback((cfg: AppConfig) => {
    setConfig(cfg);
    deriveConfigured(cfg);
    setUserName(cfg.user?.name || "");
    setUserAbout(cfg.user?.about || "");
    setTtsProvider(cfg.tts?.provider || DEFAULT_TTS_PROVIDER);
    setTtsApiKey("");
    setTtsVoice(cfg.tts?.voice || "jp_001");
    setAgentPreset(cfg.agent?.preset || "opencode");
    setAgentProgram(cfg.agent?.program || "");
    setAgentArgs((cfg.agent?.args || []).join(" "));

    const nx = cfg.nexus;
    setNexusUrl(nx?.backend_url || DEFAULT_NEXUS_URL);
    setNexusApiKey("");
    setNexusAutoConnect(nx?.auto_connect ?? false);
    setNexusRetryEnabled(nx?.retry_enabled ?? true);
    setNexusRetryCount(nx?.retry_count ?? 3);
    setNexusRetryDelay(nx?.retry_delay ?? 2000);
  }, [deriveConfigured]);

  const flashSaved = useCallback(() => {
    setSaved(true);
    setSaveError(null);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
  }, []);

  useEffect(() => {
    getConfig()
      .then((cfg: AppConfig) => applyConfig(cfg))
      .catch((err) => console.error("Failed to load config:", err));
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [applyConfig]);

  useEffect(() => {
    getVoices(ttsProvider)
      .then(setVoices)
      .catch(console.error);
  }, [ttsProvider]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveConfig({ user: { name: userName, about: userAbout } });
      const fresh = await getConfig();
      applyConfig(fresh);
      flashSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAgent = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveConfig({
        agent: {
          preset: agentPreset,
          program: agentProgram,
          args: agentArgs.trim() ? agentArgs.trim().split(/\s+/) : [],
        },
      });
      const fresh = await getConfig();
      applyConfig(fresh);
      flashSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTts = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const ttsUpdate: Record<string, unknown> = { provider: ttsProvider, voice: ttsVoice };
      if (ttsApiKey.trim()) ttsUpdate.api_key = ttsApiKey.trim();
      await saveConfig({ tts: ttsUpdate });
      const fresh = await getConfig();
      applyConfig(fresh);
      flashSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNexus = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const nexusUpdate: Record<string, unknown> = {
        backend_url: nexusUrl.trim(),
        auto_connect: nexusAutoConnect,
        retry_enabled: nexusRetryEnabled,
        retry_count: nexusRetryCount,
        retry_delay: nexusRetryDelay,
      };
      if (nexusApiKey.trim()) nexusUpdate.api_key = nexusApiKey.trim();
      await saveConfig({ nexus: nexusUpdate });
      const fresh = await getConfig();
      applyConfig(fresh);
      flashSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleNexusHealthCheck = async () => {
    setNexusHealth({ state: "checking", message: "Checking…", checkedAt: null });
    const result = await checkNexusHealth(nexusUrl);
    setNexusHealth(result);
  };

  const handleResetAll = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setResetError(null);
      return;
    }
    setResetting(true);
    setResetError(null);
    try {
      await resetAllAppData();
      onResetAll?.();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Reset failed. Please try again.");
      setConfirmReset(false);
    } finally {
      setResetting(false);
    }
  };

  const handleResetOnboarding = async () => {
    setResettingOnboarding(true);
    setOnboardingResetError(null);
    try {
      await resetOnboarding();
      onResetOnboarding?.();
    } catch (err) {
      setOnboardingResetError(err instanceof Error ? err.message : "Could not reset onboarding.");
    } finally {
      setResettingOnboarding(false);
    }
  };

  if (!config) return <div className="p-8 text-slate-400">Loading settings…</div>;

  const Sidebar = () => (
    <div className="w-64 shrink-0 border-r border-slate-100 bg-slate-50/60 flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <div className="px-5 pt-6 pb-4 flex items-center gap-3">
        <MeuxeMark className="h-9 w-9 shrink-0" />
        <div>
          <h2 className="text-base font-bold text-slate-800 tracking-tight">Settings</h2>
          <p className="text-[11px] text-slate-400 leading-tight">Nexus AI Agent</p>
        </div>
      </div>

      <nav className="flex-1 px-3 pb-6 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group}>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{group}</div>
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((n) => n.group === group).map((item) => {
                const active = page === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setPage(item.id); setSaveError(null); setSaved(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group ${
                      active
                        ? "bg-white shadow-sm shadow-blue-900/5 border border-blue-100 text-blue-700"
                        : "text-slate-600 hover:bg-white/70 hover:text-slate-800 border border-transparent"
                    }`}
                  >
                    <span className={active ? "text-blue-500" : "text-slate-400 group-hover:text-slate-600"}>
                      <Icon />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold truncate">{item.label}</div>
                      <div className={`text-[11px] truncate ${active ? "text-blue-400" : "text-slate-400"}`}>{item.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 pb-4">
        <button
          onClick={onClose}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-500 hover:text-red-500 hover:border-red-200 transition-all"
        >
          <CloseIcon /> Close
        </button>
      </div>
    </div>
  );

  const ProfilePage = () => (
    <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <SubHeader title="Your Profile" onBack={() => setPage(null)} />

      <label className={labelClass}>Your Name</label>
      <input
        type="text"
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
        placeholder="What should your companion call you?"
        className={inputClass}
      />

      <label className={labelClass}>About Yourself</label>
      <textarea
        value={userAbout}
        onChange={(e) => setUserAbout(e.target.value)}
        placeholder="Tell your companion about yourself — interests, what you do, what you enjoy…"
        rows={5}
        className={`${inputClass} resize-none mb-4 rounded-3xl`}
      />

      <div className="flex items-center">
        <button onClick={handleSaveProfile} disabled={saving} className={buttonClass} style={{ maxWidth: 320 }}>
          {saving ? "Saving…" : saved ? "Saved!" : "Save Profile"}
        </button>
        <SaveStatus saving={saving} saved={saved} error={saveError} />
      </div>

      <div className="mt-12">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 pl-1">Keyboard Shortcuts</h3>
        <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
          {[
            { keys: isMac ? "Cmd + Shift + E" : "Ctrl + Shift + E", action: "Toggle mini mode", context: "Global — works from any app" },
            { keys: isMac ? "Cmd + Shift + Space" : "Ctrl + Shift + Space", action: "Open text input", context: "Global — mini mode" },
            { keys: isMac ? "Cmd + Shift + M" : "Ctrl + Shift + M", action: "Toggle microphone", context: "Global — mini mode" },
            { keys: "Escape", action: "Close text input", context: "Mini mode" },
          ].map((shortcut, i) => (
            <div key={i} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-slate-50" : ""}`}>
              <div className="flex-1">
                <span className="text-[13px] text-slate-700">{shortcut.action}</span>
                <span className="text-[11px] text-slate-400 ml-2">{shortcut.context}</span>
              </div>
              <div className="flex gap-1">
                {shortcut.keys.split(" + ").map((key, j) => (
                  <span key={j}>
                    {j > 0 && <span className="text-slate-300 text-[11px] mx-0.5">+</span>}
                    <kbd className="inline-block px-2 py-0.5 text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg shadow-sm">{key}</kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const AgentPage = () => {
    const presetId = (agentPreset as AcpAgentPresetId) || "opencode";
    return (
      <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="AI Agent" onBack={() => setPage(null)} />
        <p className="text-slate-500 text-sm mb-6 leading-relaxed max-w-xl">
          Chat runs through your local ACP agent. Nexus supplies persona, memory, voice, and avatar.
        </p>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white px-5 py-4 flex items-center gap-4">
          <AgentPresetIcon id={presetId} size="sm" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active Agent</div>
            <div className="text-sm font-bold text-slate-800">
              {ACP_AGENT_PRESETS[presetId]?.title || agentPreset}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-5">
          {ACP_AGENT_PRESET_IDS.map((id) => (
            <AgentPresetCard key={id} id={id} selected={agentPreset === id} onSelect={() => setAgentPreset(id)} />
          ))}
        </div>

        {agentPreset === "custom" && (
          <>
            <label className={labelClass}>Command</label>
            <input type="text" value={agentProgram} onChange={(e) => setAgentProgram(e.target.value)} placeholder="e.g. python my_agent.py" className={inputClass} />
            <label className={labelClass}>Arguments (optional)</label>
            <input type="text" value={agentArgs} onChange={(e) => setAgentArgs(e.target.value)} placeholder="space-separated flags" className={inputClass} />
          </>
        )}

        {agentPreset !== "custom" && (
          <div className="mb-6"><AgentSetupPanel preset={presetId} /></div>
        )}

        <div className="flex items-center">
          <button onClick={handleSaveAgent} disabled={saving} className={buttonClass} style={{ maxWidth: 320 }}>
            {saving ? "Saving…" : saved ? "Saved!" : "Save Agent"}
          </button>
          <SaveStatus saving={saving} saved={saved} error={saveError} />
        </div>
      </div>
    );
  };

  const TTS_PRESETS_LOCAL: Record<string, { name: string; needs_key: boolean }> = {
    tiktok: TTS_PRESETS_UI.tiktok,
    elevenlabs: TTS_PRESETS_UI.elevenlabs,
  };

  const TtsPage = () => (
    <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <SubHeader title="Voice & TTS" onBack={() => setPage(null)} />
      <LocalFirstNotice variant={TTS_PRESETS_LOCAL[ttsProvider]?.needs_key ? "blue" : "emerald"} />

      <label className={labelClass}>Provider</label>
      <div className="flex flex-wrap gap-2 mb-6">
        {Object.entries(TTS_PRESETS_LOCAL).map(([id, preset]) => (
          <button
            key={id}
            onClick={() => setTtsProvider(id)}
            className={`px-4 py-3 rounded-2xl text-[13px] font-semibold border transition-all ${
              ttsProvider === id
                ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10 hover:-translate-y-0.5"
                : configuredTts[id]?.configured
                  ? "border-green-200 bg-green-50/30 text-slate-600 hover:border-green-300 hover:shadow-sm"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:shadow-sm"
            }`}
          >
            <span className="flex items-center gap-1.5">
              {preset.name}
              {!preset.needs_key && <span className="text-[10px] text-emerald-600 font-bold">No key</span>}
              {configuredTts[id]?.configured && ttsProvider !== id && <CheckCircleIcon />}
            </span>
          </button>
        ))}
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {TTS_PRESETS_LOCAL[ttsProvider]?.needs_key && (
          <>
            <label className={labelClass}>API Key</label>
            <input
              type="password"
              value={ttsApiKey}
              onChange={(e) => setTtsApiKey(e.target.value)}
              placeholder={configuredTts[ttsProvider]?.configured ? "Configured — leave blank to keep" : "Paste your API key"}
              className={inputClass}
            />
          </>
        )}
        {!TTS_PRESETS_LOCAL[ttsProvider]?.needs_key && (
          <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Meuxe TTS is built in — no API key required.
          </div>
        )}

        <label className={labelClass}>Voice</label>
        <div className="relative mb-8">
          <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} className={`${inputClass} appearance-none cursor-pointer mb-0`}>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>

        <div className="flex items-center">
          <button onClick={handleSaveTts} disabled={saving} className={buttonClass} style={{ maxWidth: 320 }}>
            {saving ? "Saving…" : saved ? "Saved!" : "Save Configuration"}
          </button>
          <SaveStatus saving={saving} saved={saved} error={saveError} />
        </div>
      </div>
    </div>
  );

  const MemoryPage = () => (
    <div className="flex-1 overflow-y-auto">
      <div className="p-8 pb-0"><SubHeader title="Memory" onBack={() => setPage(null)} /></div>
      <MemoryStatePanel characterId={characterId} characterName={characterName} onConversationCleared={onConversationCleared} />
    </div>
  );

  const AvatarPage = () => (
    <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <SubHeader title="Avatar on Screen" onBack={() => setPage(null)} />
      {avatarZoom != null && avatarBackground && onAvatarZoomChange && onAvatarBackgroundChange ? (
        <AvatarViewportSettings zoom={avatarZoom} background={avatarBackground} onZoomChange={onAvatarZoomChange} onBackgroundChange={onAvatarBackgroundChange} />
      ) : (
        <p className="text-sm text-slate-400">Avatar controls are not available in this view.</p>
      )}
    </div>
  );

  const ExpressionsPage = () => (
    <div className="flex-1 overflow-y-auto">
      <div className="p-8 pb-0"><SubHeader title="Expression Mapping" onBack={() => setPage(null)} /></div>
      {modelId ? (
        <ModelSettings modelId={modelId} onPreviewExpression={onPreviewExpression || (() => {})} onSaved={onExpressionsSaved} onClose={() => setPage(null)} />
      ) : (
        <div className="p-8 text-sm text-slate-400">No model loaded — select a character first.</div>
      )}
    </div>
  );

  const NexusPage = () => {
    const hasExistingKey = Boolean(config?.nexus?.api_key);
    const urlValid = isValidBackendUrl(nexusUrl);
    return (
      <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <SubHeader title="Nexus AI Agent" onBack={() => setPage(null)} />
        <p className="text-slate-500 text-sm mb-6 leading-relaxed max-w-xl">
          Connect to a local or remote Nexus AI Agent backend for advanced actions, memory sync, and integrations.
        </p>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Connection Status</div>
              <div className="flex items-center gap-2">
                <StatusDot state={nexusHealth.state} />
                <span className={`text-sm font-bold capitalize ${
                  nexusHealth.state === "connected" ? "text-emerald-700" :
                  nexusHealth.state === "checking" ? "text-amber-600" :
                  nexusHealth.state === "idle" ? "text-slate-500" :
                  "text-red-600"
                }`}>
                  {nexusHealth.state === "idle" ? "Not checked" : nexusHealth.state}
                </span>
              </div>
            </div>
            <button
              onClick={handleNexusHealthCheck}
              disabled={nexusHealth.state === "checking" || !urlValid}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-all disabled:opacity-40"
            >
              {nexusHealth.state === "checking" ? "Checking…" : "Check Connection"}
            </button>
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            <div>Backend: <span className="font-mono text-slate-600">{nexusUrl.trim() || DEFAULT_NEXUS_URL}</span></div>
            {nexusHealth.checkedAt && <div>Last checked: {nexusHealth.checkedAt.toLocaleTimeString()}</div>}
            {nexusHealth.message && <div className={nexusHealth.state === "connected" ? "text-emerald-600" : "text-red-500"}>{nexusHealth.message}</div>}
          </div>
        </div>

        <label className={labelClass}>Backend URL</label>
        <input
          type="url"
          value={nexusUrl}
          onChange={(e) => setNexusUrl(e.target.value)}
          placeholder={DEFAULT_NEXUS_URL}
          className={`${inputClass} font-mono text-sm ${!urlValid && nexusUrl.trim() ? "border-red-300 focus:ring-red-100 focus:border-red-400" : ""}`}
        />
        {!urlValid && nexusUrl.trim() && (
          <p className="text-xs text-red-500 -mt-3 mb-4 pl-1">Enter a valid http:// or https:// URL. Secrets in URLs are not allowed.</p>
        )}

        <label className={labelClass}>API Key</label>
        <input
          type="password"
          value={nexusApiKey}
          onChange={(e) => setNexusApiKey(e.target.value)}
          placeholder={hasExistingKey ? "Configured — leave blank to keep" : "Optional API key for authenticated backends"}
          className={inputClass}
        />
        {hasExistingKey && <p className="text-xs text-slate-400 -mt-3 mb-4 pl-1">An API key is already stored. Enter a new one to replace it.</p>}

        <div className="flex items-center justify-between mb-5 rounded-2xl border border-slate-100 bg-white px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-700">Auto-connect</div>
            <div className="text-xs text-slate-400">Automatically connect to Nexus AI Agent on startup</div>
          </div>
          <button
            onClick={() => setNexusAutoConnect(!nexusAutoConnect)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${nexusAutoConnect ? "bg-blue-500" : "bg-slate-200"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${nexusAutoConnect ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-slate-700">Retry on failure</div>
              <div className="text-xs text-slate-400">Automatically retry failed connections</div>
            </div>
            <button
              onClick={() => setNexusRetryEnabled(!nexusRetryEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${nexusRetryEnabled ? "bg-blue-500" : "bg-slate-200"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${nexusRetryEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          {nexusRetryEnabled && (
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Retry count</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={nexusRetryCount}
                  onChange={(e) => setNexusRetryCount(Math.max(1, Math.min(10, Number(e.target.value))))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Delay (ms)</label>
                <input
                  type="number"
                  min={500}
                  max={30000}
                  step={500}
                  value={nexusRetryDelay}
                  onChange={(e) => setNexusRetryDelay(Math.max(500, Math.min(30000, Number(e.target.value))))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center">
          <button onClick={handleSaveNexus} disabled={saving || !urlValid} className={buttonClass} style={{ maxWidth: 320 }}>
            {saving ? "Saving…" : saved ? "Saved!" : "Save Nexus Settings"}
          </button>
          <SaveStatus saving={saving} saved={saved} error={saveError} />
        </div>
      </div>
    );
  };

  const PrivacyPage = () => (
    <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <SubHeader title="Local-First Privacy" onBack={() => setPage(null)} />
      <div className="space-y-4">
        <PrivacyCard
          title="Stays on your device"
          items={["Memories and chat history", "Character personality", "Your profile", "Local settings and preferences"]}
          tone="emerald"
        />
        <PrivacyCard
          title="Uses the network when you choose"
          items={["Speaking (voice provider)", "Your chat assistant", "Nexus AI Agent backend (when connected)", "External agent actions and integrations"]}
          tone="blue"
        />
        <PrivacyCard
          title="Keys & exports"
          items={["API keys stay in local config", "API keys are never displayed in plain text", "Exports are files you control"]}
          tone="amber"
        />

        <section className="rounded-[1.75rem] border border-violet-200 bg-violet-50 px-5 py-5 text-violet-900">
          <h3 className="text-lg font-bold">Run onboarding again</h3>
          <p className="mt-2 text-sm leading-relaxed text-violet-800/90">
            Reopen the first-run setup to change your companion, voice, or CLI agent. Your chat history, memories, and API keys stay on this device.
          </p>
          {onboardingResetError && (
            <p className="mt-3 rounded-2xl border border-violet-300 bg-white/70 px-4 py-3 text-sm font-medium text-violet-900">{onboardingResetError}</p>
          )}
          <button
            type="button"
            onClick={handleResetOnboarding}
            disabled={resettingOnboarding}
            className="mt-4 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 disabled:opacity-50"
          >
            {resettingOnboarding ? "Opening onboarding…" : "Run onboarding again"}
          </button>
        </section>

        <section className="rounded-[1.75rem] border border-red-200 bg-red-50 px-5 py-5 text-red-800">
          <h3 className="text-lg font-bold">Reset everything</h3>
          <p className="mt-2 text-sm leading-relaxed text-red-700/90">
            Deletes your profile, companions, chat history, saved memories, API keys, and settings, then returns you to onboarding. Imported Live2D and VRM models stay on disk.
          </p>
          {resetError && (
            <p className="mt-3 rounded-2xl border border-red-300 bg-white/70 px-4 py-3 text-sm font-medium text-red-700">{resetError}</p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleResetAll}
              disabled={resetting}
              className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-red-600/20 transition-all hover:bg-red-700 disabled:opacity-50"
            >
              {resetting ? "Resetting…" : confirmReset ? "Yes, reset everything" : "Reset and start over"}
            </button>
            {confirmReset && !resetting && (
              <button
                type="button"
                onClick={() => { setConfirmReset(false); setResetError(null); }}
                className="rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-700 transition-all hover:bg-red-100/50"
              >
                Cancel
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );

  const HomePage = () => (
    <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <MeuxeMark className="h-11 w-11 shrink-0" />
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Settings</h2>
            <p className="text-sm text-slate-400">Local companion · optional cloud voice & agents</p>
          </div>
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white border border-slate-100 shadow-sm shadow-blue-900/5 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-center text-slate-500 hover:text-red-500 transition-all">
          <CloseIcon />
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setPage("agent")}
          className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm text-left transition-all hover:border-indigo-100 hover:shadow-md group"
        >
          <div className="flex items-center gap-3">
            <AgentPresetIcon id={(config.agent?.preset as AcpAgentPresetId) || "opencode"} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Agent</div>
              <div className="text-sm font-bold text-slate-800 truncate group-hover:text-blue-600">
                {ACP_AGENT_PRESETS[(config.agent?.preset as AcpAgentPresetId) || "opencode"]?.title || "—"}
              </div>
            </div>
            <ChevronIcon />
          </div>
        </button>
        <button
          type="button"
          onClick={() => setPage("tts")}
          className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm text-left transition-all hover:border-indigo-100 hover:shadow-md group"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <SpeakerIcon />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Voice</div>
              <div className="text-sm font-bold text-slate-800 truncate group-hover:text-blue-600">
                {TTS_PRESETS_UI[config.tts?.provider || ""]?.name || config.tts?.provider || "—"}
              </div>
            </div>
            <ChevronIcon />
          </div>
        </button>
      </div>

      <div className="space-y-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-slate-100/80 bg-white shadow-sm shadow-slate-900/5 hover:border-indigo-100 hover:shadow-md transition-all text-left group"
            >
              <div className="w-11 h-11 rounded-2xl bg-slate-50 group-hover:bg-indigo-50 flex items-center justify-center text-slate-500 group-hover:text-indigo-600 transition-colors shadow-sm shrink-0">
                <Icon />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">{item.label}</div>
                <div className="text-sm text-slate-400 mt-0.5">{item.description}</div>
              </div>
              <ChevronIcon />
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderPage = () => {
    switch (page) {
      case "profile": return <ProfilePage />;
      case "agent": return <AgentPage />;
      case "tts": return <TtsPage />;
      case "memory": return <MemoryPage />;
      case "avatar": return <AvatarPage />;
      case "expressions": return <ExpressionsPage />;
      case "nexus": return <NexusPage />;
      case "privacy": return <PrivacyPage />;
      default: return <HomePage />;
    }
  };

  return (
    <div className="flex h-full w-full bg-white rounded-3xl overflow-hidden shadow-2xl shadow-slate-900/10 border border-slate-100">
      {page !== null && <Sidebar />}
      {renderPage()}
    </div>
  );
}
