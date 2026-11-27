import { describe, it, expect } from "vitest";
import { CODE_LANGS, langOf } from "../../js/code-langs.js";

describe("langOf", () => {
  it("defaults old assignments (no codeLang) to java", () => {
    expect(langOf({ allowedFileTypes: "code" })).toBe("java");
    expect(langOf(null)).toBe("java");
  });
  it("returns a known codeLang", () => {
    expect(langOf({ codeLang: "csharp" })).toBe("csharp");
    expect(langOf({ codeLang: "web" })).toBe("web");
  });
  it("falls back to java for an unknown value", () => {
    expect(langOf({ codeLang: "cobol" })).toBe("java");
  });
});

describe("CODE_LANGS", () => {
  it("run languages have a Wandbox compiler, preview ones do not", () => {
    expect(CODE_LANGS.java.compiler).toBe("openjdk-jdk-21+35");
    expect(CODE_LANGS.csharp.compiler).toBe("mono-6.12.0.199");
    expect(CODE_LANGS.web.mode).toBe("preview");
    expect(CODE_LANGS.web.compiler).toBeUndefined();
  });
});
