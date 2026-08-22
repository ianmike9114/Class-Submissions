---
name: deped-accomplishment-report
description: Generate the official DepEd "Individual Daily Log and Accomplishment Report" (.docx) for Work-from-Home/Alternative Work Arrangement documentation, filling activity dates, accomplishment narratives, and Means of Verification photos into the fixed Anonang NHS template. Use when the user asks to create, fill out, or regenerate an Accomplishment Report / daily log for WFH or modular activities, or wants to document a class activity for DepEd submission.
---

# DepEd Accomplishment Report generator

Produces the real, already-in-use DepEd "Individual Daily Log and
Accomplishment Report" `.docx` — the Work-from-Home/Alternative Work
Arrangement daily log, not the app's separate in-browser generic
accomplishment-report feature (`js/teacher.js`'s
`buildAccomplishmentReportDocx`, a simple title/date/collage/description
doc). Don't confuse the two or touch that JS feature from this skill.

The user wants this document to **follow the real template exactly** —
same header, same table shape, same signature block, same photo-evidence
layout. Never invent a different structure. The template lives at
`assets/Accomplishment-Report-Template.docx` in this skill folder — treat
it as the single source of truth for layout, fonts, and styling.

## Inputs to collect (ask only for what's missing)

- **Activity date(s) covered.** Each distinct date becomes one row in
  the log table AND one "Means of Verification" section further down.
  Accept a list ("July 10 and 13, 2026") or asked one at a time.
- **Per-date accomplishment narrative** — what was actually done that
  date, in the teacher's own words. If one narrative covers a date
  range, reuse it for every date in that range unless told otherwise.
- **Photo folder** — path to a folder of submission photos for the
  relevant assignment/section. These should already have correct dates
  burned in — if the user hasn't run [[geotag-photo-date-fix]] on them
  yet and the photos are GeoTag-Camera-style watermarked images with a
  wrong visible date, suggest running that skill first, then come back
  here with the corrected folder. If the folder mixes photos from
  multiple dates, ask which photos go under which date (filenames or
  their visible date stamps are the first clue; ask if ambiguous).
- **Output filename/location**, if the user wants something other than
  the default below.
- Anything in "Defaults" below — only if the user overrides it in the
  same message. Don't ask about these unless something seems off (see
  the approver-title note).

## Defaults (baked in, reused every run unless overridden)

These come straight from the real template and represent one fixed
person/school setup — same pattern as this repo's
`lac-session-docs` skill baking in a default teacher roster.

- **Header block**: "Republic of the Philippines" / "Region I" /
  "Department of Education" / "PANGASINAN DIVISION II" / "ANONANG
  NATIONAL HIGH SCHOOL" / "San Fabian, Pangasinan"
- **Document title**: "INDIVIDUAL DAILY LOG AND ACCOMPLISHMENT REPORT"
- **Employee**: "IAN JOSEPH F. GALUTIRA" — **Division**: "SDO PANGASINAN
  II" — **Bureau/Service**: "DEPED"
- **Arrangement** (first table column): "Work-from-Home" for every row,
  unless the user says a particular date was different (e.g. in-office,
  2-week shift).
- **Signature block**:
  - Submitted by: IAN JOSEPH F. GALUTIRA, Teacher II
  - Verified by: MIGUEL V. CACHO, PhD, Head Teacher III/OIC, SHS
  - Approved by: HAZEL O. MARIANO, PhD, Principal IV — the template used
    to carry a stray leftover "Asst. Principal II" concatenated onto the
    Verified-by title (a copy/paste artifact, not a real alternate
    value); confirmed removed and title settled as "Principal IV" only.
    If you ever regenerate the template asset itself from a newer
    source, check this line hasn't reverted before trusting it blindly.
  - No "Date: ___" line under any of the three signatures, and no date
    value after "Date/s Covered:" — both removed from the template by
    request (redundant with the date already shown per-activity
    elsewhere). Don't reintroduce either without being asked.
- **School logo position**: fixed in the template (was overlapping/
  misaligned, nudged right ~1in via `positionH`/`posOffset`). Don't
  touch its anchor position unless the user reports it's off again.

## Generating the document

**Clone the real template — don't rebuild the structure from scratch.**
The template's exact fonts, margins, table borders, and paragraph styles
are what makes this "the real thing" to the user; reconstructing an
equivalent layout via generic docx authoring risks subtle drift (column
widths, font substitution, spacing) that a straight clone avoids. Use
python-docx (or the `anthropic-skills:docx` skill's tooling) against
`assets/Accomplishment-Report-Template.docx`:

1. Copy the asset to the output path (or open it directly with
   `Document(template_path)`) — never edit the asset file itself; it
   must stay pristine as the clone source for every future run.
2. Find the "Name of Employee:" paragraph by its label text and replace
   only the trailing value, preserving the run's existing formatting
   (bold/font untouched). **Leave "Date/s Covered:" with nothing after
   it** — the template ships with that value already blank; don't fill
   it in. Same for the log table's date/weekday line (next step) and
   the "Means of Verification" date subheading (step 5) — all three
   date displays were deliberately removed by request as redundant with
   the activity date already implied elsewhere in the doc/filename.
   Don't add any of them back without being asked.
3. The log table is `doc.tables[0]`. Reuse its existing first data row
   for the first activity date (edit the 3 cell texts in place — don't
   delete/recreate the row, that's how formatting gets lost). The date
   column's first paragraph (date + weekday) ships blank — leave it
   blank, only fill the "Time: ..." paragraph below it. For every
   additional date, `copy.deepcopy(row._tr)` on that row's XML element,
   append it to the table, then edit the new row's cells (same blank
   date-line convention). This is the standard python-docx pattern for
   adding rows that visually match an existing one.
4. Signature block: locate by "Submitted by:"/"Verified by:"/"Approved
   by:" text. Leave as-is unless the user explicitly gave different
   names for this run.
5. "Means of Verification" sections: the template has a heading
   paragraph + blank date-line paragraph + inline photos pattern for the
   first date. Use it as-is for the first date's photos (date line stays
   blank — see step 2). For each additional date, clone that
   heading+date-line pattern (insert new paragraph elements right after
   the anchor, before the next section) and insert that date's photos
   there — not appended to the end of the document. Keep photos at
   their natural aspect ratio, scaled to roughly the same width as the
   real photos in the template (about 4-5 inches) — don't go
   full-page-width, that's not how the template looks today.
   **Multi-date caveat**: with the date subheading blanked, nothing in
   the doc text distinguishes one date's MOV section from another's
   photos. That was fine for the single-date report this convention
   came from; if you're generating a report with 2+ dates, flag this to
   the user before finishing and ask whether the MOV date lines should
   be filled in for that run specifically, since blank sections would
   read as ambiguous.
6. Save to a per-run path, e.g.
   `Accomplishment-Report-<Section-or-Assignment>-<DateRangeSlug>.docx`.

## Related skill

[[geotag-photo-date-fix]] — run it first if the candidate photos have a
GeoTag Camera watermark showing the wrong date; hand this skill the
corrected output folder, not the original photos.
