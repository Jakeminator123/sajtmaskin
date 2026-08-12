import { afterEach, describe, expect, it } from "vitest";
import {
  beginF3Finalize,
  isF3FinalizeActive,
  resetF3FinalizeActivity,
} from "./repair-blocked";

afterEach(() => {
  resetF3FinalizeActivity();
});

describe("repair-blocked — F3-finalize-grinden", () => {
  it("är öppen tills en finalize startar och stängs medan den kör", () => {
    expect(isF3FinalizeActive()).toBe(false);
    const release = beginF3Finalize();
    expect(isF3FinalizeActive()).toBe(true);
    release();
    expect(isF3FinalizeActive()).toBe(false);
  });

  it("räknar överlappande körningar så den första som blir klar inte öppnar grinden", () => {
    const releaseA = beginF3Finalize();
    const releaseB = beginF3Finalize();
    releaseA();
    expect(isF3FinalizeActive()).toBe(true);
    releaseB();
    expect(isF3FinalizeActive()).toBe(false);
  });

  it("ignorerar dubbla release-anrop i stället för att räkna ner under noll", () => {
    const releaseA = beginF3Finalize();
    const releaseB = beginF3Finalize();
    releaseA();
    releaseA();
    expect(isF3FinalizeActive()).toBe(true);
    releaseB();
    expect(isF3FinalizeActive()).toBe(false);
  });
});
