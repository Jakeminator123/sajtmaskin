import { describe, expect, it } from "vitest";
import { INITIAL_STUDIO_STATE, studioReducer, type StudioState } from "./use-studio";

/** Kör ett pågående bygge till slut (alla steg). */
function finishBuild(state: StudioState, at = 1_000): StudioState {
  let next = state;
  let guard = 0;
  while (next.pending && guard < 20) {
    next = studioReducer(next, { type: "advance", at });
    guard += 1;
  }
  return next;
}

function submit(state: StudioState, prompt: string, at = 0): StudioState {
  return studioReducer(state, { type: "submit", prompt, target: null, at });
}

describe("builder-lab studioReducer", () => {
  it("lägger ändringar som skickas under ett bygge i kö och kör dem efteråt", () => {
    let state = submit(INITIAL_STUDIO_STATE, "Ett kafé som heter Kaffekoppen");
    state = submit(state, "Lägg till bokning");

    expect(state.queue).toHaveLength(1);
    const queued = state.messages.find((m) => m.role === "user" && m.text === "Lägg till bokning");
    expect(queued && queued.role === "user" ? queued.status : null).toBe("queued");

    // Första bygget blir klart: v1 sparas och köade ändringen startar direkt.
    state = studioReducer(state, { type: "advance", at: 1 });
    while (state.pending?.version.id === "v1")
      state = studioReducer(state, { type: "advance", at: 2 });
    expect(state.versions.map((v) => v.id)).toEqual(["v1"]);
    expect(state.pending?.version.id).toBe("v2");
    expect(state.queue).toHaveLength(0);

    state = finishBuild(state);
    expect(state.versions.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(state.versions[1].content.booking).toBe(true);
    const sent = state.messages.find((m) => m.role === "user" && m.text === "Lägg till bokning");
    expect(sent && sent.role === "user" ? sent.status : "x").toBeUndefined();
  });

  it("avbryt stoppar bygget, tömmer kön och markerar byggkortet", () => {
    let state = finishBuild(submit(INITIAL_STUDIO_STATE, "Ett kafé"));
    state = submit(state, "Gör den mörkare");
    state = submit(state, "Ny rubrik");
    state = studioReducer(state, { type: "cancel" });

    expect(state.pending).toBeNull();
    expect(state.queue).toHaveLength(0);
    expect(state.versions).toHaveLength(1);
    const build = state.messages.filter((m) => m.role === "build").at(-1);
    expect(build && build.role === "build" ? build.cancelled : false).toBe(true);
    const dropped = state.messages.find((m) => m.role === "user" && m.text === "Ny rubrik");
    expect(dropped && dropped.role === "user" ? dropped.status : null).toBe("dropped");
  });

  it("en ändring från en äldre version får nästa lediga nummer och rätt förälder", () => {
    let state = finishBuild(submit(INITIAL_STUDIO_STATE, "Ett kafé"));
    state = finishBuild(submit(state, "Lägg till bokning"));
    state = studioReducer(state, { type: "selectVersion", id: "v1" });
    state = finishBuild(submit(state, "Ny rubrik"));

    expect(state.versions.map((v) => v.id)).toEqual(["v1", "v2", "v3"]);
    expect(state.versions[2].parentId).toBe("v1");
    expect(state.versions[2].content.booking).toBe(false);
  });
  it("avbrutet första bygge lämnar inget projektnamn efter sig", () => {
    let state = submit(INITIAL_STUDIO_STATE, "Ett kafé som heter Kaffekoppen");
    expect(state.projectName).toBe("Kaffekoppen");
    state = studioReducer(state, { type: "cancel" });
    expect(state.projectName).toBe(INITIAL_STUDIO_STATE.projectName);
    expect(state.versions).toHaveLength(0);
  });

  it("behåller ett manuellt projektnamn när första bygget avbryts", () => {
    let state = submit(INITIAL_STUDIO_STATE, "Ett kafé som heter Kaffekoppen");
    state = studioReducer(state, { type: "set", patch: { projectName: "Mitt kafé" } });
    state = studioReducer(state, { type: "cancel" });
    expect(state.projectName).toBe("Mitt kafé");
    expect(state.versions).toHaveLength(0);
  });

  it("återställer fortfarande automatiskt namn efter en oförändrad namnredigering", () => {
    let state = submit(INITIAL_STUDIO_STATE, "Ett kafé som heter Kaffekoppen");
    state = studioReducer(state, { type: "set", patch: { projectName: state.projectName } });
    state = studioReducer(state, { type: "cancel" });
    expect(state.projectName).toBe(INITIAL_STUDIO_STATE.projectName);
  });

  it("Fråga-läget stänger en öppen sektionsredigerare", () => {
    let state = finishBuild(submit(INITIAL_STUDIO_STATE, "Ett kafé"));
    state = studioReducer(state, {
      type: "set",
      patch: { composerMode: "ask", inspect: true, selectedSection: "hero" },
    });
    state = submit(state, "Vad tycker du om rubriken?");
    expect(state.selectedSection).toBeNull();
    expect(state.inspect).toBe(false);
    expect(state.pending).toBeNull();
  });
});
