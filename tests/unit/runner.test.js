// Unit tests for js/runner.js.
//
// stripTopLevelPublic() is the correctness-critical bit: Wandbox saves source
// as prog.java, so a top-level `public class Foo` fails ("should be in a file
// named Foo.java"). We must strip `public` off top-level type declarations but
// NEVER off `public static`/`public void`/members, or student code breaks.
//
// runJava() is exercised with a mocked fetch so no real Wandbox call is made
// (fast, offline, deterministic) - we only assert its never-throws contract.

import { describe, it, expect, afterEach, vi } from "vitest";
import { stripTopLevelPublic, runJava } from "../../js/runner.js";

describe("stripTopLevelPublic", () => {
  it("strips public from a top-level class", () => {
    expect(stripTopLevelPublic("public class Main {}")).toBe("class Main {}");
  });

  it("strips public from interface/enum/record too", () => {
    expect(stripTopLevelPublic("public interface I {}")).toBe("interface I {}");
    expect(stripTopLevelPublic("public enum E {}")).toBe("enum E {}");
    expect(stripTopLevelPublic("public record R() {}")).toBe("record R() {}");
  });

  it("does NOT touch public static / public void members", () => {
    const src =
      "class Main {\n  public static void main(String[] a) {}\n  public void run() {}\n}";
    expect(stripTopLevelPublic(src)).toBe(src);
  });

  it("strips only the type keyword, leaving members intact", () => {
    const src = "public class Main {\n  public static void main(String[] a) {}\n}";
    const out = stripTopLevelPublic(src);
    expect(out.startsWith("class Main")).toBe(true);
    expect(out).toContain("public static void main");
  });

  it("handles a file with no public modifier unchanged", () => {
    const src = "class Helper {}";
    expect(stripTopLevelPublic(src)).toBe(src);
  });
});

describe("runJava (mocked fetch, never throws)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects empty source without calling the network", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    return runJava("   ").then((r) => {
      expect(r.ok).toBe(false);
      expect(r.output).toMatch(/paste your Java code/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it("returns a friendly message (not a throw) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await runJava("class Main {}");
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/couldn't reach the code runner/i);
  });

  it("returns a busy message on HTTP 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 })
    );
    const r = await runJava("class Main {}");
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/busy/i);
  });

  it("parses a successful Wandbox response (status 0)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "0", program_output: "Hello\n" }),
      })
    );
    const r = await runJava("public class Main {}");
    expect(r.ok).toBe(true);
    expect(r.output).toBe("Hello");
  });

  it("surfaces compiler errors with ok=false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "1", compiler_error: "error: ';' expected" }),
      })
    );
    const r = await runJava("class Main { int x }");
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/expected/);
  });
});
