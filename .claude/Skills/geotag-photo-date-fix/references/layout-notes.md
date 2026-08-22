# GeoTag Camera watermark layout notes

Not calibrated yet — no real sample photo has been inspected in this
session. Fill this in on the first real run of `geotag-photo-date-fix`
(see "First-ever run: calibrate before patching anything" in
`../SKILL.md`).

Once calibrated, record here:

- **Date/time line bounding box**, as fractions of image width/height
  (e.g. `x: 0.04-0.42, y: 0.87-0.94`)
- **Approximate font size**, as a fraction of image height
- **Text color/weight** (expected: white, bold)
- **Line order** within the watermark stack (which line is the app
  logo, which is location, which is date/time)
- **Sample photo resolution(s)** this calibration was based on, so a
  wildly different resolution/aspect ratio is a signal to recheck rather
  than assume the same fractions still apply
- Date this calibration was taken, so it's easy to tell if it's gone
  stale after an app update
