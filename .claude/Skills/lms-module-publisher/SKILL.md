---
name: lms-module-publisher
description: Send a generated learning module to a class on the Class Submissions LMS - author the module, upload it to Google Drive, and post it as a material. Use for "send module on <topic> to <section>", "post this module", "publish module to my class", "upload module and worksheet".
---

# LMS Module Publisher

Authors a module, uploads it to Drive, and posts it as a **material** on the LMS. Scripts live in `tools/lms-agent/` (see its `README.md`). Run all commands from the repo root `D:\Desktop\DepEd-Student-LMS`.

## Hard rules

- The Answer Key goes to the PRIVATE Drive folder only. Never link it, post it, or paste its text anywhere students can see.
- Never run `post-material.mjs` (without `--dry-run`) until the teacher says "send" in chat for that exact title, link and section.
- The scripts only touch data owned by `LMS_OWNER_EMAIL`. Do not try to work around that.
- Never read, print, or ask for the service-account key or Drive credentials.
- `drive-layout.json` holds the teacher's real Drive tree: `DepEd-AI-System/Term <n> - <school year>/<class folder>/<item folder>`. `--class` must be one of its `classFolders` exactly; never invent a class folder, ask him. `--folder` is the per-item folder, named by the date the module is for (`November 16, 2026`), optionally with ` - <LABEL>`.

## Steps

1. Check the setup: env `LMS_ADMIN_KEY` and `LMS_OWNER_EMAIL` must be set and `rclone` must be on PATH. If not, point to `tools/lms-agent/README.md` and stop.
2. Find the target section:
   `node tools/lms-agent/lms-list.mjs`
   Match the teacher's subject and section name to a section id. If it is ambiguous, ask which one.
3. Author the module. Read `D:\Desktop\DepEd-AI-System\.claude\Skills\deped-offline-module\SKILL.md` and follow its content rules and file format; do not copy its rules here. Write the content file in the scratchpad folder, not in the repo.
4. Render the Module, Worksheet and Answer Key `.docx` with `D:\Desktop\DepEd-AI-System\tools\offline-module\render.js`, using the command shown in that skill. Open or check the outputs exist.
5. Upload (dry run first, then real). Term, school year, class folder and item folder come from the request and `drive-layout.json`; ask if missing.
   `node tools/lms-agent/drive-upload.mjs --file "<module.docx>" --kind module --term <n> --sy "<2026-2027>" --class "<class folder>" --folder "<Month D, YYYY>" --dry-run`
   Then the same without `--dry-run`. Repeat with `--kind worksheet` and `--kind answer-key`. Keep the printed share links for module and worksheet. The answer key prints no link, which is correct.
6. Show the teacher a short confirmation block: title, Module link, Worksheet link, target subject + section name, and "Answer key stored privately, not posted". Then WAIT for an explicit "send".
7. After "send", post. One material per file the students need (usually the Module; add the Worksheet as a second material if asked):
   `node tools/lms-agent/post-material.mjs --section <sectionId> --title "<title>" --link "<module link>" --lesson "<topic>"`
   Add `--allow-download` or `--protect-file` only if the teacher asked.
8. Report: the new doc id, section, and the link. Remind the teacher it is visible to students now and he can delete it from the Materials list if needed.

## If something fails

- `Refusing: ... is not owned`: wrong section id or wrong `LMS_OWNER_EMAIL`. Re-run `lms-list.mjs`.
- `rclone not found`: tell the teacher to install rclone and run `rclone config` himself.
- Upload succeeded but posting failed: do not re-upload; fix and re-run step 7 only.
