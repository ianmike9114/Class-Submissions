// Read-only: which term and week is a date in? No Firebase, no network.
//   node tools/lms-agent/week-of.mjs --date 2026-11-16   ->  {"term":2,"week":9,"sy":"2026-2027"}
// Week 1 = the Monday-based week containing the term start; full break weeks are not counted.
// Never guesses: missing start, date before the first term, or a date inside a break is an error.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const DAY = 86400000;
const parse = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ""));
  if (!m) throw new Error(`Bad date "${s}", expected YYYY-MM-DD`);
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (new Date(t).toISOString().slice(0, 10) !== s) throw new Error(`Bad date "${s}"`);
  return t;
};
const mondayOf = (t) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;

export function weekOf(dateStr, calendar) {
  const d = parse(dateStr);
  const terms = (calendar?.terms ?? []).filter((t) => t && t.start).map((t) => ({ term: t.term, start: parse(t.start) }));
  if (!terms.length) throw new Error("school-calendar.json has no term start dates; fill them in.");
  const cands = terms.filter((t) => t.start <= d).sort((a, b) => b.start - a.start);
  if (!cands.length) throw new Error(`${dateStr} is before the first term start; fill in the earlier term's start date.`);
  const cur = cands[0];
  const breaks = (calendar.breaks ?? []).filter((b) => b && b.from && b.to).map((b) => ({ from: parse(b.from), to: parse(b.to), label: b.label }));
  for (const b of breaks) {
    if (d >= b.from && d <= b.to) throw new Error(`${dateStr} falls inside a break (${b.label || b.from + " to " + b.to}); no week number.`);
  }
  const startMon = mondayOf(cur.start);
  const dateMon = mondayOf(d);
  let week = (dateMon - startMon) / (7 * DAY) + 1;
  for (let m = startMon + 7 * DAY; m < dateMon; m += 7 * DAY) {
    if (breaks.some((b) => m >= b.from && m + 6 * DAY <= b.to)) week--;
  }
  return { term: cur.term, week, sy: calendar.schoolYear };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const i = process.argv.indexOf("--date");
    const date = i > 0 ? process.argv[i + 1] : null;
    if (!date) throw new Error("Usage: node tools/lms-agent/week-of.mjs --date YYYY-MM-DD");
    const cal = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "school-calendar.json"), "utf8"));
    console.log(JSON.stringify(weekOf(date, cal)));
  } catch (e) {
    console.error("Error: " + e.message);
    process.exit(1);
  }
}
