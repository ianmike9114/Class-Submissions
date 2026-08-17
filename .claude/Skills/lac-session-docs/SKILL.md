---
name: lac-session-docs
description: Generate or regenerate the full Learning Action Cell (LAC) session document set (session plan, agenda, attendance sheet, minutes, accomplishment report, action plan, photo page, certificates) for a TLE LAC session. Use when the user asks to create, update, or redo LAC session paperwork.
---

# LAC session document generator

Templates and a filled sample set live in `LAC-Session-TLE/` at repo
root — read `LAC-Session-TLE/README.md` first for the file list and
placeholder conventions before generating anything.

## Inputs to collect (ask only for what's missing)

- **Topic/focus** of the session
- **Date, time, venue**
- **School / Division / District** (or keep `[SCHOOL NAME]` /
  `[DIVISION]` / `[DISTRICT]` placeholders if user hasn't decided)
- **Participant list** — if user says "same group" or doesn't specify,
  reuse the 8-teacher roster below
- **Facilitator and Documenter for this session** (LAC roles rotate
  session to session — don't assume same two people as last time
  unless told)
- **LAC Leader** and **School Head/Principal** (usually fixed per
  school; carry over from previous session unless told otherwise)

## Default sample roster (used when user hasn't supplied real names)

- School Head/Principal: Dr. Ma. Teresa D. Villanueva
- LAC Leader: Mr. Ramon C. Santos
- 8 teachers: Angelica P. Reyes, Kevin John M. Dela Cruz, Bea Marie S.
  Fernandez, Joshua A. Mendoza, Cristine Joy L. Bautista, Paolo R.
  Aquino, Michelle T. Garcia, Noel D. Ramirez

## Generating the set

Produce all files that apply from the `LAC-Session-TLE/` numbering
(`01`–`08` + `README.md`), using the existing filled files as the
structural template (section headings, table columns, signature-block
layout) — only the topic/date/venue/names/procedure content changes
per session, not the shape of each document.

**Consistency is the main failure mode**: the same person's name,
role, date, and topic must read identically across all 9 files. Before
finishing, do one pass across every generated file and check names/
dates/topic match verbatim — a LAC Leader spelled differently between
the minutes and the accomplishment report is the most common mistake.

Keep every file's `[SCHOOL LOGO HERE]` placeholder — this skill never
fetches or generates a logo; the user pastes their own DepEd
logo-generator output in manually.

If this is a **new session** for an existing series (not the first),
increment "LAC Session No." in the session plan and carry forward
"Review of Previous Session's Agreements" as an actual agenda item
referencing the prior session's action plan, if available.
