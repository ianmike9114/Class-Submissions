import { describe, it, expect } from "vitest";
import { buildPreviewDoc, CONSOLE_BRIDGE } from "../../js/webpreview.js";

describe("buildPreviewDoc", () => {
  it("puts the console bridge before learner code in <head>", () => {
    const out = buildPreviewDoc("<html><head><title>x</title></head><body><p>hi</p></body></html>");
    expect(out.indexOf(CONSOLE_BRIDGE)).toBeGreaterThan(-1);
    expect(out.indexOf(CONSOLE_BRIDGE)).toBeLessThan(out.indexOf("<title>"));
    expect(out).toContain("<p>hi</p>");
  });
  it("wraps a fragment that has no <head>", () => {
    const out = buildPreviewDoc("<h1>Hello</h1>");
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out).toContain(CONSOLE_BRIDGE);
    expect(out).toContain("<h1>Hello</h1>");
  });
  it("handles empty input", () => {
    expect(buildPreviewDoc("")).toContain(CONSOLE_BRIDGE);
  });
});
