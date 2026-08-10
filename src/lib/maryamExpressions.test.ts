import { describe, it, expect } from "vitest";
import {
  normalizeMaryamExpression,
  guessExpressionForUserText,
  guessExpressionForAssistantText,
} from "./maryamExpressions";

describe("normalizeMaryamExpression", () => {
  it("maps legacy expression tags to Maryam states", () => {
    expect(normalizeMaryamExpression("happy")).toBe("happy");
    expect(normalizeMaryamExpression("<<sad>>")).toBe("neutral"); // tags stripped elsewhere
    expect(normalizeMaryamExpression("HAPPY")).toBe("happy");
    expect(normalizeMaryamExpression("worried")).toBe("concerned");
    expect(normalizeMaryamExpression("affection")).toBe("warm");
    expect(normalizeMaryamExpression("ponder")).toBe("thinking");
    expect(normalizeMaryamExpression("wow")).toBe("surprised");
  });

  it("falls back to neutral for unknown or missing expressions", () => {
    expect(normalizeMaryamExpression(undefined)).toBe("neutral");
    expect(normalizeMaryamExpression(null)).toBe("neutral");
    expect(normalizeMaryamExpression("flying-robot-42")).toBe("neutral");
  });
});

describe("guessExpressionForUserText", () => {
  it("reacts with concern to a difficult day (English)", () => {
    expect(guessExpressionForUserText("I had a difficult day today.")).toBe("concerned");
  });

  it("reacts with concern to tiredness in Roman Urdu", () => {
    expect(guessExpressionForUserText("Main thora tired hoon.")).toBe("concerned");
  });

  it("reacts happy to good news", () => {
    expect(guessExpressionForUserText("I got the job! I'm so happy!")).toBe("happy");
  });

  it("reacts curious to questions (Roman Urdu)", () => {
    expect(guessExpressionForUserText("Maryam, kal mujhe kya karna chahiye?")).toBe("curious");
  });

  it("reacts warm to a greeting", () => {
    expect(guessExpressionForUserText("Hi Maryam.")).toBe("warm");
    expect(guessExpressionForUserText("Maryam kya haal hai?")).toBe("curious");
  });

  it("is neutral for plain statements", () => {
    expect(guessExpressionForUserText("The meeting is at 3pm.")).toBe("neutral");
  });
});

describe("guessExpressionForAssistantText", () => {
  it("uses concern when consoling", () => {
    expect(guessExpressionForAssistantText("I'm sorry Aitzaz, that sounds rough.")).toBe("concerned");
  });

  it("uses happy for cheerful replies", () => {
    expect(guessExpressionForAssistantText("That's wonderful! I'm so glad!")).toBe("happy");
  });

  it("uses curious when asking the user something", () => {
    expect(guessExpressionForAssistantText("Do you want to talk about what happened?")).toBe("curious");
  });

  it("defaults to warm for natural replies", () => {
    expect(guessExpressionForAssistantText("Sure, I can help with that.")).toBe("warm");
  });
});
