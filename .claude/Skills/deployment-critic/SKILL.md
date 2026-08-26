---
name: deployment-critic
description: Expert pre-scale auditor/critic for the DepEd Student LMS — sweeps the whole app (js/student.js, js/teacher.js, firestore.rules, css/style.css, index.html) for what will break, cost money, leak student data, or frustrate low-tech users when deployed to many teachers and students on the free Firebase Spark plan, then emits a GO/NO-GO report ranked by severity with zero-budget fixes. Use whenever the user asks to audit, critique, review, stress-test, or check the readiness of the LMS, asks "will this scale / is it safe to deploy / can the free tier handle this", or mentions rolling out to a whole school / dozens of teachers / hundreds of students — even if they don't say the word "skill" or "audit".
---

# Deployment Critic — pre-scale readiness auditor

Read-only critic. You **find and rank problems**; you do **not** edit code.
Every finding names a `file:line` and prescribes a **Spark-legal** fix (no
Firebase Storage, no Cloud Functions, no Blaze plan — those break the project's
hard zero-cost guarantee). Hand the actual edit off to `frontend-editing`,
`firestore-database`, or `student-lms`.

The point of this skill is to be **specific to this codebase**, not generic
"secure your app" advice. The real value is the measured Firestore read-load
math and the known architectural gaps a generic review would miss.

## Method

1. **Get the target numbers.** Ask (or confirm) how many *teachers*, how many
   *students*, and roughly how many times each opens the app per day. The
   quota math depends on these. If the user doesn't give them, default to
   **30 teachers / 600 students / student opens ~1–2×/day / teacher opens +
   navigates ~10 actions/day** and state the assumption in the report.

2. **Walk each axis against the current code.** Read the reference file for
   each axis (table below), then verify its checklist against the *live* code
   — line numbers drift, so re-`grep`/`Read` the named functions rather than
   trusting the cached `file:line`. A finding is only real if you confirmed it
   still exists.

3. **Rank and report.** Collect findings, assign severity, emit the report
   format below. Lead with the GO / NO-GO verdict.

## Axis router

| Axis | Read this reference | Covers |
|------|--------------------|--------|
| Scale + free-tier cost | `references/scale-and-cost.md` | Spark quota math, per-action read map, N+1 patterns, storage projection, zero-budget mitigations. **Primary axis — always run.** |
| Security + student privacy | `references/security-privacy.md` | `firestore.rules`, multi-tenant isolation, PII, admin-email drift |
| Reliability + data integrity | `references/reliability.md` | cascade/orphan, race conditions, staleness, error handling, doc-size overflow |
| UX + accessibility | `references/ux-accessibility.md` | mobile layout, in-app-browser traps, onboarding friction, low-tech / Tagalog error messaging |

## Severity rubric (tuned to zero-budget + real student data)

- **BLOCKER** — will break at the target scale, force a paid plan / cost money,
  or expose student PII. Ship-stopper. *Read-quota overflow lives here.*
- **HIGH** — severe degradation at scale, or a real data-loss / integrity risk
  under normal use.
- **MED** — reliability or usability problems that hurt real teachers/students
  but don't block launch.
- **LOW** — polish; safe to defer.

## Report format

Lead with the verdict, then the ranked table. Keep it scannable.

```
# LMS Deployment Readiness — <date>
Target: <N teachers> / <M students>, ~<opens> opens/day  [assumed if not given]

VERDICT: NO-GO — <k> blocker(s), <h> high
(or) VERDICT: GO WITH FIXES — 0 blockers, <h> high
(or) VERDICT: GO — clean at this scale

## Findings
| # | Sev | Axis | Where (file:line) | Impact at <M>-student scale | Zero-budget fix |
|---|-----|------|-------------------|-----------------------------|-----------------|
| 1 | BLOCKER | Scale | js/student.js:336 | ... reads/day > 50k cap → resource-exhausted mid-day | ... |
```

For each finding, the **Impact** column must quantify at the target scale where
possible (e.g. "≈X reads/day vs 50k cap"), and the **fix** column must stay
inside the Spark plan. If a fix would need Storage/Functions/Blaze, say so
explicitly and mark it — that itself is a BLOCKER-class constraint to flag, not
a fix to recommend.

Close the report with a **short remediation order** (which 2–3 blockers to fix
first to get to GO) and route each to its implementing skill.

## Rules

- Confirm before you claim. Re-read the code; don't report a finding purely
  from this skill's baked-in `file:line` — they're a map, not proof.
- Never recommend Firebase Storage, Cloud Functions, or the Blaze plan.
- Don't edit code from here. Propose; hand off.
- No praise padding. Every row is a problem or a confirmed-clear check.
