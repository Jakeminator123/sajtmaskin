import { describe, expect, it } from "vitest"
import { landingBackgroundSemanticMode } from "./landing-background"
import { categories } from "./landing-chat-data"

function cat(id: (typeof categories)[number]["id"]) {
  return categories.find((c) => c.id === id)!
}

describe("landingBackgroundSemanticMode", () => {
  it("returns fritext when no selection and no active category", () => {
    expect(landingBackgroundSemanticMode(null, false, undefined)).toBe("fritext")
  })

  it("uses activeCategory when selectedCategory is null", () => {
    expect(landingBackgroundSemanticMode(null, false, cat("analyserad"))).toBe("analyserad")
  })

  it("prefers selectedCategory over activeCategory when both differ (controlled edge)", () => {
    expect(landingBackgroundSemanticMode("template", false, cat("fritext"))).toBe("template")
  })

  it("forces audit when isAuditMode is true", () => {
    expect(landingBackgroundSemanticMode("template", true, cat("template"))).toBe("audit")
  })

  it("maps audit id to audit without isAuditMode", () => {
    expect(landingBackgroundSemanticMode("audit", false, cat("audit"))).toBe("audit")
  })

  it("maps template and analyserad", () => {
    expect(landingBackgroundSemanticMode("template", false, undefined)).toBe("template")
    expect(landingBackgroundSemanticMode("mall", false, undefined)).toBe("template")
    expect(landingBackgroundSemanticMode("kategori", false, undefined)).toBe("template")
    expect(landingBackgroundSemanticMode("analyserad", false, undefined)).toBe("analyserad")
  })
})
