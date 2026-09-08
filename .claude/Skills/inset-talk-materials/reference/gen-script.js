// Talk Script (Taglish, English-dominant) — INSET · Class Submissions LMS
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak, LevelFormat
} = require("docx");

const NAVY = "14304A", TEAL = "2A9D8F", GOLD = "B27A18", MUTE = "5B6B78", CORAL = "C0492F";
const APP = "deped-class-submissions.vercel.app";

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: t, font: "Cambria", color: NAVY, bold: true, size: 32 })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 80 }, children: [new TextRun({ text: t, font: "Cambria", color: NAVY, bold: true, size: 26 })] });
const P = (runs, opts = {}) => new Paragraph({ spacing: { after: 120, line: 276 }, ...opts, children: Array.isArray(runs) ? runs : [runs] });
const t = (text, o = {}) => new TextRun({ text, font: "Calibri", size: 22, color: "222B33", ...o });
const label = (text, color = TEAL) => new TextRun({ text, font: "Calibri", size: 22, bold: true, color });

function sayBlock(lines) {
  const out = [P([label("🗣  Sabihin:", TEAL)])];
  lines.forEach(l => out.push(new Paragraph({ spacing: { after: 100, line: 288 }, indent: { left: 360 }, children: [new TextRun({ text: l, font: "Calibri", size: 22, italics: true, color: "1B2733" })] })));
  return out;
}
function demoBlock(lines) {
  const out = [P([label("🖱  Gawin / Demo:", GOLD)])];
  lines.forEach(l => out.push(new Paragraph({ numbering: { reference: "d", level: 0 }, spacing: { after: 60 }, children: [t(l)] })));
  return out;
}
function transition(line) { return P([label("➜  Transition:  ", CORAL), t(line, { italics: true })]); }
function slideHead(n, title, time) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D9E2EB", space: 6 } },
    children: [
      new TextRun({ text: `Slide ${n} — ${title}`, font: "Cambria", bold: true, color: NAVY, size: 26 }),
      new TextRun({ text: `     ⏱ ~${time}`, font: "Calibri", bold: true, color: TEAL, size: 20 })
    ]
  });
}
function timeRow(part, slides, mins, shade) {
  const cell = (txt, w, bold = false, al = AlignmentType.LEFT) => new TableCell({
    width: { size: w, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    children: [new Paragraph({ alignment: al, children: [new TextRun({ text: txt, font: "Calibri", size: 20, bold, color: "222B33" })] })]
  });
  return new TableRow({ children: [cell(part, 3400, true), cell(slides, 3400), cell(mins, 1800, false, AlignmentType.CENTER)] });
}
const timingTable = new Table({
  columnWidths: [3400, 3400, 1800], width: { size: 8600, type: WidthType.DXA },
  borders: { top: { style: BorderStyle.SINGLE, size: 4, color: "D9E2EB" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9E2EB" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E7EEF5" }, insideVertical: { style: BorderStyle.NONE } },
  rows: [
    new TableRow({ tableHeader: true, children: ["Segment", "Slides", "Time"].map((h, i) => new TableCell({ width: { size: [3400, 3400, 1800][i], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: NAVY }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ alignment: i === 2 ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: h, font: "Calibri", size: 20, bold: true, color: "FFFFFF" })] })] })) }),
    timeRow("Opening", "1–3", "5 min", "F1F5FA"),
    timeRow("Part 1 — Why & What", "4–10", "13 min"),
    timeRow("Part 2 — How it works", "11–27", "33 min", "F1F5FA"),
    timeRow("Part 3 — Workshop intro + FAQ", "28–30", "6 min"),
    timeRow("Close", "31", "3 min", "F1F5FA")
  ]
});

const SL = [
  { n: 1, title: "Title", time: "1 min", say: [
    "Good morning po! Thank you sa oras ninyo this INSET.",
    "I want to show you something na ginawa ko myself — the Class Submissions LMS. It's a free digital classroom kung saan nagsu-submit ang student ng link o photo, ginagrade natin, tapos they see the feedback agad.",
    "By the end, may sarili na kayong access kung gusto ninyo — at alam ninyo nang gamitin."
  ], transition: "Pero una, one question na alam kong pamilyar sa inyo." },

  { n: 2, title: "Hook", time: "2 min", say: [
    "How many times na kayong naghanap ng student project sa Messenger? O sa email, sa chat, sa stack of printouts?",
    "The submissions are scattered. Kumpleto na ba? Nasaan yung link? Did the student even see the grade? It's hard to track — at nakaka-ubos ng oras.",
    "Kaya I built my own system para ayusin exactly this."
  ], transition: "Let's see kung ano siya." },

  { n: 3, title: "Roadmap", time: "2 min", say: [
    "Three parts. Una, kung bakit ko ginawa at what it is. Pangalawa, how it works — live demo. Pangatlo, kayo naman — hands-on sa phone ninyo.",
    "So i-charge na ang phone at buksan ang data o Wi-Fi para sa dulo."
  ], transition: "Let's start sa 'why.'" },

  { n: 4, title: "Part 1 divider — Why I Built This", time: "0.5 min", say: ["Part 1: why I built it, at ano nga ba ito."] },

  { n: 5, title: "The old way", time: "2 min", say: [
    "This is the old way, at alam nating lahat ito. Paper piles na mabigat at madaling mawala. Links na kalat sa Messenger at email.",
    "Walang clear feedback loop — nakapasa na, pero did the student see it? At mahirap i-track kung sino ang naka-submit at sino hindi.",
    "Magandang work ng bata, pero sayang kung magulo ang submission at grading."
  ], transition: "Kaya heto ang solution." },

  { n: 6, title: "Meet the LMS", time: "2.5 min", say: [
    "This is the Class Submissions LMS — a free digital classroom kung saan nagsu-submit ang student ng link o photo ng output nila.",
    "Nire-review natin at ginagrade, tapos they instantly see the score and feedback.",
    "Four things to remember: free forever, phone-first, link o photo lang — walang mabigat na upload — at isolated ang bawat teacher. I built it para sa sarili kong klase, pero pwede na ring gamitin ng kahit sinong guro."
  ], transition: "Ganito gumagana ang buong idea." },

  { n: 7, title: "The core loop", time: "1.5 min", say: [
    "One clean loop: Submit, Review, Grade, Publish, tapos nakikita ng student.",
    "The student submits a link o photo; nire-review natin nang hindi umaalis sa page; we add a score and feedback; i-publish; tapos nakikita agad ng student. That's the whole life ng isang submission."
  ] },

  { n: 8, title: "Links, not uploads", time: "2 min", say: [
    "One key decision: links, not uploads. Nagsu-submit ang student ng LINK — Google Doc, Drive file o folder, YouTube, CodePen o Gist para sa ICT — o photo mula sa phone.",
    "Bakit ganito? Para manatiling free — walang mabigat na storage — at gumana kahit mahina ang internet. Basta 'anyone with link can view,' okay na."
  ] },

  { n: 9, title: "Free & private", time: "1.5 min", say: [
    "Two questions na lagi kong naririnig. 'Is it really free?' Yes — zero cost, forever, naka-free tier. 'Is it safe?' Yes — walang file uploads, isolated ang bawat teacher, at walang student passwords; Google Sign-In lang.",
    "Safe para sa DepEd budget at para sa student privacy — sadya kong ginawang ganito."
  ] },

  { n: 10, title: "How it stays free", time: "2 min", say: [
    "For those curious sa likod ng system: it's a static site na naka-host sa Vercel — walang paid server. Firebase free tier lang para sa Auth at Firestore. Walang paid Storage o Cloud Functions. At Google Sign-In, kaya walang password system na aalagaan.",
    "I chose this architecture para hindi kailanman maningil — hard rule ko yan sa project."
  ], transition: "Ngayon, let's see kung paano ito gamitin." },

  { n: 11, title: "Part 2 divider — How It Works", time: "0.5 min", say: [
    "Part 2: how it works. I'll open the app sa " + APP + ". (Kung mabagal ang internet, may screenshots tayo — okay lang.)"
  ] },

  { n: 12, title: "The three roles", time: "1.5 min", say: [
    "Three roles. Teacher — creates Subjects, Sections, Assignments, at nagga-grade. Student — joins and submits. Super Admin — grants teacher access at nakikita ang lahat kung kailangan.",
    "One app, three views — automatic depende sa email na naka-sign in."
  ] },

  { n: 13, title: "The structure", time: "1.5 min", say: [
    "The layout is clear: Subject, tapos Section, tapos Assignment, tapos Submission.",
    "One Subject per term; multiple Sections na may sariling join code; multiple Assignments; at bawat pasa ng student, one Submission na may grado. Simple, pero kaya ang buong klase."
  ], transition: "Let's start sa teacher side." },

  { n: 14, title: "Teacher — create Subject & Section", time: "2 min", say: [
    "As a teacher, mag-sign in ako with Google. Add Subject — name, grade, school year, term.",
    "Open the subject, tapos Add Section — like 'Grade 9 – Rizal.' Automatic na may sariling join code ang bawat section."
  ], demo: ["Sign in as teacher/admin.", "Add a Subject (o ipakita ang naka-set up).", "Open subject, Add Section, ituro ang join code."] },

  { n: 15, title: "Teacher — Join code / QR", time: "1.5 min", say: [
    "Para sumali ang mga student, i-click ko ang 'Show QR' — client-side lang, walang third-party server.",
    "I project the QR o isulat ang 5-character code. Pwede rin akong mag-invite by email para auto-join sila pag-sign-in."
  ], demo: ["Click 'Show QR' — ipakita ang QR + code.", "Banggitin ang 'Invite by email'."] },

  { n: 16, title: "Teacher — Add Assignment", time: "1.5 min", say: [
    "Inside the section, Add Assignment. Title, instructions, total points, due date.",
    "I pick kung link submission o photo. Pwede rin akong mag-attach ng instructions o rubric link."
  ], demo: ["Create a demo assignment (e.g. 'Weekly Project', 20 pts).", "Ipakita ang link vs photo option."] },

  { n: 17, title: "Student — sign in & join", time: "1.5 min", say: [
    "Ngayon, from the student's eyes. They open the link o i-scan ang QR. Tap 'Sign in with Google.'",
    "Enter the join code kung hindi via QR, tapos pick their name sa roster. Tapos — sali na."
  ], demo: ["Ipakita sa phone o second window ang student join.", "Pumili ng pangalan sa roster."] },

  { n: 18, title: "Student — submit", time: "1.5 min", say: [
    "The student opens the assignment sa My Classes. They paste the link — Google Doc, Drive, YouTube — o kukuha ng photo, na auto-compressed.",
    "Tap Submit. Pwede pa nilang bawiin habang 'pending' pa."
  ], demo: ["Mag-submit ng sample link bilang student.", "Ipakita ang submitted state."] },

  { n: 19, title: "Teacher — review, grade, publish", time: "2 min", say: [
    "Back to the teacher. I open the assignment — nandito na ang submissions. I can preview the link o photo nang hindi umaalis.",
    "I enter the score out of total, plus feedback, tapos Publish. Makikita na agad ng student."
  ], demo: ["Open the submission just made.", "Preview it, enter score + feedback, Publish.", "Ituro ang notification bell."] },

  { n: 20, title: "Student — sees grade", time: "1 min", say: [
    "At sa student — back sa My Classes, updated na ang status. They see the score and feedback.",
    "Walang chat, walang hanap sa ibang app. Malinaw: tapos na, may grado na, may sagot na."
  ], transition: "Bukod sa flow, marami pang tools para sa'yo as a teacher." },

  { n: 21, title: "Notification bell", time: "1.5 min", say: [
    "The notification bell has three buckets: pending submissions, leave requests, at new joins — kung sino ang bagong sumali, by name.",
    "Click the row, dumidiretso ka na sa mismong assignment o student. Walang hahanapin."
  ] },

  { n: 22, title: "Records grid", time: "1.5 min", say: [
    "There's a records grid — parang Class Record. Bawat roster student, bawat assignment, you instantly see kung sino may score at sino ang 'Not joined' pa.",
    "Grouped by gender, may Written Work at Performance Task columns. Pero para lang sa tingin — ikaw pa rin ang bahala sa official Class Record."
  ] },

  { n: 23, title: "Photos + ZIPs", time: "1.5 min", say: [
    "For image o document tasks, may in-app camera o gallery — walang link kailangan, auto-compressed, up to 10 pages.",
    "At pwede mong i-download lahat ng photo ng isang assignment as a ZIP, one click. Perfect para sa modular o WFH outputs."
  ] },

  { n: 24, title: "Accomplishment report", time: "1.5 min", say: [
    "This is a favorite ng marami: from the submitted photos, the app builds a photo collage at ng official DepEd 'Individual Daily Log and Accomplishment Report' na .docx.",
    "Buo ang font, seal, at borders ng totoong template. For WFH o modular documentation — hindi na kailangang gawin nang manual."
  ] },

  { n: 25, title: "Roster & invites", time: "1.5 min", say: [
    "You can seed a roster — i-paste o i-upload, kasama ang gender. On join, the student picks their real name sa listahan, kaya tugma sa Class Record.",
    "May invite by Gmail din — auto-join pag-sign-in — at QR join. Iba-ibang paraan, iisang result."
  ] },

  { n: 26, title: "Isolation & PWA", time: "1.5 min", say: [
    "For the whole faculty: isolated ang bawat teacher — sariling dashboard, hindi nagkikita ang data. One super admin grants access.",
    "At installable siya — PWA — pwede sa home screen ng phone, may offline shell na bubukas kahit mahina ang signal."
  ] },

  { n: 27, title: "Low-tech friendly", time: "1.5 min", say: [
    "I built this para sa totoong sitwasyon: it works sa lumang phone, sa data, kahit mahina ang signal.",
    "Kapag binuksan sa Messenger, may 'Open in Chrome' na guide. At may '?debug=1' banner na nagpapakita ng error on-screen — madaling i-report kapag may problema."
  ], transition: "Ngayon — kayo naman." },

  { n: 28, title: "Part 3 divider — Your Turn (Workshop)", time: "0.5 min", say: [
    "Part 3: your turn. Phones out — try it yourselves. (Facilitator: follow the Workshop Facilitator Guide.)"
  ] },

  { n: 29, title: "Workshop instructions", time: "2.5 min", say: [
    "Four steps. Una — open sa phone browser, Chrome o Safari (hindi sa Messenger), ang " + APP + ".",
    "Pangalawa — tap 'Sign in with Google.' Pangatlo — scan the QR o enter ang join code. Pang-apat — submit any link.",
    "Wag mag-alala kung hindi perfect — practice lang. I'll go around sa inyo."
  ], demo: ["Palitan ang QR sa slide ng totoong section QR bago ang talk.", "Gabayan ang bawat hakbang."] },

  { n: 30, title: "FAQ", time: "2 min", say: [
    "Some common questions. 'Walang internet sa bahay?' — pwede sa data, school Wi-Fi, o lab; link lang naman.",
    "'Hindi mag-sign in?' — kung nasa Messenger/FB browser, open it sa Chrome o Safari; blocked ng Google ang WebView.",
    "'May bayad sa susunod?' — wala. 'Makikita ng iba ang klase ko?' — hindi, isolated ang bawat teacher."
  ], transition: "Last na." },

  { n: 31, title: "Close", time: "2 min", say: [
    "One class. One link. One grade — seen agad. Let's make submission and grading easier — free, sa phone, para sa lahat.",
    "Kung gusto ninyo ng sariling teacher access, lapitan ninyo ako — ig-grant ko kayo.",
    "Maraming salamat po! I'm open sa mga tanong."
  ] }
];

const body = [];
SL.forEach(s => {
  body.push(slideHead(s.n, s.title, s.time));
  sayBlock(s.say).forEach(x => body.push(x));
  if (s.demo) demoBlock(s.demo).forEach(x => body.push(x));
  if (s.transition) body.push(transition(s.transition));
});

const doc = new Document({
  numbering: { config: [{ reference: "d", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 620, hanging: 300 } } } }] }] },
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1200, right: 1200 } } },
    children: [
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "INSET SPEAKER SCRIPT", font: "Calibri", bold: true, color: TEAL, size: 20, characterSpacing: 40 })] }),
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Class Submissions LMS — a talk about the system I built", font: "Cambria", bold: true, color: NAVY, size: 40 })] }),
      P([t("Taglish (English-dominant) script for a ~1-hour talk. Read it naturally — hindi word-for-word. The ", { color: MUTE }), t("italics", { italics: true, color: MUTE }), t(" are what to say; the numbered items are what to do / demo.", { color: MUTE })]),
      P([label("Live app:  ", NAVY), t(APP, { bold: true, color: NAVY })]),
      H2("Timing overview (~60 min)"),
      timingTable,
      P([t("Note: The actual 1-hour hands-on workshop is in the separate Workshop Facilitator Guide. Part 3 here (Slides 28–30) is the bridge papunta doon.", { italics: true, color: MUTE })]),
      new Paragraph({ children: [new PageBreak()] }),
      H1("Slide-by-slide script"),
      ...body,
      new Paragraph({ spacing: { before: 300 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "D9E2EB", space: 8 } }, children: [new TextRun({ text: "Tip: Print it 2 pages per sheet, o buksan sa phone. Kaya mo 'to — your own system ang ipe-present mo! 🙌", font: "Calibri", italics: true, size: 20, color: MUTE })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  const out = "D:/Desktop/INSET-Talk/INSET-Talk-Script-Taglish.docx";
  fs.writeFileSync(out, buf); console.log("WROTE:", out);
});
