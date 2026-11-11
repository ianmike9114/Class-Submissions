# Photos, files and reports

Deliberate design decisions and known limits. Moved out of `CLAUDE.md` so they load only
when needed. Read before editing this area; add new notes for this area here.

- No file uploads — everything is link. Non-YouTube links must be shared
  "anyone with link can view" or AI (and teacher) can't open them.
- In-app photo capture (`photoPages`, camera or gallery via plain
  `<input type="file" accept="image/*">` — no `capture` attribute, so
  OS's native chooser offers both) only exists for "image" and
  "document" assignments, as alternative to pasting link — not general
  file-upload feature. Capped at `MAX_PHOTOS` (15) pages per submission —
  not unlimited (shared 1MiB Firestore doc budget across however many
  pages added). `js/student.js`'s `compressImage()` keeps each photo under
  `PER_PHOTO_MAX_LEN` (64,000 chars/photo, encoded **WebP** where the browser
  can — `photoMime()` checks, iOS Safari falls back to JPEG — and the add
  handler also enforces a 15×64k total so edited older submissions holding
  100k JPEG pages still fit; so 15 photos stay under 1MiB cap
  alongside rest of submission's fields) by **stepping the max dimension down**
  (1280 → 1024 → 800 → 640px), dropping JPEG quality to a 0.3 floor at each
  size, and accepting the first that fits. Earlier it tried only 1280px + the
  quality floor and then gave up — dense document/handwriting photos (e.g. a
  full ADM page) overflowed even compressed, so the student hit "Photo is too
  large even after compression" and couldn't submit. The dimension ladder makes
  those fit at the cost of more sharpness loss on the densest shots; student can
  still fall back to the Drive-link path instead.
- **Second header button, "Photo ZIPs" (`#photos-bell`), lists every
  photo submission across every assignment, not just current one.**
  Per-assignment "Download all as ZIP" button (`renderImagesGallery()`)
  lives inside collapsed `<details>` on submissions view — easy to miss
  if teacher never opens that assignment. `js/teacher.js`'s
  `getPhotoAssignments()` fetches every owned submission once and groups
  by assignment; both this panel and per-assignment gallery now share
  one `downloadPhotosZip()` helper so ZIP-building logic isn't
  duplicated.
- **Android-only "Open in Chrome" button next to non-embeddable file
  links** (`js/embed.js`'s `openInChromeButton()`/`wireOpenInChromeButtons()`,
  used on student assignment instructions link and teacher's
  instructions/rubric-reference links). Some Android phones hand tapped
  link to whatever app claims that file type — reported in field as
  "Document Viewer" app throwing "File parsing error" — instead of
  Chrome, no way for page to know or catch it. `intent://` with explicit
  `package=com.android.chrome` forces Chrome specifically, same technique
  as `index.html`'s in-app-browser escape hatch. Renders nothing on
  iOS — Apple gives pages no way to pick handler app, so no equivalent
  fix there (same conclusion as iOS Code Scanner QR issue).
- **Download button on module/worksheet files (offline reading).**
  `js/student.js`'s `materialBlock()` adds "⬇ Download" to the file viewer of
  materials and graded assignments, using `js/embed.js`'s `toDownloadUrl()`
  (Drive file → `uc?export=download`, Docs/Slides/Sheets → PDF export;
  folders/YouTube get no button). Teacher toggle "Allow students to download"
  in the add/edit forms writes `assignment.allowDownload`; **missing = allowed**
  (so older modules show it too). Straight from Google, no Storage; in the
  Android app the link opens in the phone's browser, which downloads it. No
  rules change.
- **Accomplishment report + photo collage generator, per assignment**
  (`js/teacher.js`'s `renderCollagePreview()`/`drawScatteredCollage()`/
  `buildOfficialReportDocxBlob()`/`generateOfficialAccomplishmentReport()`,
  called from `renderImagesGallery()`) — for DepEd's work-from-home/
  modular-activity documentation requirement during calamities. Entirely
  client-side, no Storage/Functions: collage is randomized `<canvas>`
  scrapbook layout (varied photo size/rotation/scatter, centered
  title/section/date badge) that reshuffles on every "Regenerate layout"
  click. The one "Generate Accomplishment Report (.docx)" button clones
  the real DepEd "Individual Daily Log and Accomplishment Report" form
  (`assets/accomplishment-report-official.docx` — a tokenized,
  single-activity copy of the actual government template, prepared
  once offline) rather than hand-authoring a lookalike: JSZip (already
  a dependency, see photo-ZIP feature below) opens it, does plain
  `{{TOKEN}}` string substitution on `word/document.xml`, and swaps one
  placeholder image's bytes for the generated collage, so every
  original font/seal/table border survives untouched. No separate
  generic/ad-hoc report path anymore (there used to be two buttons; user
  asked to consolidate to just the official one) — no `docx` CDN library
  dependency as a result. Report body is short, teacher-editable
  narrative (`draftReportDescription()` auto-drafts one sentence from
  assignment title/section/dates, plus assignment's own `instructions`
  text if set) — deliberately not student/photo-count table. No
  "activity date" field on assignments, so teacher fills in date range
  manually per report. Employee name, arrangement, and the three
  signatory name/title pairs are editable fields (collapsed "Report
  settings" `<details>`) defaulting to the real template's values, not
  hardcoded — this app is multi-teacher-capable, so a different signed-in
  teacher shouldn't silently get this user's identity/signatories on
  their own generated report. See `.claude/Skills/deped-accomplishment-report`
  for the separate, multi-date, agent-driven version of this same
  template — that one combines several activity dates into one
  submission; this in-app button stays single-activity, tied to one
  assignment's collage.
