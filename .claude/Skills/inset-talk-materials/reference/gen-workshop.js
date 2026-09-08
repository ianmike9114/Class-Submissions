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
    row("0–10", "Setup — lahat bubuksan ang app at mag-sign in (student view)", "10 min", "F1F5FA"),
    row("10–25", "Join — i-scan ang QR o ilagay ang join code, pumili ng pangalan", "15 min"),
    row("25–45", "Submit — bawat isa mag-submit ng link/litrato; ipakita ang dating sa projector", "20 min", "F1F5FA"),
    row("45–55", "Teacher-side reveal — mag-grade live; 1–2 volunteer subukan ang teacher view", "10 min"),
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
    trow("“Blank ang screen / hindi mag-sign in.”", "Binuksan sa Messenger/FB/IG in-app browser. Copy the link, open sa Chrome o Safari. Blocked ng Google ang OAuth sa in-app WebView — hindi ma-bypass.", "F1F5FA"),
    trow("“Wala akong nakikitang klase / list.”", "Walang real-time refresh ang app — i-refresh lang ang page. Siguraduhing tama ang join code."),
    trow("“Wala ang pangalan ko sa roster.”", "Piliin ang tamang section. Kung walang naka-set na roster, gagamitin ang Google account name — okay lang para sa practice.", "F1F5FA"),
    trow("“Hindi ma-scan ang QR.”", "I-type na lang ang 5-character join code nang manu-mano."),
    trow("“Ang bagal / hindi ma-submit ang litrato.”", "Auto-compressed na ang photo, pero kung mahina ang signal, mag-submit na lang ng link muna."),
    trow("May kakaibang error sa page.", "Idagdag ang ?debug=1 sa URL para lumabas ang on-screen error banner — makakatulong sa pag-diagnose.", "F1F5FA")
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
      P([t("Ito ang gabay para sa ~1-hour hands-on workshop pagkatapos ng talk. English-dominant Taglish — ang naka-bold ay ang key actions; may script cues (", { color: MUTE }), t("Sabihin", { bold: true, color: TEAL }), t(") sa bawat bahagi.", { color: MUTE })]),
      P([label("Live app:  ", NAVY), t(APP, { bold: true, color: NAVY })]),

      H2("Goal ng workshop"),
      P([t("Sa dulo ng oras na 'to, bawat teacher ay nakaranas na mismo ng buong flow — nag-sign in, sumali sa isang klase, at nag-submit ng output — para alam nila mismo ang mararanasan ng estudyante nila. Optional: 1–2 volunteer ang makakakita rin ng teacher dashboard.")]),

      H2("Pre-session checklist (bago mag-umpisa)"),
      chk("Na-test ang venue Wi-Fi; may mobile-data backup ka."),
      chk("Gumagana ang projector/HDMI at nakikita ng lahat ang screen mo."),
      chk("Naka-sign in ka sa laptop bilang teacher/super admin."),
      chk("May pre-created ka nang: 1 Subject, 1 Section (roster optional), at 1 Assignment (e.g. “Practice: paste any link,” 10 points)."),
      chk("Handa na ang Show QR ng section, at malaki mong naisulat ang join code sa board."),
      chk("May 2 volunteer ka nang napili para subukan ang teacher view; nakuha mo na ang Gmail nila para ma-grant."),
      chk("Na-print/naka-second screen ang guide na 'to."),

      H2("Timeline (60 min)"),
      timing,

      H2("Importanteng dapat malaman: student vs teacher view"),
      callout("⚠  Bakit lahat ng sasali ay mapupunta sa STUDENT view — at okay lang 'yon:", [
        [t("Kapag nag-sign in ang isang teacher gamit ang Gmail nila, mapupunta sila sa "), t("student view", { bold: true }), t(" by default. Ang teacher dashboard ay naka-gate lang sa super admin (ikaw) at sa mga email na "), t("na-grant", { bold: true }), t(" mo (teacher access).")],
        [t("Kaya ang "), t("mainline ng workshop", { bold: true }), t(" = lahat sasali bilang estudyante at mag-su-submit. Ikaw ang magpapakita ng teacher side sa projector.")],
        [t("Para makita ng volunteer ang teacher view: buksan ang "), t("Settings", { bold: true }), t(" → idagdag ang email nila sa teacher list (grant). Tapos mag-refresh o mag-sign in ulit sila — teacher dashboard na ang makikita nila.")]
      ], "FBF3E5", GOLD),

      new Paragraph({ children: [new PageBreak()] }),
      H1("Run of show (step-by-step)"),

      H2("0–10 min · Setup at Sign-in"),
      numbered("Sabihin: “Phones out, please. Buksan ang Chrome o Safari — hindi sa loob ng Messenger.”"),
      numbered("Ipa-type/ipa-scan ang app: " + APP + "."),
      numbered("Sabihin: “Tap ‘Sign in with Google’ at piliin ang Gmail ninyo.”", []),
      numbered("Paalala: normal na mapupunta sila sa student view. Sabihin: “Ganito rin ang makikita ng estudyante ninyo.”"),
      P([label("Watch for:  ", CORAL), t("kung may blank screen — malamang nasa in-app browser (tingnan ang Troubleshooting).", { italics: true })]),

      H2("10–25 min · Join sa demo class"),
      numbered("I-project ang section QR (o ituro ang nakasulat na join code)."),
      numbered("Sabihin: “I-scan ang QR, o sa join screen, i-type ang code na ito.”"),
      numbered("Kung may roster: “Piliin ang kahit sinong pangalan sa listahan — practice lang 'to.” Kung walang roster, gagamitin ang Google name nila."),
      numbered("Hintayin na maka-join ang nakararami bago magpatuloy. Tanong: “Sino ang nakapasok na? Raise your hand.”"),

      H2("25–45 min · Submit ng output"),
      numbered("Sabihin: “Buksan ang assignment na ‘Practice: paste any link.’”"),
      numbered("Sabihin: “I-paste ang kahit anong link — pwedeng Google, YouTube, o kahit ano. O tap ‘Add photo’ para kumuha ng litrato.” Tapos Submit."),
      numbered("Sa projector (teacher side mo), i-refresh ang submissions — ipakita na dumarating ang mga pangalan nila real-time-feeling. Sabihin: “Nakikita ko na kayo dito!”"),
      numbered("Ipakita ang preview ng isang submission nang hindi umaalis sa page — para makita nila kung gaano kabilis mag-check."),

      H2("45–55 min · Teacher-side reveal + live grading"),
      numbered("Buksan ang isang submission, maglagay ng score (out of 10) + maikling feedback, tapos Publish."),
      numbered("Sabihin: “Tignan ninyo ngayon ang phone ninyo — refresh — nandiyan na ang grado at feedback.”"),
      numbered("I-grant ang 1–2 volunteer (Settings → add email). Pasimulan silang gumawa ng sariling Subject/Section para makita nila ang teacher flow."),
      numbered("Ituro ang notification bell, records grid, at photo ZIPs bilang “yun ang makikita ninyo araw-araw.”"),

      H2("55–60 min · Debrief at hamon"),
      numbered("Balik sa topic na naisip nila sa ice-breaker. Sabihin: “Yung topic na naisip ninyo kanina — anong local resource at product ang pwede doon?”"),
      numbered("Tanong: 2–3 teacher magbahagi ng contextualized idea nila (Local resource → ICT tool → Product)."),
      numbered("Hamon: “Pumili ng isang topic ngayong linggo. Gawing contextualized. Ipasa sa LMS.”"),
      numbered("Sabihin: “Kung gusto ninyo ng sariling teacher access, lapitan ninyo ako — ig-grant ko kayo.”"),

      H2("Troubleshooting (mabilis na sagot)"),
      trouble,

      H2("Pagkatapos ng workshop"),
      chk("I-note kung sinong teacher ang gustong bigyan ng teacher access; i-grant sa Settings."),
      chk("I-share ang link ng app + ang slide deck sa group chat ninyo."),
      chk("I-clear/i-archive ang demo Subject kung gusto mo — o iwanan bilang sandbox para makapag-practice sila."),

      new Paragraph({ spacing: { before: 300 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "D9E2EB", space: 8 } }, children: [new TextRun({ text: "Reminder: I-relax at maging encouraging. Hindi tungkol sa perpektong demo — tungkol sa na-try nila mismo. 🙌", font: "Calibri", italics: true, size: 20, color: MUTE })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  const out = "D:/Desktop/INSET-Talk/INSET-Workshop-Facilitator-Guide-Taglish.docx";
  fs.writeFileSync(out, buf); console.log("WROTE:", out);
});
