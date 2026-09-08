// INSET Talk deck generator — Contextualized Learning + Class Submissions LMS
const pptxgen = require("pptxgenjs");
const p = new pptxgen();
p.layout = "LAYOUT_WIDE";           // 13.333 x 7.5
p.author = "DepEd Teacher";
p.company = "INSET";
p.title = "Contextualized Learning + Class Submissions LMS";
const W = 13.333, H = 7.5;

const C = {
  navy: "14304A", navy2: "1E3A5F", softnavy: "26456A",
  teal: "2A9D8F", gold: "E1A140", green: "4C956C", brown: "9B6A43",
  blue: "2F6DB5", coral: "E4694E", violet: "6C6CBF",
  light: "F1F5FA", white: "FFFFFF", ink: "20303F", mute: "6B7A88",
  line: "D9E2EB", chipbg: "E7EEF5"
};
const F = { head: "Cambria", body: "Calibri", emoji: "Segoe UI Emoji" };
const CAT = [C.teal, C.blue, C.brown, C.green]; // Local Resource / Competency / ICT / Product
const FLOW = [C.teal, C.blue, C.brown, C.gold, C.coral, C.softnavy];

const sh = () => ({ type: "outer", color: "9DB0C2", blur: 9, offset: 3, angle: 90, opacity: 0.35 });
const APP = "deped-class-submissions.vercel.app";

function pageBg(s){ s.background = { color: C.light }; }
function darkBg(s){ s.background = { color: C.navy }; }

function card(s, x, y, w, h, fill){
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: fill || C.white }, line: { color: C.line, width: 1 }, rectRadius: 0.11, shadow: sh() });
}
function tint(s, x, y, w, h, fill){
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { type: "none" }, rectRadius: 0.11 });
}
function iconCircle(s, x, y, d, fill, emoji, esz){
  s.addShape(p.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill } });
  s.addText(emoji, { x, y, w: d, h: d, fontFace: F.emoji, fontSize: esz || Math.round(d * 26), align: "center", valign: "middle", margin: 0, isTextBox: true });
}
function header(s, kicker, title, accent){
  s.addText(String(kicker).toUpperCase(), { x: 0.7, y: 0.48, w: 11.9, h: 0.32, fontFace: F.body, fontSize: 12.5, bold: true, color: accent || C.teal, charSpacing: 2, margin: 0, isTextBox: true });
  s.addText(title, { x: 0.7, y: 0.78, w: 12.0, h: 0.9, fontFace: F.head, fontSize: 31, bold: true, color: C.navy, margin: 0, isTextBox: true });
}
function takeaway(s, text, fill){
  s.addShape(p.ShapeType.roundRect, { x: 0.7, y: 6.62, w: 11.93, h: 0.6, fill: { color: fill || C.navy }, rectRadius: 0.1 });
  s.addText([
    { text: "💡  ", options: { fontFace: F.emoji, fontSize: 14 } },
    { text: text, options: { fontFace: F.body, fontSize: 13.5, bold: true, color: "FFFFFF" } }
  ], { x: 0.95, y: 6.62, w: 11.5, h: 0.6, valign: "middle", margin: 0, isTextBox: true });
}
function chip(s, x, y, w, label, fill, tcolor){
  s.addShape(p.ShapeType.roundRect, { x, y, w, h: 0.42, fill: { color: fill || C.chipbg }, rectRadius: 0.21, line: { type: "none" } });
  s.addText(label, { x: x + 0.1, y, w: w - 0.2, h: 0.42, align: "center", valign: "middle", fontFace: F.body, fontSize: 12.5, bold: true, color: tcolor || C.navy2, margin: 0, isTextBox: true });
}

// chevron process ribbon
function ribbon(s, steps, y, colors){
  const w = 2.06, h = 0.98, step = 1.63; let x = 0.62;
  steps.forEach((st, i) => {
    const shp = i === 0 ? p.ShapeType.homePlate : p.ShapeType.chevron;
    s.addShape(shp, { x, y, w, h, fill: { color: colors[i % colors.length] } });
    s.addText([
      { text: "STEP " + (i + 1), options: { fontFace: F.body, fontSize: 8.5, bold: true, color: "FFFFFF", charSpacing: 1 } },
      { text: "\n" + st, options: { fontFace: F.body, fontSize: 11.5, bold: true, color: "FFFFFF" } }
    ], { x: x + (i === 0 ? 0.12 : 0.34), y, w: w - 0.45, h, align: "center", valign: "middle", margin: 0, isTextBox: true, lineSpacingMultiple: 0.95 });
    x += step;
  });
}

// window / device mock chrome
function frame(s, x, y, w, h, barColor, barText){
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: C.white }, line: { color: C.line, width: 1.5 }, rectRadius: 0.09, shadow: sh() });
  s.addShape(p.ShapeType.roundRect, { x, y, w, h: 0.44, fill: { color: barColor || C.navy2 }, rectRadius: 0.09 });
  s.addShape(p.ShapeType.rect, { x, y: y + 0.24, w, h: 0.2, fill: { color: barColor || C.navy2 }, line: { type: "none" } });
  [C.coral, C.gold, C.green].forEach((c, i) => s.addShape(p.ShapeType.ellipse, { x: x + 0.18 + i * 0.22, y: y + 0.16, w: 0.12, h: 0.12, fill: { color: c } }));
  s.addText(barText || "", { x: x + 0.95, y, w: w - 1.1, h: 0.44, valign: "middle", fontFace: F.body, fontSize: 11, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
}
function btn(s, x, y, w, label, fill, tcolor){
  s.addShape(p.ShapeType.roundRect, { x, y, w, h: 0.44, fill: { color: fill }, rectRadius: 0.08, line: { type: "none" } });
  s.addText(label, { x, y, w, h: 0.44, align: "center", valign: "middle", fontFace: F.body, fontSize: 12, bold: true, color: tcolor || "FFFFFF", margin: 0, isTextBox: true });
}
function field(s, x, y, w, label){
  s.addShape(p.ShapeType.roundRect, { x, y, w, h: 0.42, fill: { color: "F4F7FA" }, line: { color: C.line, width: 1 }, rectRadius: 0.06 });
  s.addText(label, { x: x + 0.14, y, w: w - 0.2, h: 0.42, valign: "middle", fontFace: F.body, fontSize: 11.5, color: C.mute, italic: true, margin: 0, isTextBox: true });
}
function note(s, text){ // small "swap with screenshot" hint bottom-right
  s.addText(text, { x: 7.0, y: 6.98, w: 6.0, h: 0.3, align: "right", fontFace: F.body, fontSize: 9.5, italic: true, color: C.mute, margin: 0, isTextBox: true });
}

/* =======================  SLIDES  ======================= */

// 1 — TITLE
(() => {
  const s = p.addSlide(); darkBg(s);
  s.addShape(p.ShapeType.ellipse, { x: 10.4, y: -1.6, w: 4.6, h: 4.6, fill: { color: C.softnavy } });
  s.addShape(p.ShapeType.ellipse, { x: 11.6, y: 4.7, w: 3.4, h: 3.4, fill: { color: "1B3A5A" } });
  iconCircle(s, 0.75, 0.7, 0.95, C.teal, "🧭", 30);
  s.addText("INSET SESSION", { x: 1.9, y: 0.82, w: 8, h: 0.4, fontFace: F.body, fontSize: 14, bold: true, color: C.gold, charSpacing: 3, margin: 0, isTextBox: true });
  s.addText("Contextualized Learning\nMeets a Free Digital Classroom", { x: 0.75, y: 2.35, w: 11.2, h: 2.2, fontFace: F.head, fontSize: 46, bold: true, color: "FFFFFF", margin: 0, isTextBox: true, lineSpacingMultiple: 1.02 });
  s.addText("Gawing digital, gawing makabuluhan — from a local resource to a graded student product.", { x: 0.78, y: 4.55, w: 10.6, h: 0.7, fontFace: F.body, fontSize: 17, italic: true, color: C.chipbg, margin: 0, isTextBox: true });
  chip(s, 0.78, 5.55, 3.5, "🎯  1-hr Talk + 1-hr Workshop", "22456A", "FFFFFF");
  chip(s, 4.45, 5.55, 2.7, "📱  Phone-friendly", "22456A", "FFFFFF");
  chip(s, 7.35, 5.55, 3.0, "🆓  Zero-cost tools", "22456A", "FFFFFF");
  s.addText([{ text: "Presented by:  ", options: { color: C.mute } }, { text: "____________________     •     ____________________ NHS", options: { color: "FFFFFF", bold: true } }], { x: 0.78, y: 6.55, w: 11, h: 0.5, fontFace: F.body, fontSize: 13, margin: 0, isTextBox: true });
  s.addNotes("Opening. Deliver warm, teacher-to-teacher. Full script sa Talk Script .docx.");
})();

// 2 — ICEBREAKER
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Ice-breaker", "Bago tayo mag-simula — isang tanong");
  card(s, 0.7, 1.9, 12.0, 3.0, C.white);
  iconCircle(s, 1.15, 2.35, 1.1, C.gold, "🤔", 34);
  s.addText("“Kailan huli kayong nakarinig ng estudyante na nagsabi —", { x: 2.6, y: 2.25, w: 9.7, h: 0.6, fontFace: F.body, fontSize: 18, color: C.ink, margin: 0, isTextBox: true });
  s.addText("‘Ma’am/Sir, saan po namin magagamit ito sa totoong buhay?’ ”", { x: 2.6, y: 2.9, w: 9.7, h: 0.9, fontFace: F.head, fontSize: 26, bold: true, color: C.navy, margin: 0, isTextBox: true });
  s.addText("Turn to a seatmate — 30 seconds. Isang subject topic na mahirap i-relate sa buhay ng bata.", { x: 2.6, y: 3.95, w: 9.7, h: 0.7, fontFace: F.body, fontSize: 14.5, italic: true, color: C.mute, margin: 0, isTextBox: true });
  takeaway(s, "Hold that topic in mind — babalikan natin ito sa workshop.", C.teal);
  s.addNotes("Let a few teachers shout out answers. Keep it light, ~3 min.");
})();

// 3 — AGENDA / roadmap
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Roadmap", "Ano ang aabutin natin ngayon");
  const items = [
    ["1", C.teal, "🧠", "The Why & The Framework", "Bakit contextualize, at ang 4-part model + learning flow."],
    ["2", C.blue, "💻", "The Tool", "Ang Class Submissions LMS — kung saan pupunta ang output."],
    ["3", C.green, "🙌", "Your Turn (Workshop)", "Hands-on sa phone ninyo — join, submit, at makita ang grade."]
  ];
  let y = 2.05;
  items.forEach(([n, col, em, t, d]) => {
    card(s, 0.7, y, 12.0, 1.35, C.white);
    iconCircle(s, 1.0, y + 0.28, 0.8, col, em, 24);
    s.addText(n, { x: 11.7, y: y + 0.18, w: 0.9, h: 1.0, align: "right", valign: "middle", fontFace: F.head, fontSize: 46, bold: true, color: "E4ECF3", margin: 0, isTextBox: true });
    s.addText(t, { x: 2.0, y: y + 0.24, w: 9.4, h: 0.5, fontFace: F.head, fontSize: 21, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: 2.0, y: y + 0.74, w: 9.4, h: 0.45, fontFace: F.body, fontSize: 14, color: C.mute, margin: 0, isTextBox: true });
    y += 1.55;
  });
  s.addNotes("Set expectations. Emphasize Part 3 is hands-on so they keep phones ready.");
})();

// helper: section divider
function divider(num, kicker, title, emoji, tint2){
  const s = p.addSlide(); darkBg(s);
  s.addShape(p.ShapeType.ellipse, { x: -1.5, y: 4.3, w: 4.6, h: 4.6, fill: { color: C.softnavy } });
  s.addText("PART " + num, { x: 0.9, y: 2.1, w: 6, h: 0.5, fontFace: F.body, fontSize: 16, bold: true, color: C.gold, charSpacing: 4, margin: 0, isTextBox: true });
  s.addText(title, { x: 0.9, y: 2.55, w: 9.4, h: 2.2, fontFace: F.head, fontSize: 44, bold: true, color: "FFFFFF", margin: 0, isTextBox: true, lineSpacingMultiple: 1.0 });
  s.addText(kicker, { x: 0.92, y: 4.7, w: 8.6, h: 0.8, fontFace: F.body, fontSize: 16.5, italic: true, color: C.chipbg, margin: 0, isTextBox: true });
  iconCircle(s, 10.15, 2.5, 2.1, tint2 || C.teal, emoji, 66);
  return s;
}

// 4 — divider part 1
divider("1", "Ang totoong dahilan bakit natin ito ginagawa.", "Why Contextualize?", "🧠", C.teal)
  .addNotes("Transition into the pedagogy. ~10 min for Part 1.");

// 5 — the problem
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "The problem", "Minsan, parang abstract ang lessons", C.coral);
  const pains = [
    ["😕", "Walang kabuluhan", "“Kailan ko ito magagamit?” — disengaged ang bata."],
    ["📄", "Puro worksheet", "Sagot-sagot lang, tapos kalimutan agad."],
    ["🌫️", "Malayo sa buhay", "Ang halimbawa sa libro, hindi kilala ng estudyante."]
  ];
  let x = 0.7;
  pains.forEach(([em, t, d]) => {
    card(s, x, 2.1, 3.87, 3.3, C.white);
    iconCircle(s, x + 1.43, 2.5, 1.0, "F0E4E0", em, 32);
    s.addText(t, { x: x + 0.25, y: 3.65, w: 3.37, h: 0.5, align: "center", fontFace: F.head, fontSize: 19, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.3, y: 4.2, w: 3.27, h: 1.0, align: "center", fontFace: F.body, fontSize: 13.5, color: C.mute, margin: 0, isTextBox: true });
    x += 4.07;
  });
  takeaway(s, "Hindi kulang sa talino ang bata — kulang sa koneksyon ang laman.", C.coral);
  s.addNotes("Name the pain everyone feels. Empathize before offering the fix.");
})();

// 6 — what is contextualization
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Definition", "Ano ang Contextualized Learning?");
  card(s, 0.7, 1.95, 6.05, 4.4, C.white);
  s.addText("Simple lang:", { x: 1.0, y: 2.2, w: 5.4, h: 0.4, fontFace: F.body, fontSize: 14, bold: true, color: C.teal, margin: 0, isTextBox: true });
  s.addText("Iniuugnay ang aralin sa totoong buhay, lugar, at karanasan ng estudyante — para maging makabuluhan at natural ang pag-aaral.", { x: 1.0, y: 2.6, w: 5.45, h: 1.5, fontFace: F.head, fontSize: 21, bold: true, color: C.navy, margin: 0, isTextBox: true, lineSpacingMultiple: 1.05 });
  s.addText([
    { text: "Kasabay nito sa K-12 at MATATAG:\n", options: { bold: true, color: C.ink } },
    { text: "localization, indigenization, at ICT integration — hindi bago, ginagawa na natin. Gagawin lang nating mas sadya at digital.", options: { color: C.mute } }
  ], { x: 1.0, y: 4.35, w: 5.45, h: 1.7, fontFace: F.body, fontSize: 13.5, margin: 0, isTextBox: true, lineSpacingMultiple: 1.05 });
  // right: rows
  const rows = [
    ["🏪", "Local resource", "Palengke, sari-sari, barangay, bukid, simbahan."],
    ["🎯", "Curriculum competency", "Yung talagang dapat matutuhan — walang binago."],
    ["💻", "ICT tool", "Spreadsheet, form, doc, camera — kaya sa phone."],
    ["📄", "Student product", "May aktwal na output na pwedeng i-grade."]
  ];
  let y = 2.0;
  rows.forEach(([em, t, d], i) => {
    card(s, 7.0, y, 5.7, 1.02, C.white);
    iconCircle(s, 7.22, y + 0.21, 0.6, CAT[i], em, 18);
    s.addText(t, { x: 7.95, y: y + 0.14, w: 4.6, h: 0.4, fontFace: F.body, fontSize: 15, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: 7.95, y: y + 0.52, w: 4.65, h: 0.42, fontFace: F.body, fontSize: 12.5, color: C.mute, margin: 0, isTextBox: true });
    y += 1.12;
  });
  s.addNotes("Reassure: this is not extra work, it's a lens on work they already do.");
})();

// 7 — why it works
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Why it works", "Bakit epektibo ito", C.green);
  const b = [
    ["🔗", C.teal, "Relevance", "Kapag kilala ang halimbawa, mas madaling maintindihan."],
    ["🔥", C.gold, "Engagement", "Curious ang bata kapag tungkol sa sarili nilang komunidad."],
    ["🧩", C.green, "Deeper mastery", "Hindi memorize — applied. Nailalapat sa totoong sitwasyon."],
    ["🗣️", C.blue, "21st-century skills", "Data, reasoning, digital tools, decision-making — sabay-sabay."]
  ];
  let x = 0.7, y = 2.05;
  b.forEach(([em, col, t, d], i) => {
    const cx = x + (i % 2) * 6.12; const cy = y + Math.floor(i / 2) * 2.18;
    card(s, cx, cy, 5.88, 1.95, C.white);
    iconCircle(s, cx + 0.3, cy + 0.32, 0.95, col, em, 30);
    s.addText(t, { x: cx + 1.45, y: cy + 0.3, w: 4.2, h: 0.5, fontFace: F.head, fontSize: 20, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: cx + 1.45, y: cy + 0.85, w: 4.25, h: 0.95, fontFace: F.body, fontSize: 13.5, color: C.mute, margin: 0, isTextBox: true });
  });
  takeaway(s, "Authentic data + reasoning + digital output + decision-making = tunay na natututo.", C.green);
  s.addNotes("This mirrors the 'Why it works' line from the sample framework slide.");
})();

// 8 — divider part 2
divider("2", "Isang malinaw na recipe na pwede sa kahit anong subject.", "The Framework", "🧩", C.blue)
  .addNotes("Now the reusable model. This is the heart of the talk.");

// 9 — the 4-part model (HERO, mirrors sample)
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "The model", "Apat na sangkap ng isang contextualized activity");
  const cats = [
    [C.teal, "📍", "LOCAL RESOURCE", "Ano sa paligid?", "Palengke, sari-sari store, barangay hall, bukid."],
    [C.blue, "🎯", "COMPETENCY", "Anong dapat matutuhan?", "Kunin sa curriculum guide — walang binago."],
    [C.brown, "💻", "ICT TOOL", "Anong digital tool?", "Spreadsheet, Google Form/Doc, camera, chart."],
    [C.green, "📄", "PRODUCT", "Anong output?", "Budget planner, infographic, vlog, mini-report."]
  ];
  let x = 0.7;
  cats.forEach(([col, em, t, q, d]) => {
    card(s, x, 2.0, 2.92, 3.85, C.white);
    s.addShape(p.ShapeType.roundRect, { x, y: 2.0, w: 2.92, h: 0.72, fill: { color: col }, rectRadius: 0.11 });
    s.addShape(p.ShapeType.rect, { x, y: 2.5, w: 2.92, h: 0.22, fill: { color: col }, line: { type: "none" } });
    s.addText(t, { x: x + 0.1, y: 2.0, w: 2.72, h: 0.72, align: "center", valign: "middle", fontFace: F.body, fontSize: 13, bold: true, color: "FFFFFF", charSpacing: 1, margin: 0, isTextBox: true });
    iconCircle(s, x + 1.06, 2.95, 0.8, "EEF3F8", em, 26);
    s.addText(q, { x: x + 0.2, y: 3.9, w: 2.52, h: 0.4, align: "center", fontFace: F.body, fontSize: 13.5, bold: true, color: col, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.22, y: 4.35, w: 2.5, h: 1.35, align: "center", fontFace: F.body, fontSize: 12.5, color: C.mute, margin: 0, isTextBox: true, lineSpacingMultiple: 1.02 });
    x += 3.07;
  });
  takeaway(s, "Sagutin ang 4 na tanong — meron ka nang contextualized activity. Ganun kadali.");
  s.addNotes("The hero slide. Walk each card. Tie back to the sample Public Market example next.");
})();

// 10 — learning flow ribbon
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "The learning flow", "Paano dumadaloy ang aktibidad");
  s.addText("Isang malinaw na daan mula obserbasyon hanggang desisyon — dito papasok ang digital tool.", { x: 0.7, y: 1.7, w: 12, h: 0.5, fontFace: F.body, fontSize: 15, color: C.mute, margin: 0, isTextBox: true });
  ribbon(s, ["Observe", "Collect data", "Compute", "Visualize", "Explain", "Recommend"], 2.6, FLOW);
  // detail cards under
  const d = [
    ["👁️", "Tumingin", "Obserbahan mabuti."],
    ["🗂️", "Mag-tala", "I-record ang datos."],
    ["🧮", "Mag-compute", "Gamitin ang math."],
    ["📊", "I-visualize", "Gawing chart o graph."],
    ["💡", "Ipaliwanag", "Anong kahulugan?"],
    ["🤝", "Mag-desisyon", "Anong aksyon?"]
  ];
  let x = 0.62;
  d.forEach(([em, t, txt]) => {
    card(s, x, 4.05, 1.95, 2.05, C.white);
    iconCircle(s, x + 0.68, 4.25, 0.6, "EEF3F8", em, 18);
    s.addText(t, { x: x + 0.075, y: 4.92, w: 1.8, h: 0.35, align: "center", fontFace: F.body, fontSize: 12.5, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(txt, { x: x + 0.075, y: 5.27, w: 1.8, h: 0.75, align: "center", fontFace: F.body, fontSize: 10.5, color: C.mute, margin: 0, isTextBox: true });
    x += 1.63;
  });
  s.addNotes("Point at each chevron. The Visualize + product steps are where ICT shines.");
})();

// 11 — worked example: Public Market -> Math (the sample)
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Worked example  •  Mathematics", "Public Market → Budgeting & Percentages", C.teal);
  const cats = [
    [C.teal, "📍", "Local resource", "Presyo sa palengke: kamatis ₱80, karot ₱60, sibuyas ₱70/kg."],
    [C.blue, "🎯", "Competency", "Percentage, budgeting, at basic data handling."],
    [C.brown, "💻", "ICT tool", "Google Sheets — encode, auto-total, bar/pie chart."],
    [C.green, "📄", "Product", "“My Market Budget Planner” — table + chart + payo."]
  ];
  let x = 0.7;
  cats.forEach(([col, em, t, d]) => {
    card(s, x, 2.0, 2.92, 3.15, C.white);
    iconCircle(s, x + 0.28, 2.25, 0.62, col, em, 19);
    s.addText(t, { x: x + 1.0, y: 2.28, w: 1.85, h: 0.6, valign: "middle", fontFace: F.body, fontSize: 12.5, bold: true, color: col, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.24, y: 3.05, w: 2.5, h: 1.95, fontFace: F.body, fontSize: 13, color: C.ink, margin: 0, isTextBox: true, lineSpacingMultiple: 1.03 });
    x += 3.07;
  });
  takeaway(s, "Ito ang halimbawa sa aming sample slide — pero template lang ito, hindi limitado sa Math.", C.teal);
  s.addNotes("This recreates the projected sample. Stress it is ONE instance of the model.");
})();

// 12-15 — subject examples (data-driven)
const subjExamples = [
  ["Science", C.green, "♻️", "Barangay Waste → Environmental Infographic",
    ["Basura sa barangay / school canteen", "Ecosystems, waste segregation, data", "Canva / Google Slides + phone camera", "Infographic + recommendation poster"]],
  ["English", C.coral, "📰", "Local News → Editorial or Vlog",
    ["Isyu sa komunidad o balita sa barangay", "Persuasive writing, media literacy", "Google Docs / phone video recorder", "Editorial article or 1-min opinion vlog"]],
  ["Araling Panlipunan", C.gold, "🗺️", "Community History → Digital Timeline / Map",
    ["Kwento ng matatanda, lokal na landmark", "Local history, geography, civics", "Google My Maps / Slides timeline", "Interactive map or illustrated timeline"]],
  ["TLE / ICT", C.blue, "🏬", "Sari-sari Store → Mini Inventory System",
    ["Tindahan ng pamilya o kapitbahay", "Spreadsheets, inventory, computation", "Google Sheets (formulas, totals)", "Working inventory + sales tracker"]]
];
subjExamples.forEach(([subj, col, em, title, rows]) => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Subject example  •  " + subj, title, col);
  iconCircle(s, 11.35, 0.62, 1.15, col, em, 36);
  const labels = ["📍 Local resource", "🎯 Competency", "💻 ICT tool", "📄 Product"];
  let y = 2.15;
  rows.forEach((r, i) => {
    card(s, 0.7, y, 12.0, 0.98, C.white);
    s.addShape(p.ShapeType.roundRect, { x: 0.7, y, w: 3.15, h: 0.98, fill: { color: CAT[i] }, rectRadius: 0.11 });
    s.addShape(p.ShapeType.rect, { x: 3.5, y, w: 0.35, h: 0.98, fill: { color: CAT[i] }, line: { type: "none" } });
    s.addText(labels[i], { x: 0.85, y, w: 2.9, h: 0.98, valign: "middle", fontFace: F.body, fontSize: 14, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
    s.addText(r, { x: 4.1, y, w: 8.4, h: 0.98, valign: "middle", fontFace: F.body, fontSize: 15, color: C.ink, margin: 0, isTextBox: true });
    y += 1.1;
  });
  takeaway(s, "Parehong 4-part model — iba lang ang subject at resource. Kaya ito ng lahat.", col);
  s.addNotes("Invite teachers of this subject to imagine their own version.");
});

// 16 — notice the pattern (bridge)
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Notice the pattern", "Lahat ng halimbawa — may PRODUCT");
  card(s, 0.7, 2.0, 12.0, 2.05, "EAF3EF");
  iconCircle(s, 1.05, 2.42, 1.2, C.green, "📄", 38);
  s.addText("Bawat aktibidad, may aktwal na output ang bata — budget planner, infographic, vlog, spreadsheet.", { x: 2.6, y: 2.25, w: 9.8, h: 0.9, fontFace: F.head, fontSize: 22, bold: true, color: C.navy, margin: 0, isTextBox: true, lineSpacingMultiple: 1.02 });
  s.addText("At karamihan nito ay digital — isang link o litrato. Nasa phone na ng bata.", { x: 2.6, y: 3.25, w: 9.8, h: 0.7, fontFace: F.body, fontSize: 15, color: C.mute, margin: 0, isTextBox: true });
  s.addText("So… saan pupunta lahat ng output na ‘yan?", { x: 0.7, y: 4.55, w: 12, h: 0.7, align: "center", fontFace: F.head, fontSize: 26, bold: true, color: C.coral, margin: 0, isTextBox: true });
  s.addText("👇", { x: 0.7, y: 5.35, w: 12, h: 0.8, align: "center", fontFace: F.emoji, fontSize: 40, margin: 0, isTextBox: true });
  s.addNotes("This is the pivot from pedagogy to the tool. Ask the question, pause, then advance.");
})();

// 17 — divider part 3
divider("3", "Ang nawawalang piraso: saan mapupunta ang student output.", "Where Does the Product Go?", "💻", C.blue)
  .addNotes("Introduce the LMS as the answer to the question just posed.");

// 18 — the gap (before)
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "The gap", "Ang dating paraan — magulo", C.coral);
  const pains = [
    ["🧾", "Paper piles", "Stack ng printouts, mabigat, madaling mawala."],
    ["🔗", "Nawawalang links", "Naka-scatter sa Messenger, chat, at email."],
    ["🔁", "Walang feedback loop", "Nakapasa na — pero nakita ba ng bata ang grado?"],
    ["📕", "Walang record", "Hirap i-track kung sino nakapasa at sino hindi."]
  ];
  let x = 0.7, y = 2.05;
  pains.forEach(([em, t, d], i) => {
    const cx = x + (i % 2) * 6.12; const cy = y + Math.floor(i / 2) * 2.18;
    card(s, cx, cy, 5.88, 1.95, C.white);
    iconCircle(s, cx + 0.3, cy + 0.32, 0.95, "F0E4E0", em, 30);
    s.addText(t, { x: cx + 1.45, y: cy + 0.3, w: 4.2, h: 0.5, fontFace: F.head, fontSize: 19, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: cx + 1.45, y: cy + 0.82, w: 4.25, h: 1.0, fontFace: F.body, fontSize: 13.5, color: C.mute, margin: 0, isTextBox: true });
  });
  takeaway(s, "Magandang aktibidad, pero sayang kung magulo ang pag-submit at pag-grade.", C.coral);
  s.addNotes("Make them feel the friction they already live with.");
})();

// 19 — meet the LMS
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "The tool", "Meet the Class Submissions LMS");
  card(s, 0.7, 1.95, 6.15, 4.45, C.white);
  iconCircle(s, 1.05, 2.25, 1.0, C.teal, "🎓", 32);
  s.addText("Isang libreng digital classroom", { x: 2.25, y: 2.3, w: 4.5, h: 0.5, fontFace: F.head, fontSize: 20, bold: true, color: C.navy, margin: 0, isTextBox: true });
  s.addText("kung saan nagpapasa ang estudyante ng LINK o litrato ng kanilang output — nire-review at ginagrade ng teacher, tapos nakikita agad ng bata.", { x: 2.25, y: 2.78, w: 4.4, h: 1.3, fontFace: F.body, fontSize: 14, color: C.ink, margin: 0, isTextBox: true, lineSpacingMultiple: 1.05 });
  s.addText("Ginawa ito ng isang guro, para sa mga guro.", { x: 1.05, y: 5.55, w: 5.6, h: 0.5, fontFace: F.body, fontSize: 14, italic: true, bold: true, color: C.teal, margin: 0, isTextBox: true });
  const facts = [
    ["🆓", "Libre habambuhay", "Walang bayad, walang credit card — Firebase free tier."],
    ["📱", "Phone-first", "Sign in with Google. Gumagana sa kahit lumang phone."],
    ["🔗", "Links & photos", "Google Doc, Drive, YouTube, o litrato — walang mabigat na upload."],
    ["🔒", "Isolated per teacher", "Sariling dashboard bawat guro — hindi nagkikita ang data."]
  ];
  let y = 2.0;
  facts.forEach(([em, t, d], i) => {
    card(s, 7.1, y, 5.6, 1.05, C.white);
    iconCircle(s, 7.32, y + 0.22, 0.6, CAT[i], em, 18);
    s.addText(t, { x: 8.05, y: y + 0.15, w: 4.5, h: 0.4, fontFace: F.body, fontSize: 14.5, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: 8.05, y: y + 0.53, w: 4.55, h: 0.45, fontFace: F.body, fontSize: 12, color: C.mute, margin: 0, isTextBox: true });
    y += 1.13;
  });
  s.addNotes("Keep it plain-language. Stress FREE and PHONE. Live URL: " + APP);
})();

// 20 — how it fits (mini flow)
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "How it fits", "Isinasara ng LMS ang loop", C.blue);
  s.addText("Ang huling hakbang ng framework — ang PRODUCT — dito nabubuhay online.", { x: 0.7, y: 1.7, w: 12, h: 0.5, fontFace: F.body, fontSize: 15, color: C.mute, margin: 0, isTextBox: true });
  const steps = [
    [C.green, "📄", "Product", "Student gawa: link o litrato."],
    [C.teal, "📤", "Submit", "I-paste sa assignment sa LMS."],
    [C.gold, "✅", "Grade", "Teacher: score + feedback."],
    [C.blue, "📣", "Publish", "Nakikita agad ng bata ang grado."]
  ];
  let x = 0.75;
  steps.forEach(([col, em, t, d], i) => {
    card(s, x, 2.75, 2.7, 2.6, C.white);
    iconCircle(s, x + 0.85, 3.05, 1.0, col, em, 32);
    s.addText(t, { x: x + 0.1, y: 4.15, w: 2.5, h: 0.45, align: "center", fontFace: F.head, fontSize: 19, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.15, y: 4.62, w: 2.4, h: 0.7, align: "center", fontFace: F.body, fontSize: 12.5, color: C.mute, margin: 0, isTextBox: true });
    if (i < 3) s.addText("➜", { x: x + 2.5, y: 3.35, w: 0.7, h: 0.7, align: "center", valign: "middle", fontFace: F.emoji, fontSize: 24, color: C.mute, margin: 0, isTextBox: true });
    x += 3.1;
  });
  takeaway(s, "Product → Submit → Grade → Publish. Buo na ang cycle ng contextualized learning.", C.blue);
  s.addNotes("Explicitly connect back to the framework's Product step.");
})();

// 21 — zero-cost / privacy
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Reassurance", "“Libre nga ba talaga? Safe ba?”", C.green);
  const b = [
    ["💸", C.green, "Zero cost, forever", "Firebase Spark free tier — walang bayad kahit dumami ang klase."],
    ["🚫", C.blue, "No file uploads", "Link o compressed photo lang — walang mabigat na storage."],
    ["🔐", C.brown, "Data isolation", "Hiwalay ang bawat teacher; hindi makita ng iba ang grades mo."],
    ["📵", C.coral, "No student passwords", "Google Sign-In lang — walang password system na aalagaan."]
  ];
  let x = 0.7, y = 2.05;
  b.forEach(([em, col, t, d], i) => {
    const cx = x + (i % 2) * 6.12; const cy = y + Math.floor(i / 2) * 2.18;
    card(s, cx, cy, 5.88, 1.95, C.white);
    iconCircle(s, cx + 0.3, cy + 0.32, 0.95, col, em, 30);
    s.addText(t, { x: cx + 1.45, y: cy + 0.3, w: 4.2, h: 0.5, fontFace: F.head, fontSize: 19, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: cx + 1.45, y: cy + 0.82, w: 4.25, h: 1.0, fontFace: F.body, fontSize: 13.5, color: C.mute, margin: 0, isTextBox: true });
  });
  takeaway(s, "Ligtas para sa DepEd budget at para sa student privacy — sadya itong ginawang ganito.", C.green);
  s.addNotes("Preempt the two biggest objections before the demo.");
})();

// 22 — divider part 4 (demo)
divider("4", "Tignan natin sa totoong app — live sa " + APP, "Let's See It Live", "🖥️", C.gold)
  .addNotes("Switch to the live app now if internet is stable. Mockups are the fallback.");

// demo slide helper (browser/phone mock on right, steps on left)
function demoSlide(kicker, title, accent, steps, mockFn){
  const s = p.addSlide(); pageBg(s);
  header(s, kicker, title, accent);
  // steps left
  let y = 2.15;
  steps.forEach(([n, t], i) => {
    s.addShape(p.ShapeType.ellipse, { x: 0.75, y: y, w: 0.5, h: 0.5, fill: { color: accent } });
    s.addText(String(n), { x: 0.75, y: y, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: F.body, fontSize: 15, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
    s.addText(t, { x: 1.45, y: y - 0.05, w: 5.15, h: 0.65, valign: "middle", fontFace: F.body, fontSize: 15, color: C.ink, margin: 0, isTextBox: true, lineSpacingMultiple: 0.98 });
    y += 0.86;
  });
  mockFn(s);
  note(s, "Live demo slide — pwede mong palitan ng totoong screenshot.");
  return s;
}

// 23 — teacher: create subject & section
demoSlide("Teacher side", "Gumawa ng Subject at Section", C.blue,
  [[1, "Sign in with Google (ikaw ang teacher/admin)."], [2, "Add Subject — pangalan, grade, school year at term."], [3, "Buksan ang subject → Add Section (hal. “Grade 9 – Rizal”)."], [4, "Bawat section may sariling join code, auto-generated."]],
  (s) => {
    frame(s, 7.15, 2.0, 5.55, 4.35, C.navy2, "Teacher Dashboard — " + APP);
    btn(s, 7.4, 2.65, 1.9, "+ Add Subject", C.blue);
    field(s, 7.4, 3.25, 5.05, "Subject name — e.g. Mathematics 9");
    field(s, 7.4, 3.78, 2.45, "Grade level");
    field(s, 9.95, 3.78, 2.5, "S.Y. 2026–2027");
    s.addText("SECTIONS", { x: 7.4, y: 4.45, w: 5, h: 0.3, fontFace: F.body, fontSize: 10, bold: true, color: C.mute, charSpacing: 2, margin: 0, isTextBox: true });
    card(s, 7.4, 4.78, 5.05, 1.35, "F4F7FA");
    s.addText("Grade 9 – Rizal", { x: 7.6, y: 4.9, w: 3, h: 0.4, fontFace: F.body, fontSize: 13.5, bold: true, color: C.navy, margin: 0, isTextBox: true });
    chip(s, 9.55, 4.9, 2.7, "Join code:  7K2Q9", "E7F1EF", C.teal);
    btn(s, 7.6, 5.45, 1.75, "Show QR", C.teal);
    btn(s, 9.5, 5.45, 2.75, "Add Assignment", "EAECEF", C.navy2);
  });

// 24 — teacher: join code + QR
demoSlide("Teacher side", "Ibahagi via Join Code o QR", C.teal,
  [[1, "Click “Show QR” sa section — client-side lang, walang third-party."], [2, "I-project ang QR o isulat ang 5-character code."], [3, "Pwede ring “Invite by email” — auto-join pagsign-in."], [4, "Scan ng student → dumiretso sa join screen."]],
  (s) => {
    frame(s, 7.15, 2.0, 5.55, 4.35, C.navy2, "Grade 9 – Rizal  •  Join");
    // QR block (drawn)
    card(s, 8.55, 2.7, 2.75, 2.75, C.white);
    // faux QR grid
    const qx = 8.8, qy = 2.95; const cells = [
      "11111","10001","10101","10001","11111"
    ];
    // draw a denser pseudo-QR
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if ((r * c + r + c) % 3 === 0) s.addShape(p.ShapeType.rect, { x: qx + c * 0.24, y: qy + r * 0.24, w: 0.2, h: 0.2, fill: { color: C.navy }, line: { type: "none" } });
    }
    s.addText("Scan to join", { x: 8.55, y: 5.5, w: 2.75, h: 0.35, align: "center", fontFace: F.body, fontSize: 12, bold: true, color: C.mute, margin: 0, isTextBox: true });
    chip(s, 8.35, 5.95, 3.15, "Code:  7K2Q9", "E7F1EF", C.teal);
  });

// 25 — teacher: add assignment
demoSlide("Teacher side", "Mag-post ng Assignment", C.gold,
  [[1, "Add Assignment sa loob ng section."], [2, "Ilagay: title, instructions, total points, due date."], [3, "Piliin: link submission o photo (image/document)."], [4, "Optional: i-attach ang instructions/rubric link."]],
  (s) => {
    frame(s, 7.15, 2.0, 5.55, 4.35, C.navy2, "New Assignment");
    field(s, 7.4, 2.65, 5.05, "Title — Market Budget Planner");
    field(s, 7.4, 3.18, 5.05, "Instructions — obserbahan ang presyo…");
    field(s, 7.4, 3.71, 2.45, "Total points — 20");
    field(s, 9.95, 3.71, 2.5, "Due — Sep 15");
    s.addText("SUBMISSION TYPE", { x: 7.4, y: 4.35, w: 5, h: 0.3, fontFace: F.body, fontSize: 10, bold: true, color: C.mute, charSpacing: 2, margin: 0, isTextBox: true });
    chip(s, 7.4, 4.68, 1.55, "🔗 Link", "E7EEF5", C.blue);
    chip(s, 9.1, 4.68, 1.75, "📷 Photo", "F1EDE5", C.brown);
    btn(s, 7.4, 5.5, 2.2, "Post assignment", C.gold, C.navy);
  });

// 26 — student: sign in + join
demoSlide("Student side", "Sign in at Sumali sa Klase", C.teal,
  [[1, "Buksan ang link o i-scan ang QR sa phone."], [2, "Tap “Sign in with Google.”"], [3, "Ilagay ang join code (kung hindi via QR)."], [4, "Piliin ang pangalan mula sa roster — tapos!"]],
  (s) => {
    // phone frame
    s.addShape(p.ShapeType.roundRect, { x: 8.9, y: 1.95, w: 2.75, h: 4.5, fill: { color: C.white }, line: { color: C.line, width: 2 }, rectRadius: 0.2, shadow: sh() });
    s.addShape(p.ShapeType.roundRect, { x: 8.9, y: 1.95, w: 2.75, h: 0.7, fill: { color: C.teal }, rectRadius: 0.2 });
    s.addShape(p.ShapeType.rect, { x: 8.9, y: 2.35, w: 2.75, h: 0.3, fill: { color: C.teal }, line: { type: "none" } });
    s.addText("Class Submissions", { x: 8.9, y: 1.95, w: 2.75, h: 0.7, align: "center", valign: "middle", fontFace: F.body, fontSize: 12, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
    btn(s, 9.15, 3.0, 2.25, "Sign in with Google", "EAECEF", C.navy2);
    field(s, 9.15, 3.7, 2.25, "Enter join code");
    s.addText("Pick your name:", { x: 9.15, y: 4.3, w: 2.3, h: 0.3, fontFace: F.body, fontSize: 11, bold: true, color: C.mute, margin: 0, isTextBox: true });
    chip(s, 9.15, 4.63, 2.25, "• Dela Cruz, Juan", "F4F7FA", C.navy2);
    chip(s, 9.15, 5.12, 2.25, "• Santos, Maria", "F4F7FA", C.navy2);
    btn(s, 9.15, 5.7, 2.25, "Join class", C.teal);
  });

// 27 — student: submit
demoSlide("Student side", "Mag-submit ng Output", C.green,
  [[1, "Buksan ang assignment sa My Classes."], [2, "I-paste ang link (Google Doc, Drive, YouTube…)."], [3, "O kumuha/mag-upload ng litrato — auto-compressed."], [4, "Tap Submit. Pwede pa i-retract habang “pending.”"]],
  (s) => {
    s.addShape(p.ShapeType.roundRect, { x: 8.9, y: 1.95, w: 2.75, h: 4.5, fill: { color: C.white }, line: { color: C.line, width: 2 }, rectRadius: 0.2, shadow: sh() });
    s.addShape(p.ShapeType.roundRect, { x: 8.9, y: 1.95, w: 2.75, h: 0.7, fill: { color: C.green }, rectRadius: 0.2 });
    s.addShape(p.ShapeType.rect, { x: 8.9, y: 2.35, w: 2.75, h: 0.3, fill: { color: C.green }, line: { type: "none" } });
    s.addText("Market Budget Planner", { x: 8.9, y: 1.95, w: 2.75, h: 0.7, align: "center", valign: "middle", fontFace: F.body, fontSize: 10.5, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
    field(s, 9.15, 3.0, 2.25, "Paste your link…");
    s.addText("— or —", { x: 9.15, y: 3.55, w: 2.25, h: 0.3, align: "center", fontFace: F.body, fontSize: 10, italic: true, color: C.mute, margin: 0, isTextBox: true });
    btn(s, 9.15, 3.9, 2.25, "📷 Add photo", "F1EDE5", C.brown);
    card(s, 9.15, 4.5, 1.05, 0.9, "F4F7FA");
    s.addText("🖼️", { x: 9.15, y: 4.5, w: 1.05, h: 0.9, align: "center", valign: "middle", fontFace: F.emoji, fontSize: 22, margin: 0, isTextBox: true });
    btn(s, 9.15, 5.6, 2.25, "Submit", C.green);
  });

// 28 — teacher: review + grade + publish
demoSlide("Teacher side", "I-review, I-grade, I-publish", C.gold,
  [[1, "Buksan ang assignment → makikita ang submissions."], [2, "I-preview ang link/litrato nang hindi umaalis."], [3, "Ilagay ang score (out of total) + feedback."], [4, "Publish — makikita na agad ng estudyante."]],
  (s) => {
    frame(s, 7.15, 2.0, 5.55, 4.35, C.navy2, "Submissions — Market Budget Planner");
    card(s, 7.4, 2.65, 5.05, 1.15, "F4F7FA");
    s.addText("Santos, Maria", { x: 7.6, y: 2.75, w: 3, h: 0.4, fontFace: F.body, fontSize: 13.5, bold: true, color: C.navy, margin: 0, isTextBox: true });
    chip(s, 10.4, 2.75, 1.85, "🔗 View link", "E7EEF5", C.blue);
    s.addText("Pending review", { x: 7.6, y: 3.2, w: 3, h: 0.35, fontFace: F.body, fontSize: 11.5, italic: true, color: C.gold, margin: 0, isTextBox: true });
    field(s, 7.4, 4.05, 1.6, "Score / 20");
    field(s, 9.15, 4.05, 3.3, "Feedback — Great work!…");
    btn(s, 7.4, 4.7, 2.0, "Publish grade", C.gold, C.navy);
    s.addText("🔔 Notification bell shows pending counts + new joins.", { x: 7.4, y: 5.55, w: 5.05, h: 0.7, fontFace: F.body, fontSize: 12, italic: true, color: C.mute, margin: 0, isTextBox: true });
  });

// 29 — student: see grade
demoSlide("Student side", "Makita ang Grado at Feedback", C.teal,
  [[1, "Balik sa My Classes — updated na ang status."], [2, "Makikita ang score at feedback ng teacher."], [3, "Walang chat, walang hanap sa ibang app."], [4, "Malinaw: tapos na, may grado na, may sagot na."]],
  (s) => {
    s.addShape(p.ShapeType.roundRect, { x: 8.9, y: 1.95, w: 2.75, h: 4.5, fill: { color: C.white }, line: { color: C.line, width: 2 }, rectRadius: 0.2, shadow: sh() });
    s.addShape(p.ShapeType.roundRect, { x: 8.9, y: 1.95, w: 2.75, h: 0.7, fill: { color: C.teal }, rectRadius: 0.2 });
    s.addShape(p.ShapeType.rect, { x: 8.9, y: 2.35, w: 2.75, h: 0.3, fill: { color: C.teal }, line: { type: "none" } });
    s.addText("My Result", { x: 8.9, y: 1.95, w: 2.75, h: 0.7, align: "center", valign: "middle", fontFace: F.body, fontSize: 12, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
    iconCircle(s, 9.75, 2.95, 1.05, "E7F1EF", "🎉", 32);
    s.addText("18 / 20", { x: 8.9, y: 4.05, w: 2.75, h: 0.55, align: "center", fontFace: F.head, fontSize: 30, bold: true, color: C.green, margin: 0, isTextBox: true });
    chip(s, 9.15, 4.7, 2.25, "✓ Published", "E7F1EF", C.green);
    card(s, 9.15, 5.2, 2.25, 1.0, "F4F7FA");
    s.addText("“Ang linaw ng chart mo, Maria! Add unit price next time.”", { x: 9.25, y: 5.28, w: 2.05, h: 0.85, fontFace: F.body, fontSize: 10, italic: true, color: C.ink, margin: 0, isTextBox: true });
  });

// 30 — extras
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Bonus for teachers", "Mga tulong sa araw-araw");
  const b = [
    ["🔔", C.blue, "Notifications", "Pending submissions, leave requests, at bagong sumali — grouped by name."],
    ["📊", C.teal, "Records grid", "Class record view per section, grouped Written Work / Performance Task."],
    ["🗜️", C.brown, "Photo ZIPs", "I-download lahat ng litratong pinasa — one click, para sa file/report."],
    ["📝", C.gold, "Accomplishment report", "Auto-collage + official DepEd .docx para sa WFH/modular documentation."]
  ];
  let x = 0.7, y = 2.05;
  b.forEach(([em, col, t, d], i) => {
    const cx = x + (i % 2) * 6.12; const cy = y + Math.floor(i / 2) * 2.18;
    card(s, cx, cy, 5.88, 1.95, C.white);
    iconCircle(s, cx + 0.3, cy + 0.32, 0.95, col, em, 30);
    s.addText(t, { x: cx + 1.45, y: cy + 0.3, w: 4.2, h: 0.5, fontFace: F.head, fontSize: 19, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: cx + 1.45, y: cy + 0.82, w: 4.25, h: 1.0, fontFace: F.body, fontSize: 13, color: C.mute, margin: 0, isTextBox: true });
  });
  takeaway(s, "Hindi lang pasahan — buong workflow ng guro, nasa isang lugar.", C.navy);
  s.addNotes("Skim these quickly; depth optional depending on time.");
})();

// 31 — divider part 5 (workshop)
divider("5", "Phones out — gawin natin nang sabay-sabay.", "Your Turn — Workshop", "🙌", C.green)
  .addNotes("Energy up. This is the hands-on hour. Follow the Facilitator Guide .docx.");

// 32 — workshop instructions
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Workshop  •  Hands-on", "Sumali tayo — 4 na hakbang", C.green);
  // left: steps
  const steps = [
    ["1", "Buksan sa phone browser (Chrome/Safari) ang:"],
    ["2", "Tap “Sign in with Google.”"],
    ["3", "I-scan ang QR o ilagay ang join code."],
    ["4", "Mag-submit ng kahit anong link — subukan!"]
  ];
  let y = 2.15;
  steps.forEach(([n, t]) => {
    s.addShape(p.ShapeType.ellipse, { x: 0.75, y, w: 0.55, h: 0.55, fill: { color: C.green } });
    s.addText(n, { x: 0.75, y, w: 0.55, h: 0.55, align: "center", valign: "middle", fontFace: F.body, fontSize: 17, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
    s.addText(t, { x: 1.5, y: y - 0.02, w: 5.6, h: 0.75, valign: "middle", fontFace: F.body, fontSize: 15.5, color: C.ink, margin: 0, isTextBox: true });
    y += 1.0;
  });
  chip(s, 1.5, 5.95, 5.2, "🔗  " + APP, "E7F1EF", C.teal);
  // right: big QR + code
  card(s, 7.6, 1.95, 5.1, 4.9, C.white);
  s.addText("SCAN TO JOIN", { x: 7.6, y: 2.2, w: 5.1, h: 0.4, align: "center", fontFace: F.body, fontSize: 13, bold: true, color: C.mute, charSpacing: 3, margin: 0, isTextBox: true });
  const qx = 8.95, qy = 2.75;
  for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) {
    if ((r * c + r + c) % 3 === 0) s.addShape(p.ShapeType.rect, { x: qx + c * 0.25, y: qy + r * 0.25, w: 0.21, h: 0.21, fill: { color: C.navy }, line: { type: "none" } });
  }
  s.addText("[  Palitan ng totoong section QR  ]", { x: 7.6, y: 5.62, w: 5.1, h: 0.3, align: "center", fontFace: F.body, fontSize: 10, italic: true, color: C.mute, margin: 0, isTextBox: true });
  chip(s, 8.85, 6.05, 2.6, "Code:  _______", "E7EEF5", C.blue);
  s.addNotes("Replace the QR with your real section QR before the talk. Walk the room.");
})();

// 33 — FAQ / objections
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Common questions", "Mga madalas itanong");
  const q = [
    ["📶", "“Paano kung walang internet sa bahay?”", "Pwede sa data, sa school Wi-Fi, o computer lab. Link lang naman ang pinapasa."],
    ["🚫", "“Bakit hindi gumagana ang sign-in?”", "Kung binuksan sa Messenger/FB in-app browser — i-open sa Chrome/Safari. Blocked ng Google ang WebView."],
    ["💰", "“May bayad ba ‘to sa susunod?”", "Wala. Naka-free tier — pinili ito para hindi kailanman maningil."],
    ["🔒", "“Makikita ba ng ibang teacher ang klase ko?”", "Hindi. Isolated ang bawat teacher — sarili mong dashboard lang."]
  ];
  let x = 0.7, y = 2.0;
  q.forEach(([em, ques, ans], i) => {
    const cx = x + (i % 2) * 6.12; const cy = y + Math.floor(i / 2) * 2.25;
    card(s, cx, cy, 5.88, 2.02, C.white);
    iconCircle(s, cx + 0.28, cy + 0.28, 0.7, C.softnavy, em, 20);
    s.addText(ques, { x: cx + 1.15, y: cy + 0.22, w: 4.5, h: 0.75, fontFace: F.body, fontSize: 14.5, bold: true, color: C.navy, margin: 0, isTextBox: true, lineSpacingMultiple: 0.98 });
    s.addText(ans, { x: cx + 1.15, y: cy + 1.02, w: 4.55, h: 0.9, fontFace: F.body, fontSize: 12.5, color: C.mute, margin: 0, isTextBox: true, lineSpacingMultiple: 1.0 });
  });
  s.addNotes("Have these ready; they WILL be asked. Full answers in the script.");
})();

// 34 — close / CTA
(() => {
  const s = p.addSlide(); darkBg(s);
  s.addShape(p.ShapeType.ellipse, { x: 10.6, y: 4.6, w: 4.2, h: 4.2, fill: { color: C.softnavy } });
  s.addShape(p.ShapeType.ellipse, { x: -1.4, y: -1.6, w: 4.0, h: 4.0, fill: { color: "1B3A5A" } });
  iconCircle(s, 0.85, 0.75, 0.95, C.green, "🚀", 30);
  s.addText("Simulan natin", { x: 2.0, y: 0.9, w: 8, h: 0.5, fontFace: F.body, fontSize: 15, bold: true, color: C.gold, charSpacing: 3, margin: 0, isTextBox: true });
  s.addText("Isang local resource.\nIsang digital product.\nIsang graded output.", { x: 0.85, y: 2.0, w: 11, h: 2.4, fontFace: F.head, fontSize: 40, bold: true, color: "FFFFFF", margin: 0, isTextBox: true, lineSpacingMultiple: 1.03 });
  s.addText("Pumili ng isang topic ngayong linggo. Gawing contextualized. Ipasa sa LMS. Ganun kadali ang simula.", { x: 0.88, y: 4.5, w: 10.6, h: 0.8, fontFace: F.body, fontSize: 16, italic: true, color: C.chipbg, margin: 0, isTextBox: true });
  chip(s, 0.88, 5.5, 4.4, "🔗  " + APP, "22456A", "FFFFFF");
  chip(s, 5.5, 5.5, 4.3, "✉️  Ask me for teacher access", "22456A", "FFFFFF");
  s.addText("Salamat! Mga tanong? 🙌", { x: 0.88, y: 6.35, w: 11, h: 0.7, fontFace: F.head, fontSize: 24, bold: true, color: C.gold, margin: 0, isTextBox: true });
  s.addNotes("Close warm. Invite them to try it this week and to ask for granted access.");
})();

const OUT = "D:/Desktop/INSET-Talk/INSET-Contextualized-Learning-LMS.pptx";
p.writeFile({ fileName: OUT }).then(f => console.log("WROTE:", f)).catch(e => { console.error(e); process.exit(1); });
