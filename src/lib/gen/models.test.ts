import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chat = vi.fn((id: string) => ({ endpoint: "chat", id }));
  const responses = vi.fn((id: string) => ({ endpoint: "responses", id }));
  Object.assign(chat, { responses });
  return {
    chat,
    responses,
    createOpenAI: vi.fn(() => chat),
  };
});

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mocks.createOpenAI,
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(),
}));

import { getOpenAIModel } from "./models";

describe("getOpenAIModel", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    mocks.chat.mockClear();
    mocks.responses.mockClear();
  });

  it("pins the Responses API for every registered GPT-6 and GPT-5.6 model", () => {
    const ids = ["gpt-6.1-sol", "gpt-6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
    for (const id of ids) {
      expect(getOpenAIModel(id)).toEqual({ endpoint: "responses", id });
    }
    expect(mocks.responses).toHaveBeenCalledTimes(ids.length);
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("keeps older OpenAI models on the provider default", () => {
    expect(getOpenAIModel("gpt-5.5")).toEqual({
      endpoint: "chat",
      id: "gpt-5.5",
    });
    expect(mocks.chat).toHaveBeenCalledWith("gpt-5.5");
    expect(mocks.responses).not.toHaveBeenCalled();
  });
});
