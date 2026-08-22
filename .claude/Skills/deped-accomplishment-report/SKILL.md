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
  - Approved by: HAZEL O. MARIANO, PhD — the title on this line has
    appeared as both "Asst. Principal II" and "Principal IV" across
    source material. Read the actual title straight out of the bundled
    template asset when generating (don't guess or hardcode which one
    is current) — it may reflect a real promotion/reassignment. If you
    ever regenerate the template asset itself from a newer source and
    the title differs from what's here, ask the user once to confirm
    which is correct.

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
2. Find the "Name of Employee:" and "Date/s Covered:" paragraphs by
   their label text and replace only the trailing value, preserving the
   run's existing formatting (bold/font untouched).
3. The log table is `doc.tables[0]`. Reuse its existing first data row
   for the first activity date (edit the 3 cell texts in place — don't
   delete/recreate the row, that's how formatting gets lost). For every
   additional date, `copy.deepcopy(row._tr)` on that row's XML element,
   append it to the table, then edit the new row's cells. This is the
   standard python-docx pattern for adding rows that visually match an
   existing one.
4. Signature block: locate by "Submitted by:"/"Verified by:"/"Approved
   by:" text. Leave as-is unless the user explicitly gave different
   names for this run.
5. "Means of Verification" sections: the template has a heading
   paragraph + date line + inline photos pattern for the first date.
   Use it as-is for the first date's photos. For each additional date,
   clone that heading+date-line pattern (insert new paragraph elements
   right after the anchor, before the next section) and insert that
   date's photos there — not appended to the end of the document. Keep
   photos at their natural aspect ratio, scaled to roughly the same
   width as the real photos in the template (about 4-5 inches) — don't
   go full-page-width, that's not how the template looks today.
6. Save to a per-run path, e.g.
   `Accomplishment-Report-<Section-or-Assignment>-<DateRangeSlug>.docx`.

**Multiple dates → repeating structure**: N activity dates = N table
rows + N Means of Verification sections. The single most common mistake
is the date reading differently between a table row and its matching MOV
heading (e.g. "July 10, 2026" in one, "07/10/26" in the other) — do one
pass before finishing and confirm every date string matches verbatim
between the table and its MOV section.

## Related skill

[[geotag-photo-date-fix]] — run it first if the candidate photos have a
GeoTag Camera watermark showing the wrong date; hand this skill the
corrected output folder, not the original photos.
