import { describe, expect, it, vi, beforeEach } from "vitest";

const generateObjectMock = vi.hoisted(() => vi.fn());
const createDirectModelMock = vi.hoisted(() => vi.fn(() => ({ id: "mock-model" })));

vi.mock("ai", () => ({
  generateObject: generateObjectMock,
}));

vi.mock("@/lib/builder/direct-model", () => ({
  createDirectModel: createDirectModelMock,
}));

import { llmClassifyFollowUpIntent } from "./follow-up-intent-llm-classifier";

describe("llmClassifyFollowUpIntent", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
    createDirectModelMock.mockClear();
    createDirectModelMock.mockReturnValue({ id: "mock-model" });
  });

  it("returns the parsed intent label for a valid response", async () => {
    generateObjectMock.mockResolvedValue({ object: { intent: "clear-redesign" } });
    const result = await llmClassifyFollowUpIntent("gör om hela sajten från grunden");
    expect(result).toBe("clear-redesign");
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("short-circuits empty messages to neutral without calling the model", async () => {
    const result = await llmClassifyFollowUpIntent("   ");
    expect(result).toBe("neutral");
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(createDirectModelMock).not.toHaveBeenCalled();
  });

  it("throws on an unexpected intent label so the caller can fall back", async () => {
    generateObjectMock.mockResolvedValue({ object: { intent: "totally-bogus" } });
    await expect(
      llmClassifyFollowUpIntent("byt hero-bilden"),
    ).rejects.toThrow(/unexpected intent label/);
  });

  it("propagates provider errors (fail-safe contract is enforced by the caller)", async () => {
    generateObjectMock.mockRejectedValue(new Error("rate_limit_exceeded"));
    await expect(
      llmClassifyFollowUpIntent("lägg till en bokningsknapp"),
    ).rejects.toThrow(/rate_limit_exceeded/);
  });

  it("uses an explicit model override when provided", async () => {
    generateObjectMock.mockResolvedValue({ object: { intent: "neutral" } });
    await llmClassifyFollowUpIntent("hej", { model: "openai/gpt-5-nano" });
    expect(createDirectModelMock).toHaveBeenCalledWith("openai/gpt-5-nano");
  });
});
