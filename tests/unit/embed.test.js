// Unit tests for js/embed.js - the link -> embeddable-URL parsing that decides
// whether a student/teacher sees a submission inline or as a plain link. A
// silent break here quietly degrades every embed in the app, so it's the
// highest-value pure module to lock down.
//
// Pure, no Firebase, no DOM. openInChromeButton() reads navigator.userAgent,
// which we stub per-case.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  extractDriveFileId,
  toEmbedUrl,
  extractFirstEmbeddableUrl,
  embedBlockFor,
  openInChromeButton,
} from "../../js/embed.js";

describe("extractDriveFileId", () => {
  it("pulls the id from a Drive file link", () => {
    expect(
      extractDriveFileId("https://drive.google.com/file/d/ABC123xyz/view?usp=sharing")
    ).toBe("ABC123xyz");
  });

  it("returns null for a non-Drive link", () => {
    expect(extractDriveFileId("https://example.com/foo")).toBeNull();
  });

  it("returns null (no throw) for null/undefined input", () => {
    expect(extractDriveFileId(null)).toBeNull();
    expect(extractDriveFileId(undefined)).toBeNull();
  });
});

describe("toEmbedUrl", () => {
  it("returns null for empty input", () => {
    expect(toEmbedUrl("")).toBeNull();
    expect(toEmbedUrl(null)).toBeNull();
  });

  it("embeds a Drive file as /preview", () => {
    expect(toEmbedUrl("https://drive.google.com/file/d/FILE1/view")).toBe(
      "https://drive.google.com/file/d/FILE1/preview"
    );
  });

  it("embeds a Drive folder as a #grid thumbnail view", () => {
    expect(
      toEmbedUrl("https://drive.google.com/drive/folders/FOLDER1?usp=sharing")
    ).toBe("https://drive.google.com/embeddedfolderview?id=FOLDER1#grid");
  });

  it("embeds Google Docs / Slides / Sheets as /preview keeping the type", () => {
    expect(toEmbedUrl("https://docs.google.com/document/d/DOC1/edit")).toBe(
      "https://docs.google.com/document/d/DOC1/preview"
    );
    expect(
      toEmbedUrl("https://docs.google.com/presentation/d/PRES1/edit#slide=1")
    ).toBe("https://docs.google.com/presentation/d/PRES1/preview");
    expect(
      toEmbedUrl("https://docs.google.com/spreadsheets/d/SHEET1/edit")
    ).toBe("https://docs.google.com/spreadsheets/d/SHEET1/preview");
  });

  it("embeds a YouTube watch URL and a youtu.be short URL", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("embeds a CodePen pen with the result tab", () => {
    expect(toEmbedUrl("https://codepen.io/jdoe/pen/abcDEF")).toBe(
      "https://codepen.io/jdoe/embed/abcDEF?default-tab=result"
    );
  });

  it("returns null for a link that doesn't embed cleanly (GitHub Gist)", () => {
    expect(toEmbedUrl("https://gist.github.com/jdoe/123abc")).toBeNull();
  });
});

describe("extractFirstEmbeddableUrl", () => {
  it("finds the first embeddable URL inside free text", () => {
    const text =
      "See the notes and this https://gist.github.com/x/1 then watch https://youtu.be/VID9 ok";
    expect(extractFirstEmbeddableUrl(text)).toBe("https://youtu.be/VID9");
  });

  it("returns null when no URL is embeddable", () => {
    expect(
      extractFirstEmbeddableUrl("just plain text, no links here")
    ).toBeNull();
    expect(extractFirstEmbeddableUrl("")).toBeNull();
  });
});

describe("embedBlockFor", () => {
  // embedBlockFor's plain-link fallback calls openInChromeButton, which reads
  // navigator.userAgent. In a real browser navigator always exists; under Node
  // it only exists on v21+, so stub a non-Android UA to keep this deterministic
  // across Node versions (the button is Android-only, so it stays absent here).
  beforeEach(() => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an iframe for an embeddable link", () => {
    const html = embedBlockFor("https://youtu.be/VID9");
    expect(html).toContain("<iframe");
    expect(html).toContain("https://www.youtube.com/embed/VID9");
    expect(html).toContain('class="submission-preview"');
  });

  it("adds the variant class when given one", () => {
    const html = embedBlockFor("https://youtu.be/VID9", { variant: "material" });
    expect(html).toContain('class="submission-preview material"');
  });

  it("falls back to a plain link (with the given label) for non-embeddable links", () => {
    const html = embedBlockFor("https://gist.github.com/x/1", { label: "Open gist" });
    expect(html).toContain("<a href=");
    expect(html).toContain("Open gist");
    expect(html).not.toContain("<iframe");
  });

  it("returns empty string for no link", () => {
    expect(embedBlockFor("")).toBe("");
    expect(embedBlockFor(null)).toBe("");
  });
});

describe("openInChromeButton (UA-dependent)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing off Android", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone)" });
    expect(openInChromeButton("https://example.com/x")).toBe("");
  });

  it("renders an Open-in-Chrome button on Android", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 13)" });
    const html = openInChromeButton("https://example.com/x");
    expect(html).toContain("Open in Chrome");
    expect(html).toContain("data-open-chrome-bare=");
    // the scheme is stripped before it's stored (re-added as intent:// on click)
    expect(html).toContain(encodeURIComponent("example.com/x"));
  });
});
