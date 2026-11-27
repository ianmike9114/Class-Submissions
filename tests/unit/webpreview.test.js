import { describe, it, expect } from "vitest";
import { buildPreviewDoc, CONSOLE_BRIDGE, safeKind } from "../../js/webpreview.js";

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
  it("does not mistake <header> for <head>", () => {
    const out = buildPreviewDoc("<header><h1>Hi</h1></header><main>x</main>");
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out.indexOf(CONSOLE_BRIDGE)).toBeLessThan(out.indexOf("<header>"));
  });
  it("still injects right after a real <head lang>", () => {
    const out = buildPreviewDoc('<html><head lang="x"><title>t</title></head></html>');
    expect(out).toContain('<head lang="x">' + CONSOLE_BRIDGE);
  });
});

describe("CONSOLE_BRIDGE", () => {
  it("has exactly one </script>, at the very end", () => {
    expect(CONSOLE_BRIDGE.split("</script>").length).toBe(2);
    expect(CONSOLE_BRIDGE.endsWith("</script>")).toBe(true);
  });
});

describe("safeKind", () => {
  it("allowlists console kinds, else log", () => {
    for (const k of ["log", "info", "warn", "error"]) expect(safeKind(k)).toBe(k);
    expect(safeKind('x" onclick="y')).toBe("log");
    expect(safeKind(undefined)).toBe("log");
  });
});
