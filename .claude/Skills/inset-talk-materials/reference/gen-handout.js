// Participant Handout (Taglish, English-dominant) — INSET workshop, printable
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LevelFormat
} = require("docx");

const NAVY = "14304A", TEAL = "2A9D8F", GOLD = "B27A18", MUTE = "5B6B78", CORAL = "C0492F", INK = "222B33";
const APP = "deped-class-submissions.vercel.app";

const t = (text, o = {}) => new TextRun({ text, font: "Calibri", size: 24, color: INK, ...o });

// One numbered step = big number cell + instruction cell
function step(num, headRuns, subRuns) {
  const numCell = new TableCell({
    width: { size: 900, type: WidthType.DXA }, verticalAlign: "center",
    margins: { top: 100, bottom: 100, left: 80, right: 80 },
    shading: { type: ShadingType.CLEAR, fill: TEAL },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(num), font: "Cambria", bold: true, size: 52, color: "FFFFFF" })] })]
  });
  const bodyKids = [new Paragraph({ spacing: { after: subRuns ? 40 : 0, line: 264 }, children: headRuns })];
  if (subRuns) bodyKids.push(new Paragraph({ spacing: { after: 0, line: 252 }, children: subRuns }));
  const bodyCell = new TableCell({
    width: { size: 8940, type: WidthType.DXA }, verticalAlign: "center",
    margins: { top: 120, bottom: 120, left: 200, right: 160 },
    shading: { type: ShadingType.CLEAR, fill: "F4F8FB" },
    children: bodyKids
  });
  return new Table({
    columnWidths: [900, 8940], width: { size: 9840, type: WidthType.DXA },
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: "FFFFFF" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "FFFFFF" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [numCell, bodyCell] })]
  });
}
const gap = (h = 90) => new Paragraph({ spacing: { after: h }, children: [] });

// "Fill this in" box for the facilitator to write the join code + tape a QR
function joinBox() {
  const left = new TableCell({
    width: { size: 6140, type: WidthType.DXA }, verticalAlign: "center",
    margins: { top: 160, bottom: 160, left: 220, right: 160 },
    children: [
      new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "WEBSITE", font: "Calibri", bold: true, size: 18, color: MUTE, characterSpacing: 30 })] }),
      new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: APP, font: "Cambria", bold: true, size: 30, color: NAVY })] }),
      new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "JOIN CODE", font: "Calibri", bold: true, size: 18, color: MUTE, characterSpacing: 30 })] }),
      new Paragraph({ children: [new TextRun({ text: "_ _ _ _ _", font: "Cambria", bold: true, size: 44, color: TEAL })] })
    ]
  });
  const right = new TableCell({
    width: { size: 3700, type: WidthType.DXA }, verticalAlign: "center",
    margins: { top: 120, bottom: 120, left: 120, right: 120 },
    borders: { top: { style: BorderStyle.DASHED, size: 6, color: TEAL }, bottom: { style: BorderStyle.DASHED, size: 6, color: TEAL }, left: { style: BorderStyle.DASHED, size: 6, color: TEAL }, right: { style: BorderStyle.DASHED, size: 6, color: TEAL } },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 80 }, children: [new TextRun({ text: "📷", font: "Segoe UI Emoji", size: 44 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: "Tape / paste the section QR here", font: "Calibri", italics: true, size: 18, color: MUTE })] })
    ]
  });
  return new Table({
    columnWidths: [6140, 3700], width: { size: 9840, type: WidthType.DXA },
    borders: { top: { style: BorderStyle.SINGLE, size: 12, color: NAVY }, bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY }, left: { style: BorderStyle.SINGLE, size: 12, color: NAVY }, right: { style: BorderStyle.SINGLE, size: 12, color: NAVY }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D9E2EB" } },
    rows: [new TableRow({ children: [left, right] })]
  });
}

// Small "if stuck" table
function trow(sym, fix, shade) {
  const cell = (txt, w, bold = false) => new TableCell({ width: { size: w, type: WidthType.DXA }, margins: { top: 70, bottom: 70, left: 140, right: 140 }, shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined, children: [new Paragraph({ children: [new TextRun({ text: txt, font: "Calibri", size: 20, bold, color: INK })] })] });
  return new TableRow({ children: [cell(sym, 3900, true), cell(fix, 5940)] });
}
const stuck = new Table({
  columnWidths: [3900, 5940], width: { size: 9840, type: WidthType.DXA },
  borders: { top: { style: BorderStyle.SINGLE, size: 4, color: "E7EEF5" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "E7EEF5" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "EEF3F8" }, insideVertical: { style: BorderStyle.NONE } },
  rows: [
    trow("Blank screen / hindi mag-sign in", "You're inside the Messenger/FB browser. Open the link sa Chrome o Safari.", "F4F8FB"),
    trow("Hindi ma-scan ang QR", "Just type the 5-character join code manually."),
    trow("Wala akong makitang class", "Refresh the page — walang auto-update ang app.", "F4F8FB"),
    trow("Wala ang pangalan ko sa list", "Pick any name muna — practice lang 'to.")
  ]
});

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 24 } } } },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 900, bottom: 720, left: 1200, right: 1200 } } },
    children: [
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "INSET WORKSHOP · PARTICIPANT HANDOUT", font: "Calibri", bold: true, color: TEAL, size: 20, characterSpacing: 40 })] }),
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Try It Yourself: Join & Submit in 4 Steps", font: "Cambria", bold: true, color: NAVY, size: 44 })] }),
      new Paragraph({ spacing: { after: 200, line: 264 }, children: [t("Today you're the student. Follow these 4 steps sa phone ninyo — mag-join sa class, tapos mag-submit ng output. Ganito rin kadali ang mararanasan ng estudyante ninyo.", { color: "33414C" })] }),

      joinBox(),
      gap(200),

      step(1, [t("Open your browser — Chrome or Safari.", { bold: true }), t("  Go to ", {}), t(APP, { bold: true, color: NAVY })],
              [t("Wag sa Messenger o Facebook browser — hindi doon gumagana ang Google sign-in.", { size: 20, color: MUTE })]),
      gap(),
      step(2, [t("Tap ", {}), t("“Sign in with Google”", { bold: true }), t(" and pick your Gmail.", {})],
              [t("Normal lang na student view ang lalabas — yun mismo ang makikita ng bata.", { size: 20, color: MUTE })]),
      gap(),
      step(3, [t("Join the class — ", {}), t("scan the QR", { bold: true }), t(" or type the ", {}), t("join code", { bold: true }), t(" above.", {})],
              [t("Tapos pick your name sa roster kung may lalabas na listahan.", { size: 20, color: MUTE })]),
      gap(),
      step(4, [t("Open the assignment, ", {}), t("paste any link", { bold: true }), t(" or ", {}), t("add a photo", { bold: true }), t(", then tap ", {}), t("Submit", { bold: true }), t(". Done! 🎉", {})],
              [t("Any link okay — Google, YouTube, kahit ano. Pwede mong bawiin habang “pending” pa.", { size: 20, color: MUTE })]),
      gap(220),

      new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "After you submit", font: "Cambria", bold: true, color: NAVY, size: 26 })] }),
      new Paragraph({ spacing: { after: 220, line: 264 }, children: [t("Wait lang sandali, the teacher will grade it live. "), t("Refresh your phone", { bold: true }), t(" to see your score and feedback appear. Yun ang buong loop: submit, grade, feedback, nakita agad.")] }),

      new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "If you get stuck", font: "Cambria", bold: true, color: NAVY, size: 26 })] }),
      stuck,

      new Paragraph({ spacing: { before: 300 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "D9E2EB", space: 8 } }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Wag mag-alala kung hindi perfect — practice lang 'to. Kaya ninyo 'yan! 🙌", font: "Calibri", italics: true, size: 22, color: MUTE })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  const out = "D:/Desktop/INSET-Talk/INSET-Workshop-Participant-Handout-Taglish.docx";
  fs.writeFileSync(out, buf); console.log("WROTE:", out);
});
