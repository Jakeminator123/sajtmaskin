import { beforeEach, describe, expect, it } from "vitest";
import { readOpenClawPowers, useOpenClawStore } from "./openclaw-store";

describe("OpenClaw store assistant targeting", () => {
  beforeEach(() => {
    useOpenClawStore.setState({
      isOpen: false,
      messages: [],
      isStreaming: false,
      scopeKey: "global",
    });
  });

  it("updates the targeted assistant message instead of the last one", () => {
    const firstAssistantId = "assistant-1";
    const secondAssistantId = "assistant-2";

    useOpenClawStore.getState().addMessage({
      id: "user-1",
      role: "user",
      content: "hello",
      timestamp: 1,
    });
    useOpenClawStore.getState().addMessage({
      id: firstAssistantId,
      role: "assistant",
      content: "",
      timestamp: 2,
    });
    useOpenClawStore.getState().addMessage({
      id: secondAssistantId,
      role: "assistant",
      content: "existing",
      timestamp: 3,
    });

    useOpenClawStore.getState().updateAssistantMessage(firstAssistantId, "streamed");

    expect(useOpenClawStore.getState().messages).toEqual([
      expect.objectContaining({ id: "user-1", content: "hello" }),
      expect.objectContaining({ id: firstAssistantId, content: "streamed" }),
      expect.objectContaining({ id: secondAssistantId, content: "existing" }),
    ]);
  });

  it("leaves messages unchanged when the targeted assistant id is missing", () => {
    useOpenClawStore.getState().addMessage({
      id: "assistant-1",
      role: "assistant",
      content: "existing",
      timestamp: 1,
    });

    useOpenClawStore.getState().updateAssistantMessage("missing", "new content");

    expect(useOpenClawStore.getState().messages).toEqual([
      expect.objectContaining({ id: "assistant-1", content: "existing" }),
    ]);
  });

  it("drops a pending continuation whenever the mandate changes", () => {
    const watch = {
      chatId: "chat-1",
      versionIdAtSend: "ver-1",
      startedAt: 1,
      messageCountAtSend: 4,
      sendSeq: 3,
      sendOutcome: null,
      observedAt: Date.now() - 5000,
      observedStrong: true,
      resumedAt: null,
      quietSince: Date.now() - 5000,
    };
    useOpenClawStore.setState({ armedContinuation: watch });

    // Re-arming must not inherit the previous run's watch (Bugbot) …
    useOpenClawStore.getState().setArmedMandate({
      mode: "followups",
      remaining: 3,
      reason: "gör 3 follow-ups",
      createdAt: 2,
    });
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();

    // … and disarming must not leave one behind either.
    useOpenClawStore.setState({ armedContinuation: watch });
    useOpenClawStore.getState().setArmedMandate(null);
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();
  });

  it("lets the first builder send name the pending continuation, and only the first", () => {
    useOpenClawStore.setState({
      armedContinuation: {
        chatId: "chat-1",
        versionIdAtSend: "ver-1",
        startedAt: 1,
        messageCountAtSend: 4,
        sendSeq: null,
        sendOutcome: null,
        observedAt: null,
        observedStrong: false,
        resumedAt: null,
        quietSince: null,
      },
    });

    useOpenClawStore.getState().bindArmedContinuationSend(5);
    expect(useOpenClawStore.getState().armedContinuation?.sendSeq).toBe(5);

    // An OpenClaw-prepared send the user posts by hand during the same run must
    // not rename the turn out from under the auto-send that registered it.
    useOpenClawStore.getState().bindArmedContinuationSend(6);
    expect(useOpenClawStore.getState().armedContinuation?.sendSeq).toBe(5);
  });

  it("ignores a send id when no continuation is pending", () => {
    useOpenClawStore.setState({ armedContinuation: null });
    useOpenClawStore.getState().bindArmedContinuationSend(5);
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();
  });

  it("records the outcome of the named send only, never another sender's", () => {
    useOpenClawStore.setState({
      armedContinuation: {
        chatId: "chat-1",
        versionIdAtSend: "ver-1",
        startedAt: 1,
        messageCountAtSend: 4,
        sendSeq: 5,
        sendOutcome: null,
        observedAt: null,
        observedStrong: false,
        resumedAt: null,
        quietSince: null,
      },
    });

    // A manual retry, a catalogue insert or a plan decision can fail while the
    // autonomous turn is still running. None of them may end the mandate.
    useOpenClawStore.getState().settleArmedContinuationSend(6, "rejected");
    expect(useOpenClawStore.getState().armedContinuation?.sendOutcome).toBeNull();

    useOpenClawStore.getState().settleArmedContinuationSend(5, "rejected");
    expect(useOpenClawStore.getState().armedContinuation?.sendOutcome).toBe("rejected");
  });

  it("ignores a send outcome when no continuation is pending", () => {
    useOpenClawStore.setState({ armedContinuation: null });
    useOpenClawStore.getState().settleArmedContinuationSend(5, "started");
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();
  });

  it("resets messages and closes the panel when the scope changes", () => {
    useOpenClawStore.setState({
      isOpen: true,
      isStreaming: true,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "existing",
          timestamp: 1,
        },
      ],
      scopeKey: "/builder::builder::chat_1",
    });

    useOpenClawStore.getState().setScope("/kostnadsfri/acme::kostnadsfri");

    expect(useOpenClawStore.getState()).toMatchObject({
      isOpen: false,
      isStreaming: false,
      messages: [],
      scopeKey: "/kostnadsfri/acme::kostnadsfri",
    });
  });
});

describe("OpenClaw store — withdrawing an extra power", () => {
  const MANDATE = {
    mode: "followups" as const,
    remaining: 3,
    reason: "gör 3 follow-ups",
    createdAt: Date.now(),
  };

  const WATCH = {
    chatId: "chat-1",
    versionIdAtSend: "v-1",
    startedAt: Date.now(),
    messageCountAtSend: 2,
    sendSeq: 1,
    sendOutcome: "started" as const,
    observedAt: Date.now(),
    observedStrong: true,
    resumedAt: null,
    quietSince: Date.now(),
  };

  const FILL = { target: "builder.chat.primary", value: "fylld prompt" };

  /** A live armed run under a full grant — the state a withdrawal must clean up. */
  function armedUnderFullGrant() {
    useOpenClawStore.setState({
      editEnabled: true,
      powersOn: true,
      grantedPowers: ["armed_autonomy", "quick_edit"],
      armedMandate: MANDATE,
      armedContinuation: WATCH,
      preparedFill: FILL,
    });
  }

  beforeEach(() => {
    useOpenClawStore.setState({
      scopeKey: "global",
      editEnabled: false,
      powersOn: false,
      grantedPowers: [],
      armedMandate: null,
      armedContinuation: null,
      preparedFill: null,
    });
  });

  it("stops a running mandate when the button is released", () => {
    armedUnderFullGrant();
    useOpenClawStore.getState().setPowersOn(false);

    const state = useOpenClawStore.getState();
    expect(state.armedMandate).toBeNull();
    expect(state.armedContinuation).toBeNull();
    expect(state.preparedFill).toBeNull();
    expect(readOpenClawPowers().any).toBe(false);
  });

  it("stops a running mandate when armed autonomy alone is unticked", () => {
    armedUnderFullGrant();
    useOpenClawStore.getState().toggleGrantedPower("armed_autonomy");

    const state = useOpenClawStore.getState();
    expect(state.armedMandate).toBeNull();
    expect(state.armedContinuation).toBeNull();
    // Quick edits are still granted, so the prepared fill may stand.
    expect(readOpenClawPowers().quickEdit).toBe(true);
    expect(state.preparedFill).not.toBeNull();
  });

  it("keeps the mandate when an unrelated power is unticked", () => {
    armedUnderFullGrant();
    useOpenClawStore.getState().toggleGrantedPower("quick_edit");

    expect(useOpenClawStore.getState().armedMandate).toEqual(MANDATE);
    expect(readOpenClawPowers().armedAutonomy).toBe(true);
  });

  // A health check that dips to false and back must not silently re-grant.
  it("withdraws the grant when the env gate is lost", () => {
    armedUnderFullGrant();
    useOpenClawStore.getState().setEditEnabled(false);

    expect(useOpenClawStore.getState().grantedPowers).toEqual([]);
    expect(useOpenClawStore.getState().armedMandate).toBeNull();

    useOpenClawStore.getState().setEditEnabled(true);

    expect(useOpenClawStore.getState().powersOn).toBe(false);
    expect(readOpenClawPowers().any).toBe(false);
  });

  it("drops the grant on a scope change so it cannot follow the user to another chat", () => {
    armedUnderFullGrant();
    useOpenClawStore.getState().setScope("chat:other");

    const state = useOpenClawStore.getState();
    expect(state.powersOn).toBe(false);
    expect(state.grantedPowers).toEqual([]);
    expect(state.armedMandate).toBeNull();
  });
});
