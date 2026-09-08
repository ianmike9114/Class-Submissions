// Workshop Facilitator Guide (Taglish, English-dominant) — INSET hands-on hour
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak, LevelFormat
} = require("docx");

const NAVY = "14304A", TEAL = "2A9D8F", GOLD = "B27A18", MUTE = "5B6B78", CORAL = "C0492F", GREEN = "3B7A57";
const APP = "deped-class-submissions.vercel.app";

const H1 = (txt) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 120 }, children: [new TextRun({ text: txt, font: "Cambria", color: NAVY, bold: true, size: 32 })] });
const H2 = (txt) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D9E2EB", space: 6 } }, children: [new TextRun({ text: txt, font: "Cambria", color: NAVY, bold: true, size: 26 })] });
const t = (text, o = {}) => new TextRun({ text, font: "Calibri", size: 22, color: "222B33", ...o });
const P = (runs, opts = {}) => new Paragraph({ spacing: { after: 120, line: 276 }, ...opts, children: Array.isArray(runs) ? runs : [runs] });
const label = (text, color = TEAL) => new TextRun({ text, font: "Calibri", size: 22, bold: true, color });
const chk = (text, extra = []) => new Paragraph({ numbering: { reference: "c", level: 0 }, spacing: { after: 70, line: 264 }, children: [t(text), ...extra] });
const numbered = (text, extra = []) => new Paragraph({ numbering: { reference: "n", level: 0 }, spacing: { after: 70, line: 268 }, children: [t(text), ...extra] });

function callout(titleText, lines, fill = "EAF3EF", bar = GREEN) {
  const kids = [new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: titleText, font: "Calibri", bold: true, size: 22, color: bar })] })];
  lines.forEach(l => kids.push(new Paragraph({ spacing: { after: 40, line: 264 }, children: Array.isArray(l) ? l : [t(l)] })));
  return new Table({
    columnWidths: [9840], width: { size: 9840, type: WidthType.DXA },
    borders: { top: { style: BorderStyle.SINGLE, size: 12, color: bar }, bottom: { style: BorderStyle.SINGLE, size: 4, color: bar }, left: { style: BorderStyle.SINGLE, size: 24, color: bar }, right: { style: BorderStyle.SINGLE, size: 4, color: bar }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [new TableCell({ width: { size: 9840, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill }, margins: { top: 120, bottom: 120, left: 200, right: 160 }, children: kids })] })]
  });
}

// timing table
function row(time, phase, mins, shade) {
  const cell = (txt, w, bold = false, al = AlignmentType.LEFT) => new TableCell({ width: { size: w, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined, children: [new Paragraph({ alignment: al, children: [new TextRun({ text: txt, font: "Calibri", size: 20, bold, color: "222B33" })] })] });
  return new TableRow({ children: [cell(time, 1700, true, AlignmentType.CENTER), cell(phase, 6300), cell(mins, 1300, false, AlignmentType.CENTER)] });
}
const timing = new Table({
  columnWidths: [1700, 6300, 1300], width: { size: 9300, type: WidthType.DXA },
  borders: { top: { style: BorderStyle.SINGLE, size: 4, color: "D9E2EB" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9E2EB" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E7EEF5" }, insideVertical: { style: BorderStyle.NONE } },
  rows: [
    new TableRow({ tableHeader: true, children: ["Time", "What happens", "Length"].map((h, i) => new TableCell({ width: { size: [1700, 6300, 1300][i], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: NAVY }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ alignment: i === 1 ? AlignmentType.LEFT : AlignmentType.CENTER, children: [new TextRun({ text: h, font: "Calibri", size: 20, bold: true, color: "FFFFFF" })] })] })) }),
    row("0–10", "Setup — everyone opens the app at mag-sign in (student view)", "10 min", "F1F5FA"),
    row("10–25", "Join — scan the QR o enter ang join code, pick a name", "15 min"),
    row("25–45", "Submit — each one submits a link/photo; show them arriving sa projector", "20 min", "F1F5FA"),
    row("45–55", "Teacher-side reveal — grade live; 1–2 volunteers try the teacher view", "10 min"),
    row("55–60", "Debrief — 'design your own next' + Q&A", "5 min", "F1F5FA")
  ]
});

// troubleshooting table
function trow(sym, fix, shade) {
  const cell = (txt, w, bold = false) => new TableCell({ width: { size: w, type: WidthType.DXA }, margins: { top: 70, bottom: 70, left: 120, right: 120 }, shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined, children: [new Paragraph({ children: [new TextRun({ text: txt, font: "Calibri", size: 20, bold, color: "222B33" })] })] });
  return new TableRow({ children: [cell(sym, 4100, true), cell(fix, 5200)] });
}
const trouble = new Table({
  columnWidths: [4100, 5200], width: { size: 9300, type: WidthType.DXA },
  borders: { top: { style: BorderStyle.SINGLE, size: 4, color: "D9E2EB" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9E2EB" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E7EEF5" }, insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "E7EEF5" } },
  rows: [
    new TableRow({ tableHeader: true, children: ["Symptom (sabi ng teacher)", "Fix"].map((h, i) => new TableCell({ width: { size: [4100, 5200][i], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: NAVY }, margins: { top: 70, bottom: 70, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: h, font: "Calibri", size: 20, bold: true, color: "FFFFFF" })] })] })) }),
    trow("“Blank screen / hindi mag-sign in.”", "Opened inside a Messenger/FB/IG in-app browser. Copy the link, open it sa Chrome o Safari. Google blocks OAuth sa in-app WebView — hindi ma-bypass.", "F1F5FA"),
    trow("“Wala akong nakikitang class / list.”", "The app has no real-time refresh — i-refresh lang ang page. Make sure tama ang join code."),
    trow("“Wala ang pangalan ko sa roster.”", "Pick the correct section. Kung walang naka-set na roster, it uses the Google account name — okay lang para sa practice.", "F1F5FA"),
    trow("“Hindi ma-scan ang QR.”", "Just type the 5-character join code manually."),
    trow("“Ang bagal / hindi ma-submit ang photo.”", "The photo is auto-compressed, pero kung mahina ang signal, submit a link muna."),
    trow("May weird error sa page.", "Add ?debug=1 sa URL para lumabas ang on-screen error banner — it helps sa pag-diagnose.", "F1F5FA")
  ]
});

const doc = new Document({
  numbering: {
    config: [
      { reference: "c", levels: [{ level: 0, format: LevelFormat.BULLET, text: "☐", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 620, hanging: 300 } } } }] },
      { reference: "n", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 620, hanging: 300 } } } }] }
    ]
  },
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1200, right: 1200 } } },
    children: [
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "INSET WORKSHOP — FACILITATOR GUIDE", font: "Calibri", bold: true, color: TEAL, size: 20, characterSpacing: 40 })] }),
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Hands-on Hour: Everyone Tries the LMS", font: "Cambria", bold: true, color: NAVY, size: 40 })] }),
      P([t("This is the guide for the ~1-hour hands-on workshop pagkatapos ng talk. English-dominant Taglish — the bold text ay ang key actions; may script cues (", { color: MUTE }), t("Sabihin", { bold: true, color: TEAL }), t(") in each part.", { color: MUTE })]),
      P([label("Live app:  ", NAVY), t(APP, { bold: true, color: NAVY })]),

      H2("Goal ng workshop"),
      P([t("By the end of this hour, every teacher will have gone through the whole flow mismo — signed in, joined a class, at nag-submit ng output — para alam nila mismo ang mararanasan ng estudyante nila. Optional: 1–2 volunteers also get to see the teacher dashboard.")]),

      H2("Pre-session checklist (bago mag-umpisa)"),
      chk("Tested the venue Wi-Fi; may mobile-data backup ka."),
      chk("Projector/HDMI works at nakikita ng lahat ang screen mo."),
      chk("You're signed in on the laptop as teacher/super admin."),
      chk("You've pre-created: 1 Subject, 1 Section (roster optional), at 1 Assignment (e.g. “Practice: paste any link,” 10 points)."),
      chk("Section Show QR is ready, at malaki mong naisulat ang join code sa board."),
      chk("You've picked 2 volunteers para subukan ang teacher view; nakuha mo na ang Gmail nila para ma-grant."),
      chk("This guide is printed / naka-second screen."),

      H2("Timeline (60 min)"),
      timing,

      H2("Importante: student vs teacher view"),
      callout("⚠  Why everyone who joins lands on the STUDENT view — at okay lang 'yon:", [
        [t("When a teacher signs in gamit ang Gmail nila, they land on the "), t("student view", { bold: true }), t(" by default. The teacher dashboard is gated lang sa super admin (ikaw) at sa mga email na "), t("granted", { bold: true }), t(" mo (teacher access).")],
        [t("Kaya the "), t("mainline of the workshop", { bold: true }), t(" = everyone joins as a student and submits. Ikaw ang magpapakita ng teacher side sa projector.")],
        [t("For a volunteer to see the teacher view: open "), t("Settings", { bold: true }), t(", add their email sa teacher list (grant). Tapos mag-refresh o mag-sign in ulit sila — teacher dashboard na ang makikita nila.")]
      ], "FBF3E5", GOLD),

      new Paragraph({ children: [new PageBreak()] }),
      H1("Run of show (step-by-step)"),

      H2("0–10 min · Setup at Sign-in"),
      numbered("Sabihin: “Phones out, please. Open Chrome o Safari — hindi sa loob ng Messenger.”"),
      numbered("Have them type/scan the app: " + APP + "."),
      numbered("Sabihin: “Tap ‘Sign in with Google’ at piliin ang Gmail ninyo.”", []),
      numbered("Reminder: it's normal na mapupunta sila sa student view. Sabihin: “This is exactly what your students will see.”"),
      P([label("Watch for:  ", CORAL), t("a blank screen — malamang nasa in-app browser (see Troubleshooting).", { italics: true })]),

      H2("10–25 min · Join the demo class"),
      numbered("Project the section QR (o ituro ang nakasulat na join code)."),
      numbered("Sabihin: “Scan the QR, o sa join screen, type this code.”"),
      numbered("Kung may roster: “Pick any name sa listahan — practice lang 'to.” Kung walang roster, it uses their Google name."),
      numbered("Wait for most to join bago magpatuloy. Ask: “Who's in already? Raise your hand.”"),

      H2("25–45 min · Submit an output"),
      numbered("Sabihin: “Open the assignment na ‘Practice: paste any link.’”"),
      numbered("Sabihin: “Paste any link — pwedeng Google, YouTube, o kahit ano. O tap ‘Add photo’ para kumuha ng litrato.” Tapos Submit."),
      numbered("On the projector (your teacher side), refresh the submissions — show their names arriving real-time-feeling. Sabihin: “I can see you all here na!”"),
      numbered("Show the preview of one submission nang hindi umaalis sa page — para makita nila kung gaano kabilis mag-check."),

      H2("45–55 min · Teacher-side reveal + live grading"),
      numbered("Open one submission, enter a score (out of 10) + short feedback, tapos Publish."),
      numbered("Sabihin: “Check your phone now — refresh — nandiyan na ang grado at feedback.”"),
      numbered("Grant 1–2 volunteers (Settings, add email). Have them start creating their own Subject/Section para makita nila ang teacher flow."),
      numbered("Point out the notification bell, records grid, at photo ZIPs as “this is what you'll see every day.”"),

      H2("55–60 min · Debrief at hamon"),
      numbered("Ask 2–3 teachers — what feature did you like most? Ano ang pwede ninyong gamitin agad sa klase?"),
      numbered("Sabihin: “This is exactly how easy it is for your students too — link o litrato lang, tapos may feedback agad.”"),
      numbered("Challenge: “Create one real assignment sa system ngayong linggo, at ipa-submit sa isang klase ninyo.”"),
      numbered("Sabihin: “Kung gusto ninyo ng sariling teacher access, lapitan ninyo ako — ig-grant ko kayo.”"),

      H2("Troubleshooting (mabilis na sagot)"),
      trouble,

      H2("Pagkatapos ng workshop"),
      chk("Note kung sinong teacher ang gustong bigyan ng teacher access; grant it sa Settings."),
      chk("Share the app link + the slide deck sa group chat ninyo."),
      chk("Clear/archive the demo Subject kung gusto mo — o iwanan as a sandbox para makapag-practice sila."),

      new Paragraph({ spacing: { before: 300 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "D9E2EB", space: 8 } }, children: [new TextRun({ text: "Reminder: Relax and be encouraging. It's not about a perfect demo — it's about them trying it mismo. 🙌", font: "Calibri", italics: true, size: 20, color: MUTE })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  const out = "D:/Desktop/INSET-Talk/INSET-Workshop-Facilitator-Guide-Taglish.docx";
  fs.writeFileSync(out, buf); console.log("WROTE:", out);
});
