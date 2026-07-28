import { afterEach, describe, expect, it } from "vitest";

import {
  formatDbPoolStats,
  getDbPoolStats,
  registerDbPool,
} from "./pool-stats";

/**
 * A3: `waiting > 0` är det enda direkta beviset att instansens egen pool är
 * flaskhalsen — serversidans `pg_stat_activity` kan se frisk ut samtidigt.
 * Testerna låser att mättnad kräver BÅDE kö och fullt tak, så en enstaka
 * väntande request på en halvtom pool inte felaktigt pekas ut som orsak.
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
      saturated: false,
    });
  });

  it("kallar det mättnad bara när kö möter fullt tak", () => {
    registerDbPool(fakePool(3, 0, 7), 3);
    expect(getDbPoolStats()?.saturated).toBe(true);

    // Kö men poolen har inte nått taket → växer, inte mättad.
    registerDbPool(fakePool(2, 0, 1), 3);
    expect(getDbPoolStats()?.saturated).toBe(false);

    // Fullt tak men ingen kö → poolen räcker precis.
    registerDbPool(fakePool(3, 0, 0), 3);
    expect(getDbPoolStats()?.saturated).toBe(false);
  });
});

describe("formatDbPoolStats", () => {
  it("ger en kompakt loggrad med mättnadsmarkering", () => {
    registerDbPool(fakePool(3, 0, 7), 3);
    expect(formatDbPoolStats()).toBe("pool=3/3 idle=0 waiting=7 saturated");
  });

  it("utelämnar markeringen när poolen mår bra", () => {
    registerDbPool(fakePool(1, 1, 0), 3);
    expect(formatDbPoolStats()).toBe("pool=1/3 idle=1 waiting=0");
  });

  it("är tom sträng utan pool så anropare kan konkatenera direkt", () => {
    expect(formatDbPoolStats()).toBe("");
  });
});
