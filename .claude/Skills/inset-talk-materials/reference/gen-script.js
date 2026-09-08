// Talk Script (Taglish, English-dominant) — INSET
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
const bullet = (text, extra = []) => new Paragraph({ numbering: { reference: "b", level: 0 }, spacing: { after: 60, line: 264 }, children: [t(text), ...extra] });

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
function transition(line) {
  return P([label("➜  Transition:  ", CORAL), t(line, { italics: true })]);
}
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

// ---- timing table ----
function timeRow(part, slides, mins, shade) {
  const cell = (txt, w, bold = false, al = AlignmentType.LEFT) => new TableCell({
    width: { size: w, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    children: [new Paragraph({ alignment: al, children: [new TextRun({ text: txt, font: "Calibri", size: 20, bold, color: "222B33" })] })]
  });
  return new TableRow({ children: [cell(part, 3200, true), cell(slides, 3600), cell(mins, 1800, false, AlignmentType.CENTER)] });
}
const timingTable = new Table({
  columnWidths: [3200, 3600, 1800], width: { size: 8600, type: WidthType.DXA },
  borders: { top: { style: BorderStyle.SINGLE, size: 4, color: "D9E2EB" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9E2EB" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E7EEF5" }, insideVertical: { style: BorderStyle.NONE } },
  rows: [
    new TableRow({ tableHeader: true, children: ["Segment", "Slides", "Time"].map((h, i) => new TableCell({ width: { size: [3200, 3600, 1800][i], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: NAVY }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ alignment: i === 2 ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: h, font: "Calibri", size: 20, bold: true, color: "FFFFFF" })] })] })) }),
    timeRow("Opening", "1–3", "5 min", "F1F5FA"),
    timeRow("Part 1 — Why", "4–7", "9 min"),
    timeRow("Part 2 — Framework", "8–16", "16 min", "F1F5FA"),
    timeRow("Part 3 — The Tool", "17–21", "9 min"),
    timeRow("Part 4 — Live Demo", "22–30", "14 min", "F1F5FA"),
    timeRow("Part 5 — Workshop intro + FAQ", "31–33", "5 min"),
    timeRow("Close", "34", "2 min", "F1F5FA")
  ]
});

// ---- per-slide narration ----
const SL = [
  { n: 1, title: "Title", time: "1 min", say: [
    "Magandang umaga po sa inyong lahat! Salamat sa oras ninyo ngayong INSET.",
    "Ngayon, pag-uusapan natin kung paano natin magagawang mas makabuluhan — at digital — ang mga aralin natin, gamit ang mga bagay na nasa paligid lang natin at isang libreng tool.",
    "By the end, may isang malinaw na paraan kayo na pwede ninyong subukan agad sa klase ninyo — from a local resource, papunta sa isang graded student output."
  ], transition: "Pero bago tayo pumunta sa 'paano,' isang mabilis na tanong muna." },

  { n: 2, title: "Ice-breaker", time: "2 min", say: [
    "Isang tanong: kailan huli kayong nakarinig ng estudyante na nagsabi ng — 'Ma'am, Sir, saan po namin magagamit 'to sa totoong buhay?'",
    "Turn to your seatmate — 30 seconds lang. Isang topic sa subject ninyo na medyo mahirap i-relate sa buhay ng bata."
  ], demo: ["Give them ~30 seconds.", "Tawagin ang 2–3 na magbo-volunteer, pakinggan ang sagot.", "Sabihin: 'Tandaan ninyo 'yang topic na 'yan — babalikan natin sa workshop mamaya.'"],
    transition: "Kasi 'yang tanong na 'yan — 'saan magagamit' — 'yan mismo ang sinasagot ng contextualized learning." },

  { n: 3, title: "Roadmap", time: "2 min", say: [
    "Tatlong bahagi tayo ngayon. Una, ang 'bakit' at ang framework — 'yung recipe. Pangalawa, ang tool — kung saan pupunta ang output ng bata. Pangatlo, hands-on kayo mismo sa phone ninyo.",
    "So please, i-charge na ang phone at buksan ang data o Wi-Fi — gagamitin natin 'yan sa dulo."
  ], transition: "Simulan natin sa 'bakit.'" },

  { n: 4, title: "Part 1 divider — Why Contextualize?", time: "0.5 min", say: [
    "Part 1: Bakit natin ito ginagawa."
  ] },

  { n: 5, title: "The problem", time: "2.5 min", say: [
    "Minsan kasi, parang abstract ang lessons natin. Disengaged ang bata kapag pakiramdam nila walang kabuluhan.",
    "Puro worksheet — sagot, tapos kalimutan agad. At madalas, malayo sa buhay nila ang halimbawa sa libro.",
    "Hindi ibig sabihin nito ay kulang sa talino ang bata. Kulang lang sa koneksyon ang laman — at 'yun ang kaya nating ayusin."
  ], transition: "Ganito natin siya aayusin." },

  { n: 6, title: "Definition", time: "2.5 min", say: [
    "Ano ang contextualized learning? Simple lang: iniuugnay natin ang aralin sa totoong buhay, lugar, at karanasan ng estudyante.",
    "Hindi ito bago. Kasama na 'to sa K-12 at MATATAG — localization, indigenization, ICT integration. Ginagawa na natin 'to. Gagawin lang nating mas sadya at mas digital.",
    "Apat ang sangkap: isang local resource, isang competency mula sa curriculum, isang ICT tool, at isang student product."
  ], transition: "Titignan natin nang mas malapitan ang apat na 'yan." },

  { n: 7, title: "Why it works", time: "2 min", say: [
    "Bakit epektibo? Una, relevance — kapag kilala ang halimbawa, mas madaling maintindihan. Pangalawa, engagement — curious ang bata kapag tungkol sa sarili nilang komunidad.",
    "Pangatlo, deeper mastery — hindi memorize, applied. At pang-apat, sabay-sabay nating hinahasa ang 21st-century skills — data, reasoning, digital tools, at decision-making."
  ], transition: "Ito ang eksaktong ginagawa ng framework — tignan natin." },

  { n: 8, title: "Part 2 divider — The Framework", time: "0.5 min", say: ["Part 2: Ang framework. Ito ang puso ng usapan natin."] },

  { n: 9, title: "The 4-part model", time: "3 min", say: [
    "Apat na tanong lang. Una — Local Resource: ano ang nasa paligid? Palengke, sari-sari store, barangay hall, bukid.",
    "Pangalawa — Competency: ano ang dapat matutuhan? Kunin lang sa curriculum guide. Walang binago dito.",
    "Pangatlo — ICT Tool: anong digital tool ang gagamitin? Spreadsheet, Google Form o Doc, camera, chart.",
    "Pang-apat — Product: ano ang aktwal na output ng bata? Budget planner, infographic, vlog, mini-report.",
    "Sagutin ang apat na tanong na 'yan, at meron ka nang contextualized activity. Ganun kadali."
  ], transition: "At may malinaw na daloy 'to mula umpisa hanggang dulo." },

  { n: 10, title: "The learning flow", time: "2 min", say: [
    "Ito ang daloy: Observe, Collect data, Compute, Visualize, Explain, Recommend.",
    "Tumingin sila sa totoong sitwasyon, mag-tala ng datos, mag-compute gamit ang competency, i-visualize sa chart, ipaliwanag kung ano'ng kahulugan, at magbigay ng payo o desisyon.",
    "Pansinin ninyo — 'yung Visualize at 'yung final product, dito papasok nang malakas ang ICT."
  ], transition: "Tignan natin ang isang buong halimbawa." },

  { n: 11, title: "Worked example — Mathematics", time: "3 min", say: [
    "Ito 'yung sample na nakita ninyo kanina: Public Market papuntang Math.",
    "Local resource: presyo sa palengke — kamatis, karot, sibuyas. Competency: percentage at budgeting. ICT tool: Google Sheets — mag-encode, auto-total, gumawa ng bar o pie chart.",
    "Product: 'My Market Budget Planner' — table, chart, at maikling payo kung paano mag-budget.",
    "Pero importante 'to: template lang 'to. Hindi ito para sa Math lang."
  ], transition: "Tignan natin sa ibang subject." },

  { n: 12, title: "Subject example — Science", time: "1.5 min", say: [
    "Science: basura sa barangay o sa canteen papuntang environmental infographic.",
    "Same model — competency sa ecosystems at waste segregation, tool na Canva o Slides plus camera, at product na infographic with recommendation."
  ] },
  { n: 13, title: "Subject example — English", time: "1.5 min", say: [
    "English: lokal na balita o isyu papuntang editorial o vlog.",
    "Persuasive writing at media literacy ang competency, Google Docs o phone video ang tool, at ang product ay editorial article o isang-minutong opinion vlog."
  ] },
  { n: 14, title: "Subject example — Araling Panlipunan", time: "1.5 min", say: [
    "Araling Panlipunan: kwento ng matatanda at lokal na landmark papuntang digital timeline o mapa.",
    "Local history at geography ang competency, Google My Maps o Slides ang tool, at ang product ay interactive map o illustrated timeline."
  ] },
  { n: 15, title: "Subject example — TLE / ICT", time: "1.5 min", say: [
    "TLE at ICT: sari-sari store papuntang mini inventory system.",
    "Spreadsheets at computation ang competency, Google Sheets with formulas ang tool, at ang product ay gumaganang inventory at sales tracker."
  ], transition: "May napansin ba kayo sa lahat ng halimbawa?" },

  { n: 16, title: "Notice the pattern", time: "1.5 min", say: [
    "Lahat ng halimbawa — may PRODUCT. May aktwal na output ang bata: budget planner, infographic, vlog, spreadsheet.",
    "At karamihan nito ay digital — isang link o litrato. Nasa phone na mismo ng bata.",
    "So... isang tanong lang ang natitira: saan pupunta lahat ng output na 'yan?"
  ], demo: ["Pause. Hayaan silang mag-isip saglit bago mag-advance."], transition: "Dito papasok ang tool." },

  { n: 17, title: "Part 3 divider — Where Does the Product Go?", time: "0.5 min", say: ["Part 3: ang nawawalang piraso — kung saan mapupunta ang output ng bata."] },

  { n: 18, title: "The gap", time: "2 min", say: [
    "Ito 'yung dating paraan, at alam nating lahat 'to. Paper piles — mabigat, madaling mawala. Mga link na nakakalat sa Messenger, chat, at email.",
    "Walang malinaw na feedback loop — nakapasa na, pero nakita ba ng bata ang grado? At mahirap i-track kung sino nakapasa at sino hindi.",
    "Magandang aktibidad, pero sayang kung magulo ang pagpasa at pag-grade."
  ], transition: "May libreng solusyon dito." },

  { n: 19, title: "Meet the LMS", time: "2.5 min", say: [
    "Ito ang Class Submissions LMS — isang libreng digital classroom kung saan nagpapasa ang bata ng link o litrato ng output nila.",
    "Nire-review at ginagrade ng teacher, tapos nakikita agad ng estudyante ang score at feedback.",
    "Apat na bagay ang tandaan: libre habambuhay, phone-first, link o litrato lang — walang mabigat na upload — at isolated ang bawat teacher. At totoo — ginawa ito ng isang guro, para sa mga guro."
  ], transition: "At perpekto siyang kasya sa framework natin." },

  { n: 20, title: "How it fits", time: "1.5 min", say: [
    "Tandaan ninyo 'yung huling hakbang ng framework — ang Product? Dito siya nabubuhay online.",
    "Product, papuntang Submit, papuntang Grade, papuntang Publish. Apat na hakbang, tapos buo na ang cycle ng contextualized learning."
  ] },

  { n: 21, title: "Reassurance", time: "1.5 min", say: [
    "Dalawang tanong na lagi kong naririnig. Una — 'Libre nga ba talaga?' Oo. Naka-free tier — pinili itong ganito para hindi kailanman maningil, kahit dumami ang klase.",
    "Pangalawa — 'Safe ba?' Oo. Walang file uploads, isolated ang bawat teacher, at walang student passwords — Google Sign-In lang. Ligtas para sa DepEd budget at sa student privacy."
  ], transition: "Tama na ang salita — tignan na natin nang live." },

  { n: 22, title: "Part 4 divider — Let's See It Live", time: "0.5 min", say: [
    "Part 4: live demo. Buksan ko lang ang app sa " + APP + ".",
    "(Kung mabagal ang internet, may screenshots tayo — okay lang, tuloy lang tayo.)"
  ] },

  { n: 23, title: "Demo — create Subject & Section", time: "2 min", say: [
    "Ako muna. Bilang teacher, mag-sign in ako with Google. Add Subject — pangalan, grade, school year, at term.",
    "Buksan ang subject, tapos Add Section — halimbawa 'Grade 9 – Rizal.' Automatic na may sariling join code ang bawat section."
  ], demo: ["Sign in as teacher/admin.", "Add a Subject live (o ipakita ang naka-set up na).", "Open subject → Add Section → ituro ang auto-generated na join code."] },

  { n: 24, title: "Demo — Join code / QR", time: "1.5 min", say: [
    "Para sumali ang mga bata, i-click ko lang ang 'Show QR' — client-side lang 'to, walang third-party na server.",
    "I-project ko ang QR, o isulat ang 5-character code. Pwede rin akong mag-invite by email para auto-join sila pagsign-in."
  ], demo: ["Click 'Show QR' — ipakita ang QR + code.", "Banggitin ang 'Invite by email' option."] },

  { n: 25, title: "Demo — Add Assignment", time: "1.5 min", say: [
    "Sa loob ng section, Add Assignment. Ilalagay ko ang title, instructions, total points, at due date.",
    "Pipiliin ko kung link submission o photo. Pwede rin akong mag-attach ng instructions o rubric link."
  ], demo: ["Create a demo assignment (e.g. 'Market Budget Planner', 20 pts).", "Ipakita ang link vs photo option."] },

  { n: 26, title: "Demo — Student sign in & join", time: "1.5 min", say: [
    "Ngayon, sa mata ng estudyante. Bubuksan nila ang link o i-scan ang QR sa phone. Tap 'Sign in with Google.'",
    "Ilalagay ang join code kung hindi via QR, tapos pipiliin ang pangalan nila sa roster. Tapos — sali na sila."
  ], demo: ["Ipakita sa phone o second window ang student join.", "Pumili ng pangalan mula sa roster."] },

  { n: 27, title: "Demo — Student submits", time: "1.5 min", say: [
    "Bubuksan ng bata ang assignment sa My Classes. Ipe-paste nila ang link — Google Doc, Drive, YouTube — o kukuha ng litrato, na auto-compressed para kasya.",
    "Tap Submit. Pwede pa nilang bawiin habang 'pending' pa."
  ], demo: ["Mag-submit ng sample link bilang student.", "Ipakita ang submitted state."] },

  { n: 28, title: "Demo — Review, grade, publish", time: "2 min", say: [
    "Balik tayo sa teacher. Buksan ko ang assignment — nandito na ang submissions. Pwede kong i-preview ang link o litrato nang hindi umaalis sa page.",
    "Ilalagay ko ang score out of total, plus feedback, tapos Publish. Makikita na agad ng bata."
  ], demo: ["Open the submission just made.", "Preview it, enter score + feedback, Publish.", "Ituro ang notification bell (pending counts + new joins)."] },

  { n: 29, title: "Demo — Student sees grade", time: "1 min", say: [
    "At sa bata — balik sa My Classes, updated na ang status. Makikita nila ang score at ang feedback ko.",
    "Walang chat, walang hanap sa ibang app. Malinaw: tapos na, may grado na, may sagot na."
  ] },

  { n: 30, title: "Bonus features", time: "1.5 min", say: [
    "Bukod dito, may mga tulong pa: notifications para sa pending at bagong sumali; records grid na parang class record; photo ZIPs para i-download lahat ng litrato nang sabay; at auto accomplishment report para sa WFH o modular documentation.",
    "Hindi lang pasahan — buong workflow ng guro, nasa isang lugar."
  ], transition: "Ngayon — kayo naman." },

  { n: 31, title: "Part 5 divider — Your Turn (Workshop)", time: "0.5 min", say: [
    "Part 5: kayo na. Phones out — gagawin natin nang sabay-sabay ang buong flow.",
    "(Facilitator: sundan ang Workshop Facilitator Guide mula dito.)"
  ] },

  { n: 32, title: "Workshop instructions", time: "2.5 min", say: [
    "Apat na hakbang. Una — buksan sa phone browser (Chrome o Safari, hindi sa loob ng Messenger) ang " + APP + ".",
    "Pangalawa — tap 'Sign in with Google.' Pangatlo — i-scan ang QR na ito o ilagay ang join code. Pang-apat — mag-submit ng kahit anong link, subukan lang natin.",
    "Wag mag-alala kung hindi perpekto — practice lang 'to. Lilibutin ko kayo para tumulong."
  ], demo: ["Palitan ang QR sa slide ng totoong section QR ninyo bago ang talk.", "Gabayan ang bawat hakbang, maghintay sa dulo ng bawat isa."] },

  { n: 33, title: "FAQ", time: "2 min", say: [
    "Ilang madalas na tanong. 'Paano kung walang internet sa bahay?' — pwede sa data, school Wi-Fi, o computer lab; link lang naman ang pinapasa.",
    "'Bakit hindi gumagana ang sign-in?' — kung binuksan sa Messenger o FB in-app browser, i-open sa Chrome o Safari; blocked ng Google ang WebView na 'yon.",
    "'May bayad ba sa susunod?' — wala. At 'Makikita ba ng ibang teacher ang klase ko?' — hindi, isolated ang bawat teacher."
  ], transition: "Panghuli." },

  { n: 34, title: "Close", time: "2 min", say: [
    "Isang local resource. Isang digital product. Isang graded output. Ganun lang kasimple ang simula.",
    "Hamon ko sa inyo: pumili ng isang topic ngayong linggo, gawing contextualized, at ipasa sa LMS. Kung gusto ninyo ng sariling teacher access, lapitan lang ninyo ako.",
    "Maraming salamat po! Bukas ako sa mga tanong."
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
  numbering: {
    config: [
      { reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 620, hanging: 260 } } } }] },
      { reference: "d", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 620, hanging: 300 } } } }] }
    ]
  },
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1200, right: 1200 } } },
    children: [
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "INSET SPEAKER SCRIPT", font: "Calibri", bold: true, color: TEAL, size: 20, characterSpacing: 40 })] }),
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Contextualized Learning Meets a Free Digital Classroom", font: "Cambria", bold: true, color: NAVY, size: 40 })] }),
      P([t("Taglish (English-dominant) na script para sa ~1-hour talk. Basahin nang natural — hindi kailangang salita-por-salita. Ang naka-", { color: MUTE }), t("italics", { italics: true, color: MUTE }), t(" ay ang sasabihin; ang naka-numero ay ang gagawin/ide-demo.", { color: MUTE })]),
      P([label("Live app:  ", NAVY), t(APP, { bold: true, color: NAVY })]),
      H2("Timing overview (~60 min)"),
      timingTable,
      P([t("Note: Ang aktwal na 1-hour hands-on workshop ay nasa hiwalay na Workshop Facilitator Guide. Ang Part 5 dito (Slides 31–33) ang bridge papunta doon.", { italics: true, color: MUTE })]),
      new Paragraph({ children: [new PageBreak()] }),
      H1("Slide-by-slide script"),
      ...body,
      new Paragraph({ spacing: { before: 300 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "D9E2EB", space: 8 } }, children: [new TextRun({ text: "Tip: I-print ito sa 2 pages per sheet, o buksan sa phone sa Presenter view. Good luck — kaya mo 'to! 🙌", font: "Calibri", italics: true, size: 20, color: MUTE })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  const out = "D:/Desktop/INSET-Talk/INSET-Talk-Script-Taglish.docx";
  fs.writeFileSync(out, buf); console.log("WROTE:", out);
});
