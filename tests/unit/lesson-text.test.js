// Unit tests for js/lesson-text.js's pure helpers - the slide-XML text pull
// and the even trim that keeps the AI quiz prompt under the size cap. The
// PDF/PPTX loaders themselves need pdf.js/JSZip from CDN, so they're covered
// by the manual browser check instead.

import { describe, it, expect } from "vitest";
import { slideXmlText, trimUnitsEvenly } from "../../js/lesson-text.js";

describe("slideXmlText", () => {
  it("keeps one line per paragraph and joins runs inside a paragraph", () => {
    const xml = '<p:sld><a:p><a:r><a:t>Phishing </a:t></a:r><a:r><a:t xml:lang="en">attacks</a:t></a:r></a:p>'
      + "<a:p><a:r><a:t>Use 2FA</a:t></a:r></a:p></p:sld>";
    expect(slideXmlText(xml)).toBe("Phishing attacks\nUse 2FA");
  });
  it("decodes XML entities", () => {
    const xml = "<a:p><a:r><a:t>Q&amp;A &lt;html&gt; &quot;hi&quot; it&apos;s &#233;&#x41;</a:t></a:r></a:p>";
    expect(slideXmlText(xml)).toBe("Q&A <html> \"hi\" it's éA");
  });
  it("treats line breaks as spaces and drops slide-number placeholders", () => {
    const xml = "<a:p><a:r><a:t>Line one</a:t></a:r><a:br/><a:r><a:t>line two</a:t></a:r></a:p>"
      + "<a:p><a:r><a:t>12</a:t></a:r></a:p>";
    expect(slideXmlText(xml)).toBe("Line one line two");
  });
  it("returns empty text for an empty slide", () => {
    expect(slideXmlText("<p:sld><a:p></a:p></p:sld>")).toBe("");
    expect(slideXmlText("")).toBe("");
  });
});

describe("trimUnitsEvenly", () => {
  it("leaves text under the cap untouched", () => {
    expect(trimUnitsEvenly(["abc", "de"], 100)).toEqual(["abc", "de"]);
  });
  it("keeps short units whole and shares the rest among long ones", () => {
    const out = trimUnitsEvenly(["short", "x".repeat(100), "y".repeat(100)], 65);
    expect(out[0]).toBe("short");
    expect(out[1]).toBe("x".repeat(30) + " ...");
    expect(out[2]).toBe("y".repeat(30) + " ...");
  });
  it("never cuts only the last pages - every long unit gets a share", () => {
    const out = trimUnitsEvenly(Array(10).fill("z".repeat(50)), 100);
    out.forEach((u) => expect(u.startsWith("z".repeat(10))).toBe(true));
  });
});
