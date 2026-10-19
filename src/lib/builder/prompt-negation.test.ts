import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { hasNegatedTerms, isTermFullyNegated } from "./prompt-negation";

const WEBGL = /WebGL/iu;

describe("prompt-negation clause period", () => {
  it("keeps a following term negated after Three.js", () => {
    const prompt = "Använd ingen Three.js eller WebGL-scen.";
    assert.equal(isTermFullyNegated(prompt, /Three\.js/iu), true);
    assert.equal(isTermFullyNegated(prompt, WEBGL), true);
    assert.equal(hasNegatedTerms(prompt, [WEBGL]), true);
  });

  it("keeps a following term negated after Auth.js or a dotted host", () => {
    const auth = "Använd ingen Auth.js eller WebGL-scen.";
    const host = "Använd ingen preview.example.com eller WebGL-scen.";
    assert.equal(isTermFullyNegated(auth, /Auth\.js/iu), true);
    assert.equal(isTermFullyNegated(auth, WEBGL), true);
    assert.equal(hasNegatedTerms(auth, [/Auth\.js/iu, WEBGL]), true);
    assert.equal(isTermFullyNegated(host, /preview\.example\.com/iu), true);
    assert.equal(isTermFullyNegated(host, WEBGL), true);
    assert.equal(hasNegatedTerms(host, [WEBGL]), true);
  });

  it("treats a real following sentence as positive", () => {
    const english = "No 3D. Build WebGL.";
    const swedish = "Använd ingen Three.js. Bygg en WebGL-scen.";
    assert.equal(isTermFullyNegated(english, WEBGL), false);
    assert.equal(hasNegatedTerms(english, [WEBGL]), false);
    assert.equal(isTermFullyNegated(swedish, /Three\.js/iu), true);
    assert.equal(isTermFullyNegated(swedish, WEBGL), false);
    assert.equal(hasNegatedTerms(swedish, [WEBGL]), false);
  });

  it("still ends the window at men, but, newline, and comma-imperative", () => {
    const cases = [
      "Använd ingen Three.js eller canvas men bygg WebGL.",
      "No Auth.js or canvas but build WebGL.",
      "Använd ingen preview.example.com eller canvas\nBygg WebGL.",
      "lägg inte till Three.js eller canvas, bygg en WebGL-scen.",
    ];
    for (const prompt of cases) {
      assert.equal(isTermFullyNegated(prompt, /canvas/iu), true, prompt);
      assert.equal(hasNegatedTerms(prompt, [/canvas/iu]), true, prompt);
      assert.equal(isTermFullyNegated(prompt, WEBGL), false, prompt);
      assert.equal(hasNegatedTerms(prompt, [WEBGL]), false, prompt);
    }
  });

  it("counts a term as positive when it is both negated and asserted", () => {
    const prompt = "Bygg en WebGL-scen. Använd ingen Three.js eller WebGL.";
    assert.equal(isTermFullyNegated(prompt, WEBGL), false);
    assert.equal(hasNegatedTerms(prompt, [WEBGL]), true);
    assert.equal(isTermFullyNegated(prompt, /Three\.js/iu), true);
  });
});
