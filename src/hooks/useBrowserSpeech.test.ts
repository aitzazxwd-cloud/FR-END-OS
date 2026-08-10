import { describe, it, expect } from "vitest";
import { pickNaturalVoice } from "./useBrowserSpeech";

function makeVoice(name: string, lang: string): SpeechSynthesisVoice {
  return {
    name,
    lang,
    voiceURI: name,
    localService: false,
    default: false,
  };
}

describe("pickNaturalVoice", () => {
  it("returns null when no voices are available", () => {
    expect(pickNaturalVoice([])).toBeNull();
  });

  it("prefers a natural female English voice when present", () => {
    const voices = [
      makeVoice("Microsoft David", "en-US"),
      makeVoice("Google US English", "en-US"),
      makeVoice("Microsoft Zira", "en-US"),
    ];
    const picked = pickNaturalVoice(voices);
    expect(picked?.name).toBe("Google US English");
  });

  it("falls back to the first English voice", () => {
    const voices = [
      makeVoice("Microsoft David", "en-US"),
      makeVoice("Alex", "en-US"),
    ];
    const picked = pickNaturalVoice(voices);
    expect(picked).not.toBeNull();
    expect(picked?.lang).toMatch(/^en/);
  });

  it("falls back to any voice when no English voice exists", () => {
    const voices = [makeVoice("Siri", "fr-FR"), makeVoice("Kyoko", "ja-JP")];
    const picked = pickNaturalVoice(voices);
    expect(picked).not.toBeNull();
  });
});
