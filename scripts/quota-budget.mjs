#!/usr/bin/env node
// Spark-plan quota budget ("load test" for a free Firebase app): estimates
// Firestore reads/writes per day for N students and M teachers from
// tests/load/session-costs.json and compares them with the free daily limits.
//
//   npm run budget -- --students 300 --teachers 10
//   npm run budget -- --students 300 --teachers 10 --studentSessionsPerDay 3
//
// Any assumption in session-costs.json can be overridden with --<name> <n>.
// Dev-only: never touches Firebase.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const COSTS = JSON.parse(readFileSync(resolve(here, "../tests/load/session-costs.json"), "utf8"));

// Formulas are plain arithmetic over assumption names - evaluated with only
// those names in scope (numbers), nothing else.
export function evalFormula(expr, vars) {
  if (!/^[\w\s+\-*/().]+$/.test(expr)) throw new Error(`Bad formula: ${expr}`);
  const names = Object.keys(vars);
  return Function(...names, `"use strict"; return (${expr});`)(...names.map((n) => Number(vars[n])));
}

export function level(used, limit) {
  const pct = used / limit;
  return pct < 0.5 ? "GREEN" : pct <= 0.8 ? "YELLOW" : "RED";
}

export function budget({ students, teachers, overrides = {}, costs = COSTS }) {
  const a = { ...costs.assumptions, ...overrides };
  const per = {};
  for (const [name, act] of Object.entries(costs.actions)) {
    per[name] = { reads: evalFormula(act.reads, a), writes: evalFormula(act.writes, a) };
  }
  const studentReads = a.studentSessionsPerDay * per.studentDashboardLoad.reads + a.studentSubmitsPerDay * per.studentSubmit.reads;
  const studentWrites = a.studentSubmitsPerDay * per.studentSubmit.writes;
  const teacherReads = a.teacherSessionsPerDay * per.teacherHomeLoad.reads + a.teacherAssignmentsGradedPerDay * per.teacherGradeAssignment.reads;
  const teacherWrites = a.teacherAssignmentsGradedPerDay * per.teacherGradeAssignment.writes;
  const reads = Math.round(students * studentReads + teachers * teacherReads);
  const writes = Math.round(students * studentWrites + teachers * teacherWrites);
  const { readsPerDay, writesPerDay } = costs.limits;
  // Max students/day with these teachers, whichever limit runs out first.
  const maxByReads = Math.floor((readsPerDay - teachers * teacherReads) / studentReads);
  const maxByWrites = studentWrites > 0 ? Math.floor((writesPerDay - teachers * teacherWrites) / studentWrites) : Infinity;
  return {
    per, studentReads, teacherReads, reads, writes,
    readLevel: level(reads, readsPerDay), writeLevel: level(writes, writesPerDay),
    maxStudents: Math.max(0, Math.min(maxByReads, maxByWrites)),
  };
}

function parseArgs(argv) {
  const out = { students: 300, teachers: 10, overrides: {} };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, "");
    const v = Number(argv[i + 1]);
    if (!Number.isFinite(v)) throw new Error(`--${k} needs a number`);
    if (k === "students" || k === "teachers") out[k] = v; else out.overrides[k] = v;
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const r = budget(args);
  const { readsPerDay, writesPerDay } = COSTS.limits;
  const pct = (n, d) => `${Math.round((n / d) * 100)}%`;
  console.log(`Spark quota budget - ${args.students} students, ${args.teachers} teachers\n`);
  console.log("Per action (reads / writes):");
  for (const [k, v] of Object.entries(r.per)) console.log(`  ${k.padEnd(24)} ${String(Math.round(v.reads)).padStart(5)} / ${v.writes}`);
  console.log(`\nPer student per day: ${Math.round(r.studentReads)} reads   Per teacher per day: ${Math.round(r.teacherReads)} reads`);
  console.log(`\nReads/day : ${r.reads.toLocaleString()} of ${readsPerDay.toLocaleString()} (${pct(r.reads, readsPerDay)})  ${r.readLevel}`);
  console.log(`Writes/day: ${r.writes.toLocaleString()} of ${writesPerDay.toLocaleString()} (${pct(r.writes, writesPerDay)})  ${r.writeLevel}`);
  console.log(`\nMax active students/day on the free plan (with ${args.teachers} teachers): ~${r.maxStudents.toLocaleString()}`);
  if (r.readLevel === "RED") process.exitCode = 1;
}
