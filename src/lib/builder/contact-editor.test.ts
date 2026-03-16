import { describe, expect, it } from "vitest";
import {
  readContactDetailsDraft,
  updateContactDetailsDraft,
} from "./contact-editor";

describe("contact-editor", () => {
  it("reads the first mailto and tel values from a file", () => {
    const content = [
      '<a href="mailto:hello@example.com">hello@example.com</a>',
      '<a href="tel:+461234567">+461234567</a>',
    ].join("\n");

    expect(readContactDetailsDraft(content)).toEqual({
      email: "hello@example.com",
      phone: "+461234567",
    });
  });

  it("returns null when no contact links are present", () => {
    expect(readContactDetailsDraft("<div>No contact links here</div>")).toBeNull();
  });

  it("updates both href values and matching visible text", () => {
    const content = [
      '<a href="mailto:hello@example.com">hello@example.com</a>',
      '<a href="tel:+461234567">+461234567</a>',
    ].join("\n");

    const updated = updateContactDetailsDraft(
      content,
      { email: "hello@example.com", phone: "+461234567" },
      { email: "sales@example.com", phone: "+4687654321" },
    );

    expect(updated).toContain("mailto:sales@example.com");
    expect(updated).toContain(">sales@example.com<");
    expect(updated).toContain("tel:+4687654321");
    expect(updated).toContain(">+4687654321<");
  });
});
