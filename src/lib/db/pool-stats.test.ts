import { afterEach, describe, expect, it } from "vitest";

import {
  formatDbPoolStats,
  getDbPoolStats,
  registerDbPool,
} from "./pool-stats";

/**
 * A3: instansens egen pool kan vara flaskhalsen samtidigt som serversidans
 * `pg_stat_activity` ser frisk ut. Testerna låser att `atCeiling` — inte
 * ködjupet — är den bärande signalen, eftersom den request som timeoutar redan
 * är borttagen ur kön när felet loggas: en tom kö får inte läsas som "poolen
 * mådde bra".
 */

function fakePool(total: number, idle: number, waiting: number) {
  return { totalCount: total, idleCount: idle, waitingCount: waiting };
}

afterEach(() => {
  registerDbPool(null, 0);
});

describe("getDbPoolStats", () => {
  it("är null när ingen pool registrerats (build-fas, test, ingen DB-config)", () => {
    expect(getDbPoolStats()).toBeNull();
  });

  it("rapporterar taket tillsammans med de levande siffrorna", () => {
    registerDbPool(fakePool(3, 1, 0), 3);

    expect(getDbPoolStats()).toEqual({
      max: 3,
      total: 3,
      idle: 1,
      waiting: 0,
      atCeiling: true,
    });
  });

  // Regression: `atCeiling` får INTE kräva `waiting > 0`. `pg` plockar bort den
  // timeoutade requesten ur kön innan felet når oss, så ködjupet kan vara 0
  // exakt när vi loggar — ett krav på kö hade gjort mätningen falskt negativ i
  // just det fallet den finns för.
  it("står kvar vid taket även när kön hunnit tömmas", () => {
    registerDbPool(fakePool(3, 0, 0), 3);
    expect(getDbPoolStats()?.atCeiling).toBe(true);
  });

  it("är inte vid taket när poolen fortfarande kan växa", () => {
    registerDbPool(fakePool(2, 0, 1), 3);
    expect(getDbPoolStats()?.atCeiling).toBe(false);
  });

  it("kallar inte en oregistrerad pool för full", () => {
    registerDbPool(fakePool(0, 0, 0), 0);
    expect(getDbPoolStats()?.atCeiling).toBe(false);
  });
});

describe("formatDbPoolStats", () => {
  it("ger en kompakt loggrad med takmarkering", () => {
    registerDbPool(fakePool(3, 0, 7), 3);
    expect(formatDbPoolStats()).toBe("pool=3/3 idle=0 waiting=7 at-ceiling");
  });

  it("utelämnar markeringen när poolen har utrymme kvar", () => {
    registerDbPool(fakePool(1, 1, 0), 3);
    expect(formatDbPoolStats()).toBe("pool=1/3 idle=1 waiting=0");
  });

  it("är tom sträng utan pool så anropare kan konkatenera direkt", () => {
    expect(formatDbPoolStats()).toBe("");
  });
});
