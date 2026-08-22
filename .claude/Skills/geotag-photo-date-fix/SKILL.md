---
name: geotag-photo-date-fix
description: Correct the date/time burned into "GeoTag Camera" watermark photos (student submission photos) to match the actual assignment activity date, without altering the location/coordinates lines, writing corrected copies to a separate output folder — originals are never modified. Use when submission photos' visible timestamp doesn't match the real activity date (students often do/submit an activity a day or more after it was assigned), especially before archiving those photos into a [[deped-accomplishment-report]].
---

# GeoTag photo date fix

Students photograph their work with a "GeoTag Camera"-style Android app
that burns a watermark bar directly into the photo's pixels — a small
app logo, a location line ("Barangay, City, Region, Country"), a
coordinates line ("Lat ... Long ..."), and a date/time line ("Alt ...m ·
Weekday, DD/MM/YYYY H:MM AM/PM GMT+8"), all in bold white text laid over
the real photo content in the bottom-left corner. Because students often
do the activity — or at least upload it — a day or more after the actual
assigned date, that burned-in date can be wrong relative to the real
activity date, which matters once the photo becomes evidence in an
Accomplishment Report.

**This is a pixel-editing problem, not a metadata edit.** The date isn't
in EXIF tags (trivial to rewrite) — it's baked into the image itself.
Treat this as inherently best-effort: reconstructing a small patch of a
real photo and drawing new text into it will never be as clean as an
invisible tag rewrite, and quality will vary with what's behind the
original text (a plain wall patches cleanly; a busy background less so).
Always preserve the original file and never claim more confidence than
the output actually earned — tell the user to spot-check a handful of
results before treating them as final/official.

## What changes and what doesn't

Only the **date/time line** gets patched. The location and coordinates
lines stay untouched — they're still true (the place didn't change,
only when the photo happened to be captured/uploaded), and patching only
one line keeps the edit surface small.

## First-ever run: calibrate before patching anything

No real sample photo exists in this repo/session yet — only chat
screenshots, which aren't files on disk. Before doing any actual patch
work:

1. Ask the user for one real sample photo (a JPG/PNG straight from a
   student submission, GeoTag-Camera-watermarked).
2. Inspect the bottom-left corner where the watermark lives. Work out
   the date/time line's bounding box as **fractions of the image's width
   and height** (e.g. "starts at 4% from left, spans to 42% width,
   vertically centered around 91% down"), not fixed pixel coordinates —
   fractions survive students submitting photos at different phone
   resolutions; fixed pixels don't.
3. Note the approximate font size (as a fraction of image height), the
   text color/weight (white, bold), and roughly how the three watermark
   lines stack (top = app logo/icon, middle = location, bottom =
   date/time) so you can tell them apart reliably.
4. Write what you found into `references/layout-notes.md` in this skill
   folder, so future runs skip recalibrating. If a later photo clearly
   doesn't match (different aspect ratio bucket, watermark in a
   different spot, app looks different) — that's a sign the app version
   or layout changed; recalibrate rather than forcing stale coordinates
   onto it, and flag this to the user.

## Why relative-crop instead of OCR

The watermark's position is deterministic per app — GeoTag Camera always
draws it in the same corner, same relative layout. A calibrated
relative-position crop is reliable enough on its own and needs nothing
beyond Pillow (a pure-Python, pip-installable image library). OCR
(`pytesseract`) would additionally need a native Tesseract binary
installed on the machine — a heavier, more fragile dependency for a
problem that a fixed-layout crop already solves. Use OCR only as a
documented fallback if a photo's layout doesn't match calibration — and
even then, prefer flagging it back to the user over silently guessing.

## Patch mechanics (Python + Pillow)

For each input photo:

1. Open it, read `(width, height)`.
2. Compute the calibrated date-line bounding box in absolute pixels from
   the stored relative fractions.
3. Reconstruct a plausible "un-texted" patch for that box — since it's
   drawn over real photo content, not a solid box, a flat color fill
   would look wrong. Sample the strip of pixels immediately bordering
   the box (just above/below it) and stretch or tile it across the box,
   optionally blurred slightly, to approximate the underlying photo
   texture.
4. Paste that reconstructed patch over the old date/time text.
5. Draw the new date/time string on top — bold white, sized
   proportionally from the calibration data, positioned at the same
   spot the old line occupied. Use the assignment's real activity date,
   formatted the same way the app's own `collageDateLabel()` does
   (`js/teacher.js:1849-1855` — single date, or "X to Y" for a range) so
   the date string reads consistently with the rest of the app's
   tooling.
6. Save the result to `<input_folder>/corrected/<original_filename>_datefixed.<ext>`
   (or a folder the user specifies) — **never overwrite or delete the
   original file.**

## Handoff

Once photos are corrected, use [[deped-accomplishment-report]] with the
`corrected/` output folder as its photo source — not the original
folder.
