// INSET deck generator — Class Submissions LMS (the system is the star)
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const _isz = require("image-size");
const sizeOf = _isz.imageSize || _isz.default || _isz;
const p = new pptxgen();
p.layout = "LAYOUT_WIDE";           // 13.333 x 7.5
p.author = "DepEd Teacher";
p.company = "INSET";
p.title = "Class Submissions LMS";
const W = 13.333, H = 7.5;

const C = {
  navy: "14304A", navy2: "1E3A5F", softnavy: "26456A",
  teal: "2A9D8F", gold: "E1A140", green: "4C956C", brown: "9B6A43",
  blue: "2F6DB5", coral: "E4694E", violet: "6C6CBF",
  light: "F1F5FA", white: "FFFFFF", ink: "20303F", mute: "6B7A88",
  line: "D9E2EB", chipbg: "E7EEF5"
};
const F = { head: "Cambria", body: "Calibri", emoji: "Segoe UI Emoji" };
const CAT = [C.teal, C.blue, C.brown, C.green];
const FLOW = [C.teal, C.blue, C.gold, C.green, C.coral, C.softnavy];

const sh = () => ({ type: "outer", color: "9DB0C2", blur: 9, offset: 3, angle: 90, opacity: 0.35 });
const APP = "deped-class-submissions.vercel.app";

// --- optional real screenshots: drop slide23.png .. slide29.png in this folder ---
const SHOT_DIR = "D:/Desktop/INSET-Talk/screenshots/";
function findShot(n) {
  for (const e of ["png", "jpg", "jpeg", "PNG", "JPG", "JPEG"]) {
    const f = SHOT_DIR + "slide" + n + "." + e;
    if (fs.existsSync(f)) return f;
  }
  return null;
}
function placeShot(s, file) {
  const boxX = 7.3, boxY = 1.95, boxW = 5.4, boxH = 4.78, pad = 0.16;
  s.addShape(p.ShapeType.roundRect, { x: boxX, y: boxY, w: boxW, h: boxH, fill: { color: "FFFFFF" }, line: { color: C.line, width: 1 }, rectRadius: 0.09, shadow: sh() });
  let iw = 1600, ih = 900;
  try { const d = sizeOf(fs.readFileSync(file)); iw = d.width; ih = d.height; } catch (e) {}
  const maxW = boxW - 2 * pad, maxH = boxH - 2 * pad;
  const scale = Math.min(maxW / iw, maxH / ih);
  const w = iw * scale, h = ih * scale;
  s.addImage({ path: file, x: boxX + (boxW - w) / 2, y: boxY + (boxH - h) / 2, w, h });
}
let demoNum = 22; // demoSlide() calls are screenshot slots slide23..slide29

/* ---------------- helpers ---------------- */
function pageBg(s){ s.background = { color: C.light }; }
function darkBg(s){ s.background = { color: C.navy }; }
function card(s, x, y, w, h, fill){
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: fill || C.white }, line: { color: C.line, width: 1 }, rectRadius: 0.11, shadow: sh() });
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
function ribbon(s, steps, y, colors, showStep){
  if (showStep === undefined) showStep = true;
  const w = 2.06, h = 0.98, step = 1.63; let x = 0.62;
  steps.forEach((st, i) => {
    const shp = i === 0 ? p.ShapeType.homePlate : p.ShapeType.chevron;
    s.addShape(shp, { x, y, w, h, fill: { color: colors[i % colors.length] } });
    const runs = showStep
      ? [{ text: "STEP " + (i + 1), options: { fontFace: F.body, fontSize: 8.5, bold: true, color: "FFFFFF", charSpacing: 1 } }, { text: "\n" + st, options: { fontFace: F.body, fontSize: 11.5, bold: true, color: "FFFFFF" } }]
      : [{ text: st, options: { fontFace: F.body, fontSize: 12.5, bold: true, color: "FFFFFF" } }];
    s.addText(runs, { x: x + (i === 0 ? 0.12 : 0.34), y, w: w - 0.45, h, align: "center", valign: "middle", margin: 0, isTextBox: true, lineSpacingMultiple: 0.95 });
    x += step;
  });
}
// 2x2 feature cards: items = [[emoji, color, title, desc], ...]
function quad(s, items, topY){
  const x0 = 0.7, y0 = topY || 2.05;
  items.forEach(([em, col, t, d], i) => {
    const cx = x0 + (i % 2) * 6.12; const cy = y0 + Math.floor(i / 2) * 2.18;
    card(s, cx, cy, 5.88, 1.95, C.white);
    iconCircle(s, cx + 0.3, cy + 0.32, 0.95, col, em, 30);
    s.addText(t, { x: cx + 1.45, y: cy + 0.3, w: 4.2, h: 0.5, fontFace: F.head, fontSize: 19, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: cx + 1.45, y: cy + 0.82, w: 4.25, h: 1.0, fontFace: F.body, fontSize: 13.5, color: C.mute, margin: 0, isTextBox: true });
  });
}
// 3 columns: items = [[emoji, color, title, desc], ...]
function trio(s, items, topY, h){
  const y = topY || 2.1, ch = h || 3.3; let x = 0.7;
  items.forEach(([em, col, t, d]) => {
    card(s, x, y, 3.87, ch, C.white);
    iconCircle(s, x + 1.43, y + 0.35, 1.0, col, em, 32);
    s.addText(t, { x: x + 0.2, y: y + 1.5, w: 3.47, h: 0.5, align: "center", fontFace: F.head, fontSize: 18, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.3, y: y + 2.02, w: 3.27, h: ch - 2.1, align: "center", fontFace: F.body, fontSize: 13, color: C.mute, margin: 0, isTextBox: true, lineSpacingMultiple: 1.02 });
    x += 4.07;
  });
}
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
function note(s, text){ s.addText(text, { x: 7.0, y: 6.98, w: 6.0, h: 0.3, align: "right", fontFace: F.body, fontSize: 9.5, italic: true, color: C.mute, margin: 0, isTextBox: true }); }

function divider(num, kicker, title, emoji, tint2){
  const s = p.addSlide(); darkBg(s);
  s.addShape(p.ShapeType.ellipse, { x: -1.5, y: 4.3, w: 4.6, h: 4.6, fill: { color: C.softnavy } });
  s.addText("PART " + num, { x: 0.9, y: 2.1, w: 6, h: 0.5, fontFace: F.body, fontSize: 16, bold: true, color: C.gold, charSpacing: 4, margin: 0, isTextBox: true });
  s.addText(title, { x: 0.9, y: 2.55, w: 9.4, h: 2.2, fontFace: F.head, fontSize: 44, bold: true, color: "FFFFFF", margin: 0, isTextBox: true, lineSpacingMultiple: 1.0 });
  s.addText(kicker, { x: 0.92, y: 4.7, w: 8.6, h: 0.8, fontFace: F.body, fontSize: 16.5, italic: true, color: C.chipbg, margin: 0, isTextBox: true });
  iconCircle(s, 10.15, 2.5, 2.1, tint2 || C.teal, emoji, 66);
  return s;
}
// demo slide: steps left, screenshot (if present) or mockup right
function demoSlide(kicker, title, accent, steps, mockFn){
  const s = p.addSlide(); pageBg(s);
  header(s, kicker, title, accent);
  let y = 2.15;
  steps.forEach(([n, txt]) => {
    s.addShape(p.ShapeType.ellipse, { x: 0.75, y: y, w: 0.5, h: 0.5, fill: { color: accent } });
    s.addText(String(n), { x: 0.75, y: y, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: F.body, fontSize: 15, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
    s.addText(txt, { x: 1.45, y: y - 0.05, w: 5.15, h: 0.65, valign: "middle", fontFace: F.body, fontSize: 15, color: C.ink, margin: 0, isTextBox: true, lineSpacingMultiple: 0.98 });
    y += 0.86;
  });
  demoNum++;
  const shot = findShot(demoNum);
  if (shot) { placeShot(s, shot); note(s, "Screenshot mula sa live app."); }
  else { mockFn(s); note(s, "Live demo slide — pwede mong palitan ng totoong screenshot."); }
  return s;
}

/* =======================  SLIDES  ======================= */

// 1 — TITLE
(() => {
  const s = p.addSlide(); darkBg(s);
  s.addShape(p.ShapeType.ellipse, { x: 10.4, y: -1.6, w: 4.6, h: 4.6, fill: { color: C.softnavy } });
  s.addShape(p.ShapeType.ellipse, { x: 11.6, y: 4.7, w: 3.4, h: 3.4, fill: { color: "1B3A5A" } });
  iconCircle(s, 0.75, 0.7, 0.95, C.teal, "🎓", 30);
  s.addText("CLASS SUBMISSIONS LMS", { x: 1.9, y: 0.82, w: 9, h: 0.4, fontFace: F.body, fontSize: 14, bold: true, color: C.gold, charSpacing: 3, margin: 0, isTextBox: true });
  s.addText("A Free Digital Classroom\nBuilt for Real Teachers", { x: 0.75, y: 2.3, w: 11.2, h: 2.2, fontFace: F.head, fontSize: 46, bold: true, color: "FFFFFF", margin: 0, isTextBox: true, lineSpacingMultiple: 1.02 });
  s.addText("Mag-submit ng link o litrato. I-grade. I-publish ang feedback — lahat sa isang lugar, at libre.", { x: 0.78, y: 4.5, w: 10.8, h: 0.7, fontFace: F.body, fontSize: 17, italic: true, color: C.chipbg, margin: 0, isTextBox: true });
  chip(s, 0.78, 5.5, 2.7, "🆓  Free forever", "22456A", "FFFFFF");
  chip(s, 3.65, 5.5, 2.7, "📱  Phone-first", "22456A", "FFFFFF");
  chip(s, 6.55, 5.5, 3.0, "🔗  Links & photos", "22456A", "FFFFFF");
  s.addText([{ text: "Presented by:  ", options: { color: C.mute } }, { text: "____________________     •     ____________________ NHS", options: { color: "FFFFFF", bold: true } }], { x: 0.78, y: 6.5, w: 11.5, h: 0.5, fontFace: F.body, fontSize: 13, margin: 0, isTextBox: true });
  s.addNotes("Ako gumawa ng system na ito. Deliver with quiet pride, teacher-to-teacher.");
})();

// 2 — HOOK
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "The itch", "Ilang beses mo nang hinanap ang project ng bata… sa Messenger?", C.coral);
  card(s, 0.7, 2.0, 12.0, 2.7, C.white);
  iconCircle(s, 1.15, 2.75, 1.15, "F0E4E0", "🔍", 36);
  s.addText("Scattered ang submissions — chat, email, printout, kung saan-saan.", { x: 2.7, y: 2.45, w: 9.6, h: 0.7, fontFace: F.head, fontSize: 23, bold: true, color: C.navy, margin: 0, isTextBox: true });
  s.addText("Nakapasa na ba lahat? Nasaan ang link? Nakita ba ng bata ang grado at feedback? Mahirap i-track — at nakaka-ubos ng oras.", { x: 2.7, y: 3.35, w: 9.6, h: 1.1, fontFace: F.body, fontSize: 15, color: C.mute, margin: 0, isTextBox: true, lineSpacingMultiple: 1.05 });
  chip(s, 0.75, 5.05, 3.7, "🧾 Nawawalang papel", "F0E4E0", C.coral);
  chip(s, 4.65, 5.05, 3.5, "🔗 Kalat na links", "F0E4E0", C.coral);
  chip(s, 8.35, 5.05, 4.25, "🔁 Walang feedback loop", "F0E4E0", C.coral);
  takeaway(s, "May mas maayos na paraan — kaya ako gumawa ng sariling system.", C.coral);
  s.addNotes("Open with the shared pain. Everyone recognizes this.");
})();

// 3 — ROADMAP
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Roadmap", "Ang tatlong bahagi ngayon");
  const items = [
    ["1", C.teal, "🛠️", "Why I built it & what it is", "Ang problema, ang solusyon, at kung bakit libre."],
    ["2", C.blue, "💻", "How it works", "Live demo — teacher side at student side, dulo-dulo."],
    ["3", C.green, "🙌", "Your turn (workshop)", "Hands-on kayo mismo sa phone ninyo."]
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
  s.addNotes("Keep phones ready for Part 3.");
})();

// 4 — divider Part 1
divider("1", "Ang problema, ang solusyon, at ang mga desisyon sa likod.", "Why I Built This", "🛠️", C.teal)
  .addNotes("Origin story — bakit ka nag-develop ng sarili mong tool.");

// 5 — the problem
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "The old way", "Magulo ang dating paraan", C.coral);
  quad(s, [
    ["🧾", "F0E4E0", "Paper piles", "Stack ng printout — mabigat, madaling mawala o masira."],
    ["🔗", "F0E4E0", "Nawawalang links", "Naka-scatter sa Messenger, chat, at email."],
    ["🔁", "F0E4E0", "Walang feedback loop", "Nakapasa na — pero nakita ba ng bata ang grado?"],
    ["📕", "F0E4E0", "Walang record", "Hirap i-track kung sino nakapasa at sino hindi."]
  ]);
  takeaway(s, "Magandang gawain ng bata, pero sayang kung magulo ang pagpasa at pag-grade.", C.coral);
  s.addNotes("Name the friction they live with daily.");
})();

// 6 — meet the LMS
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "The system", "Ito ang Class Submissions LMS");
  card(s, 0.7, 1.95, 6.15, 4.45, C.white);
  iconCircle(s, 1.05, 2.25, 1.0, C.teal, "🎓", 32);
  s.addText("Isang libreng digital classroom", { x: 2.25, y: 2.3, w: 4.5, h: 0.5, fontFace: F.head, fontSize: 20, bold: true, color: C.navy, margin: 0, isTextBox: true });
  s.addText("kung saan nagpapasa ang estudyante ng LINK o litrato ng output nila — nire-review at ginagrade ng teacher, tapos nakikita agad ng bata ang score at feedback.", { x: 2.25, y: 2.78, w: 4.4, h: 1.35, fontFace: F.body, fontSize: 14, color: C.ink, margin: 0, isTextBox: true, lineSpacingMultiple: 1.05 });
  s.addText("Ginawa ko ito para sa sarili kong klase — at pwede na ring gamitin ng kahit sinong guro.", { x: 1.05, y: 5.5, w: 5.6, h: 0.7, fontFace: F.body, fontSize: 14, italic: true, bold: true, color: C.teal, margin: 0, isTextBox: true });
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
  s.addNotes("Plain language. Stress FREE + PHONE. Live URL: " + APP);
})();

// 7 — the core loop
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "The core idea", "Isang malinis na loop", C.blue);
  s.addText("Ito ang buong buhay ng isang submission — mula bata, balik sa bata.", { x: 0.7, y: 1.7, w: 12, h: 0.5, fontFace: F.body, fontSize: 15, color: C.mute, margin: 0, isTextBox: true });
  ribbon(s, ["Submit", "Review", "Grade", "Publish", "Bata sees it"], 2.7, FLOW);
  const d = [
    ["📤", "Isumite", "Link o litrato ng output."],
    ["👀", "I-review", "Preview nang di umaalis."],
    ["✅", "I-grade", "Score + feedback."],
    ["📣", "I-publish", "Isang tap para makita."],
    ["🎉", "Makita", "Grado + feedback agad."]
  ];
  let x = 0.62;
  d.forEach(([em, t, txt]) => {
    card(s, x, 4.1, 2.28, 2.0, C.white);
    iconCircle(s, x + 0.84, 4.3, 0.6, "EEF3F8", em, 18);
    s.addText(t, { x: x + 0.09, y: 4.98, w: 2.1, h: 0.35, align: "center", fontFace: F.body, fontSize: 13, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(txt, { x: x + 0.12, y: 5.33, w: 2.05, h: 0.7, align: "center", fontFace: F.body, fontSize: 10.5, color: C.mute, margin: 0, isTextBox: true });
    x += 2.39;
  });
  s.addNotes("This loop is the whole product in one picture.");
})();

// 8 — links, not uploads
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "By design", "Links, hindi uploads");
  s.addText("Walang mabigat na file upload. Nagpapasa ang bata ng LINK — o litrato mula sa phone. Ito ang nagpapanatili sa system na libre at mabilis.", { x: 0.7, y: 1.72, w: 12, h: 0.7, fontFace: F.body, fontSize: 15, color: C.mute, margin: 0, isTextBox: true, lineSpacingMultiple: 1.04 });
  const kinds = [
    ["📄", C.blue, "Google Docs / Slides", "Preview mismo sa loob ng app."],
    ["📁", C.teal, "Google Drive file / folder", "Isa o maramihang file, embedded."],
    ["▶️", C.coral, "YouTube", "Auto-embed ng video output."],
    ["💻", C.violet, "CodePen / GitHub Gist", "Para sa ICT at coding tasks."],
    ["📷", C.brown, "In-app photo", "Camera o gallery, auto-compressed."],
    ["🔗", C.green, "Kahit anong link", "Basta 'anyone with link can view.'"]
  ];
  let x = 0.7, y = 2.5;
  kinds.forEach(([em, col, t, d], i) => {
    const cx = x + (i % 3) * 4.07; const cy = y + Math.floor(i / 3) * 1.9;
    card(s, cx, cy, 3.87, 1.7, C.white);
    iconCircle(s, cx + 0.28, cy + 0.32, 0.72, col, em, 22);
    s.addText(t, { x: cx + 1.15, y: cy + 0.28, w: 2.6, h: 0.6, valign: "middle", fontFace: F.body, fontSize: 14.5, bold: true, color: C.navy, margin: 0, isTextBox: true, lineSpacingMultiple: 0.95 });
    s.addText(d, { x: cx + 0.28, y: cy + 1.02, w: 3.4, h: 0.55, fontFace: F.body, fontSize: 12.5, color: C.mute, margin: 0, isTextBox: true });
  });
  s.addNotes("Explain WHY links: keeps it free (no Storage) + works on weak connections.");
})();

// 9 — free & private
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Safe by design", "Libre, at ligtas para sa bata", C.green);
  quad(s, [
    ["💸", C.green, "Zero cost, forever", "Firebase free tier — walang bayad kahit dumami ang klase."],
    ["🚫", C.blue, "No file uploads", "Link o compressed photo lang — walang mabigat na storage."],
    ["🔐", C.brown, "Data isolation", "Hiwalay ang bawat teacher; hindi makita ng iba ang grades mo."],
    ["📵", C.coral, "No student passwords", "Google Sign-In lang — walang password system na aalagaan."]
  ]);
  takeaway(s, "Ligtas para sa DepEd budget at para sa student privacy — sadya kong ginawang ganito.", C.green);
  s.addNotes("Preempt cost + privacy objections.");
})();

// 10 — how it stays free (the build)
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Behind the scenes", "Paano ito nananatiling libre", C.violet);
  trio(s, [
    ["🌐", C.blue, "Static site", "Plain HTML/CSS/JS na naka-host sa Vercel — walang paid server."],
    ["🔥", C.gold, "Firebase (free tier)", "Auth + Firestore lang. Walang Storage o Cloud Functions na may bayad."],
    ["🔑", C.teal, "Google Sign-In", "Walang sariling password system na kailangang bantayan."]
  ], 2.15, 3.5);
  takeaway(s, "Piniling ganito ang arkitektura para hindi kailanman maningil — hard rule ng project.", C.violet);
  s.addNotes("Showcase the engineering — this is YOUR build. Keep it simple, non-jargon.");
})();

// 11 — divider Part 2
divider("2", "Live demo — teacher side at student side, buo.", "How It Works", "💻", C.blue)
  .addNotes("Switch to the live app if internet is stable. Screenshots/mockups are fallback.");

// 12 — the three roles
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "The players", "Tatlong role sa system");
  trio(s, [
    ["👩‍🏫", C.blue, "Teacher", "Gumagawa ng Subjects, Sections, at Assignments. Nagre-review at nagga-grade."],
    ["🧑‍🎓", C.teal, "Student", "Sumasali via join code o QR, at nagpapasa ng link o litrato."],
    ["🛡️", C.gold, "Super Admin", "Nagbibigay ng teacher access, at nakikita ang lahat kung kailangan."]
  ]);
  takeaway(s, "Isang app, tatlong view — automatic depende sa email na naka-sign in.", C.navy);
  s.addNotes("Set up who-does-what before the demo.");
})();

// 13 — the structure
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "The structure", "Paano naka-ayos ang data");
  s.addText("Malinaw na hierarchy — madaling hanapin ang kahit ano.", { x: 0.7, y: 1.72, w: 12, h: 0.5, fontFace: F.body, fontSize: 15, color: C.mute, margin: 0, isTextBox: true });
  const steps = [
    [C.blue, "📚", "Subject", "Isa bawat term (with year & term)."],
    [C.teal, "🗂️", "Section", "May sariling join code + QR."],
    [C.gold, "📝", "Assignment", "Link o photo, total points, due date."],
    [C.green, "📤", "Submission", "Output ng bata + finalGrade."]
  ];
  let x = 0.75;
  steps.forEach(([col, em, t, d], i) => {
    card(s, x, 2.75, 2.7, 2.6, C.white);
    iconCircle(s, x + 0.85, 3.05, 1.0, col, em, 30);
    s.addText(t, { x: x + 0.1, y: 4.15, w: 2.5, h: 0.45, align: "center", fontFace: F.head, fontSize: 19, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.15, y: 4.62, w: 2.4, h: 0.7, align: "center", fontFace: F.body, fontSize: 12, color: C.mute, margin: 0, isTextBox: true });
    if (i < 3) s.addText("➜", { x: x + 2.5, y: 3.35, w: 0.7, h: 0.7, align: "center", valign: "middle", fontFace: F.emoji, fontSize: 24, color: C.mute, margin: 0, isTextBox: true });
    x += 3.1;
  });
  takeaway(s, "Subject → Section → Assignment → Submission. Simple, pero kaya ang buong klase.", C.blue);
  s.addNotes("Give a mental map before clicking around.");
})();

// 14–20 = the 7 demo slides (screenshot slots slide23..slide29)
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

demoSlide("Teacher side", "Ibahagi via Join Code o QR", C.teal,
  [[1, "Click “Show QR” sa section — client-side lang, walang third-party."], [2, "I-project ang QR o isulat ang 5-character code."], [3, "Pwede ring “Invite by email” — auto-join pagsign-in."], [4, "Scan ng student → dumiretso sa join screen."]],
  (s) => {
    frame(s, 7.15, 2.0, 5.55, 4.35, C.navy2, "Grade 9 – Rizal  •  Join");
    card(s, 8.55, 2.7, 2.75, 2.75, C.white);
    const qx = 8.8, qy = 2.95;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if ((r * c + r + c) % 3 === 0) s.addShape(p.ShapeType.rect, { x: qx + c * 0.24, y: qy + r * 0.24, w: 0.2, h: 0.2, fill: { color: C.navy }, line: { type: "none" } });
    }
    s.addText("Scan to join", { x: 8.55, y: 5.5, w: 2.75, h: 0.35, align: "center", fontFace: F.body, fontSize: 12, bold: true, color: C.mute, margin: 0, isTextBox: true });
    chip(s, 8.35, 5.95, 3.15, "Code:  7K2Q9", "E7F1EF", C.teal);
  });

demoSlide("Teacher side", "Mag-post ng Assignment", C.gold,
  [[1, "Add Assignment sa loob ng section."], [2, "Ilagay: title, instructions, total points, due date."], [3, "Piliin: link submission o photo (image/document)."], [4, "Optional: i-attach ang instructions/rubric link."]],
  (s) => {
    frame(s, 7.15, 2.0, 5.55, 4.35, C.navy2, "New Assignment");
    field(s, 7.4, 2.65, 5.05, "Title — Weekly Project");
    field(s, 7.4, 3.18, 5.05, "Instructions — paste your link…");
    field(s, 7.4, 3.71, 2.45, "Total points — 20");
    field(s, 9.95, 3.71, 2.5, "Due — Sep 15");
    s.addText("SUBMISSION TYPE", { x: 7.4, y: 4.35, w: 5, h: 0.3, fontFace: F.body, fontSize: 10, bold: true, color: C.mute, charSpacing: 2, margin: 0, isTextBox: true });
    chip(s, 7.4, 4.68, 1.55, "🔗 Link", "E7EEF5", C.blue);
    chip(s, 9.1, 4.68, 1.75, "📷 Photo", "F1EDE5", C.brown);
    btn(s, 7.4, 5.5, 2.2, "Post assignment", C.gold, C.navy);
  });

demoSlide("Student side", "Sign in at Sumali sa Klase", C.teal,
  [[1, "Buksan ang link o i-scan ang QR sa phone."], [2, "Tap “Sign in with Google.”"], [3, "Ilagay ang join code (kung hindi via QR)."], [4, "Piliin ang pangalan mula sa roster — tapos!"]],
  (s) => {
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

demoSlide("Student side", "Mag-submit ng Output", C.green,
  [[1, "Buksan ang assignment sa My Classes."], [2, "I-paste ang link (Google Doc, Drive, YouTube…)."], [3, "O kumuha/mag-upload ng litrato — auto-compressed."], [4, "Tap Submit. Pwede pa i-retract habang “pending.”"]],
  (s) => {
    s.addShape(p.ShapeType.roundRect, { x: 8.9, y: 1.95, w: 2.75, h: 4.5, fill: { color: C.white }, line: { color: C.line, width: 2 }, rectRadius: 0.2, shadow: sh() });
    s.addShape(p.ShapeType.roundRect, { x: 8.9, y: 1.95, w: 2.75, h: 0.7, fill: { color: C.green }, rectRadius: 0.2 });
    s.addShape(p.ShapeType.rect, { x: 8.9, y: 2.35, w: 2.75, h: 0.3, fill: { color: C.green }, line: { type: "none" } });
    s.addText("Weekly Project", { x: 8.9, y: 1.95, w: 2.75, h: 0.7, align: "center", valign: "middle", fontFace: F.body, fontSize: 11.5, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
    field(s, 9.15, 3.0, 2.25, "Paste your link…");
    s.addText("— or —", { x: 9.15, y: 3.55, w: 2.25, h: 0.3, align: "center", fontFace: F.body, fontSize: 10, italic: true, color: C.mute, margin: 0, isTextBox: true });
    btn(s, 9.15, 3.9, 2.25, "📷 Add photo", "F1EDE5", C.brown);
    card(s, 9.15, 4.5, 1.05, 0.9, "F4F7FA");
    s.addText("🖼️", { x: 9.15, y: 4.5, w: 1.05, h: 0.9, align: "center", valign: "middle", fontFace: F.emoji, fontSize: 22, margin: 0, isTextBox: true });
    btn(s, 9.15, 5.6, 2.25, "Submit", C.green);
  });

demoSlide("Teacher side", "I-review, I-grade, I-publish", C.gold,
  [[1, "Buksan ang assignment → makikita ang submissions."], [2, "I-preview ang link/litrato nang hindi umaalis."], [3, "Ilagay ang score (out of total) + feedback."], [4, "Publish — makikita na agad ng estudyante."]],
  (s) => {
    frame(s, 7.15, 2.0, 5.55, 4.35, C.navy2, "Submissions — Weekly Project");
    card(s, 7.4, 2.65, 5.05, 1.15, "F4F7FA");
    s.addText("Santos, Maria", { x: 7.6, y: 2.75, w: 3, h: 0.4, fontFace: F.body, fontSize: 13.5, bold: true, color: C.navy, margin: 0, isTextBox: true });
    chip(s, 10.4, 2.75, 1.85, "🔗 View link", "E7EEF5", C.blue);
    s.addText("Pending review", { x: 7.6, y: 3.2, w: 3, h: 0.35, fontFace: F.body, fontSize: 11.5, italic: true, color: C.gold, margin: 0, isTextBox: true });
    field(s, 7.4, 4.05, 1.6, "Score / 20");
    field(s, 9.15, 4.05, 3.3, "Feedback — Great work!…");
    btn(s, 7.4, 4.7, 2.0, "Publish grade", C.gold, C.navy);
    s.addText("🔔 Notification bell shows pending counts + new joins.", { x: 7.4, y: 5.55, w: 5.05, h: 0.7, fontFace: F.body, fontSize: 12, italic: true, color: C.mute, margin: 0, isTextBox: true });
  });

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
    s.addText("“Ang linaw ng output mo, Maria! Keep it up.”", { x: 9.25, y: 5.28, w: 2.05, h: 0.85, fontFace: F.body, fontSize: 10, italic: true, color: C.ink, margin: 0, isTextBox: true });
  });

// 21 — notifications
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Feature", "Notification bell — 3 buckets", C.blue);
  trio(s, [
    ["📥", C.blue, "Pending submissions", "Ilan ang naghihintay ng grado, per assignment."],
    ["🚪", C.coral, "Leave requests", "Sino ang humihiling na umalis sa klase."],
    ["✨", C.green, "New joins", "Sino ang bagong sumali — by name, click to jump."]
  ]);
  takeaway(s, "Click ang row → dumidiretso sa mismong assignment o student. Walang hahanapin.", C.blue);
  s.addNotes("The bell is the teacher's daily home base.");
})();

// 22 — records grid
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Feature", "Records grid — parang Class Record", C.teal);
  card(s, 0.7, 2.0, 6.0, 4.3, C.white);
  iconCircle(s, 1.05, 2.3, 1.0, C.teal, "📊", 32);
  s.addText("Buong section sa isang grid", { x: 2.25, y: 2.35, w: 4.3, h: 0.5, fontFace: F.head, fontSize: 19, bold: true, color: C.navy, margin: 0, isTextBox: true });
  s.addText("Bawat roster student, bawat assignment — nakikita mo agad kung sino ang may score at sino ang “Not joined” pa.", { x: 2.25, y: 2.85, w: 4.25, h: 1.2, fontFace: F.body, fontSize: 13.5, color: C.ink, margin: 0, isTextBox: true, lineSpacingMultiple: 1.05 });
  s.addText("Para lang sa tingin/encode — ikaw pa rin ang bahala sa opisyal na Class Record.", { x: 1.05, y: 5.5, w: 5.4, h: 0.7, fontFace: F.body, fontSize: 12.5, italic: true, color: C.mute, margin: 0, isTextBox: true });
  const facts = [
    ["🧑‍🤝‍🧑", "Grouped by gender", "Male / Female blocks, gaya ng totoong Class Record."],
    ["🗂️", "WW / PT columns", "Written Work at Performance Task, naka-hanay."],
    ["🚧", "“Not joined” markers", "Kitang-kita kung sino ang wala pa sa system."]
  ];
  let y = 2.15;
  facts.forEach(([em, t, d]) => {
    card(s, 6.95, y, 5.75, 1.3, C.white);
    iconCircle(s, 7.2, y + 0.3, 0.7, C.teal, em, 20);
    s.addText(t, { x: 8.1, y: y + 0.2, w: 4.4, h: 0.4, fontFace: F.body, fontSize: 14.5, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: 8.1, y: y + 0.62, w: 4.5, h: 0.6, fontFace: F.body, fontSize: 12.5, color: C.mute, margin: 0, isTextBox: true });
    y += 1.42;
  });
  s.addNotes("Reassure: it doesn't replace their real Class Record, it helps them fill it.");
})();

// 23 — photos + ZIPs
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Feature", "Photo submissions + one-click ZIP", C.brown);
  quad(s, [
    ["📷", C.brown, "In-app camera / gallery", "Para sa image/document tasks — walang link kailangan."],
    ["🗜️", C.blue, "Auto-compressed", "Hanggang 10 pages, kasya sa libreng Firestore limit."],
    ["📦", C.teal, "Download all as ZIP", "Lahat ng litrato ng assignment, isang click."],
    ["🔔", C.gold, "“Photo ZIPs” panel", "Bawat assignment na may litrato, nasa isang lugar."]
  ]);
  takeaway(s, "Perpekto para sa modular/WFH outputs na naka-litrato — madaling i-file o i-print.", C.brown);
  s.addNotes("Highlight this for teachers doing photo-based outputs.");
})();

// 24 — accomplishment report
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Feature", "Accomplishment report generator", C.gold);
  card(s, 0.7, 2.0, 6.0, 4.3, C.white);
  iconCircle(s, 1.05, 2.3, 1.0, C.gold, "📝", 32);
  s.addText("DepEd form, auto-filled", { x: 2.25, y: 2.35, w: 4.3, h: 0.5, fontFace: F.head, fontSize: 19, bold: true, color: C.navy, margin: 0, isTextBox: true });
  s.addText("Mula sa mga litratong pinasa, gumagawa ang app ng photo collage at ng opisyal na “Individual Daily Log and Accomplishment Report” (.docx).", { x: 2.25, y: 2.85, w: 4.25, h: 1.6, fontFace: F.body, fontSize: 13.5, color: C.ink, margin: 0, isTextBox: true, lineSpacingMultiple: 1.05 });
  s.addText("Para sa WFH / modular / calamity documentation — hindi na kailangang gawin nang manu-mano.", { x: 1.05, y: 5.55, w: 5.4, h: 0.7, fontFace: F.body, fontSize: 12.5, italic: true, color: C.mute, margin: 0, isTextBox: true });
  const facts = [
    ["🖼️", "Photo collage", "Scrapbook-style, reshuffle sa isang click."],
    ["📄", "Official .docx", "Totoong template — buo ang font, seal, borders."],
    ["✍️", "Editable narrative", "Auto-draft na maikling paliwanag, pwede baguhin."]
  ];
  let y = 2.15;
  facts.forEach(([em, t, d]) => {
    card(s, 6.95, y, 5.75, 1.3, C.white);
    iconCircle(s, 7.2, y + 0.3, 0.7, C.gold, em, 20);
    s.addText(t, { x: 8.1, y: y + 0.2, w: 4.4, h: 0.4, fontFace: F.body, fontSize: 14.5, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(d, { x: 8.1, y: y + 0.62, w: 4.5, h: 0.6, fontFace: F.body, fontSize: 12.5, color: C.mute, margin: 0, isTextBox: true });
    y += 1.42;
  });
  s.addNotes("A crowd-pleaser — saves real paperwork time.");
})();

// 25 — roster & invites
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Feature", "Roster, name-picker & invites", C.violet);
  quad(s, [
    ["🧾", C.violet, "Seed the roster", "I-paste o i-upload ang listahan — kasama ang gender."],
    ["🙋", C.teal, "Pick-your-name", "Pinipili ng bata ang totoong pangalan sa roster."],
    ["✉️", C.blue, "Invite by Gmail", "Auto-join pagsign-in — walang click-to-accept."],
    ["📱", C.green, "QR join", "I-scan, dumiretso sa join screen ng section."]
  ]);
  takeaway(s, "Tama ang pangalan by construction — tugma sa totoong Class Record.", C.violet);
  s.addNotes("Explains how names stay clean and matchable.");
})();

// 26 — isolation & PWA
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "For everyone", "Para sa maraming guro + installable");
  const cards = [
    ["👥", C.blue, "Multi-teacher", "Sariling dashboard bawat guro — fully isolated ang data.", "Isang super admin ang nagbibigay ng access."],
    ["⬇️", C.teal, "Installable app (PWA)", "Pwede i-install sa home screen ng phone.", "May offline shell — bubukas kahit mahina ang signal."]
  ];
  let x = 0.7;
  cards.forEach(([em, col, t, d, d2]) => {
    card(s, x, 2.1, 5.88, 3.6, C.white);
    iconCircle(s, x + 0.35, 2.45, 1.05, col, em, 34);
    s.addText(t, { x: x + 1.6, y: 2.55, w: 4.0, h: 0.85, valign: "middle", fontFace: F.head, fontSize: 20, bold: true, color: C.navy, margin: 0, isTextBox: true, lineSpacingMultiple: 0.95 });
    s.addText(d, { x: x + 0.4, y: 3.75, w: 5.1, h: 0.9, fontFace: F.body, fontSize: 14, color: C.ink, margin: 0, isTextBox: true, lineSpacingMultiple: 1.04 });
    s.addText(d2, { x: x + 0.4, y: 4.7, w: 5.1, h: 0.8, fontFace: F.body, fontSize: 13, italic: true, color: C.mute, margin: 0, isTextBox: true });
    x += 6.12;
  });
  takeaway(s, "Isang tool, kayang gamitin ng buong faculty — nang hindi nagkakagulo ang datos.", C.navy);
  s.addNotes("Position it as ready for the whole school, not just you.");
})();

// 27 — low-tech friendly
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Real classrooms", "Ginawa para sa totoong sitwasyon", C.green);
  quad(s, [
    ["📟", C.green, "Old phones OK", "Magaan — links at compressed photos lang."],
    ["📶", C.blue, "Weak signal OK", "Walang mabigat na upload; gumagana sa data."],
    ["🚪", C.coral, "In-app browser guard", "Kapag Messenger/FB, may 'Open in Chrome' na patnubay."],
    ["🐞", C.gold, "?debug=1 banner", "On-screen error message kapag may problema — madaling i-report."]
  ]);
  takeaway(s, "Sinadyang gawing matibay para sa DepEd realities — hindi laboratory-perfect lang.", C.green);
  s.addNotes("Show you designed for the messiness of real fieldwork.");
})();

// 28 — divider Part 3
divider("3", "Phones out — subukan ninyo mismo.", "Your Turn — Workshop", "🙌", C.green)
  .addNotes("Energy up. Hands-on hour. Follow the Workshop Facilitator Guide.");

// 29 — workshop instructions
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Workshop  •  Hands-on", "Sumali tayo — 4 na hakbang", C.green);
  const steps = [
    ["1", "Buksan sa phone browser (Chrome/Safari) ang:"],
    ["2", "Tap “Sign in with Google.”"],
    ["3", "I-scan ang QR o ilagay ang join code."],
    ["4", "Mag-submit ng kahit anong link — subukan!"]
  ];
  let y = 2.15;
  steps.forEach(([n, txt]) => {
    s.addShape(p.ShapeType.ellipse, { x: 0.75, y, w: 0.55, h: 0.55, fill: { color: C.green } });
    s.addText(n, { x: 0.75, y, w: 0.55, h: 0.55, align: "center", valign: "middle", fontFace: F.body, fontSize: 17, bold: true, color: "FFFFFF", margin: 0, isTextBox: true });
    s.addText(txt, { x: 1.5, y: y - 0.02, w: 5.6, h: 0.75, valign: "middle", fontFace: F.body, fontSize: 15.5, color: C.ink, margin: 0, isTextBox: true });
    y += 1.0;
  });
  chip(s, 1.5, 5.95, 5.2, "🔗  " + APP, "E7F1EF", C.teal);
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

// 30 — FAQ
(() => {
  const s = p.addSlide(); pageBg(s);
  header(s, "Common questions", "Mga madalas itanong");
  const q = [
    ["📶", "“Paano kung walang internet sa bahay?”", "Pwede sa data, sa school Wi-Fi, o computer lab. Link lang naman ang pinapasa."],
    ["🚫", "“Bakit hindi gumagana ang sign-in?”", "Kung binuksan sa Messenger/FB in-app browser — i-open sa Chrome/Safari. Blocked ng Google ang WebView."],
    ["💰", "“May bayad ba ‘to sa susunod?”", "Wala. Naka-free tier — sinadyang ganito para hindi kailanman maningil."],
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
  s.addNotes("Have these ready — they will be asked.");
})();

// 31 — close
(() => {
  const s = p.addSlide(); darkBg(s);
  s.addShape(p.ShapeType.ellipse, { x: 10.6, y: 4.6, w: 4.2, h: 4.2, fill: { color: C.softnavy } });
  s.addShape(p.ShapeType.ellipse, { x: -1.4, y: -1.6, w: 4.0, h: 4.0, fill: { color: "1B3A5A" } });
  iconCircle(s, 0.85, 0.75, 0.95, C.green, "🚀", 30);
  s.addText("Subukan natin", { x: 2.0, y: 0.9, w: 8, h: 0.5, fontFace: F.body, fontSize: 15, bold: true, color: C.gold, charSpacing: 3, margin: 0, isTextBox: true });
  s.addText("Isang klase.\nIsang link.\nIsang grado — nakikita agad.", { x: 0.85, y: 1.95, w: 11, h: 2.45, fontFace: F.head, fontSize: 40, bold: true, color: "FFFFFF", margin: 0, isTextBox: true, lineSpacingMultiple: 1.03 });
  s.addText("Gawin nating mas madali ang pagpasa at pag-grade — libre, sa phone, para sa lahat.", { x: 0.88, y: 4.55, w: 10.8, h: 0.8, fontFace: F.body, fontSize: 16, italic: true, color: C.chipbg, margin: 0, isTextBox: true });
  chip(s, 0.88, 5.5, 4.4, "🔗  " + APP, "22456A", "FFFFFF");
  chip(s, 5.5, 5.5, 4.5, "✉️  Ask me for teacher access", "22456A", "FFFFFF");
  s.addText("Salamat! Mga tanong? 🙌", { x: 0.88, y: 6.35, w: 11, h: 0.7, fontFace: F.head, fontSize: 24, bold: true, color: C.gold, margin: 0, isTextBox: true });
  s.addNotes("Close warm. Invite them to try it and to ask for granted access.");
})();

const OUT = "D:/Desktop/INSET-Talk/INSET-Class-Submissions-LMS.pptx";
p.writeFile({ fileName: OUT }).then(f => console.log("WROTE:", f)).catch(e => { console.error(e); process.exit(1); });
