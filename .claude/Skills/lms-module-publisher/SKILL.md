---
name: lms-module-publisher
description: Send a generated learning module to a class on the Class Submissions LMS - author the module, upload it to Google Drive, and post it as a submittable assignment (or a material on request), then send the class announcement to the section's Messenger group chat. Use for "send module on <topic> to <section>", "post this module", "publish module to my class", "upload module and worksheet".
---

# LMS Module Publisher

Authors a module, uploads it to Drive, and posts it on the LMS as a submittable **assignment** by default (a **material** only when asked). Scripts live in `tools/lms-agent/` (see its `README.md`). Run all commands from the repo root `D:\Desktop\DepEd-Student-LMS`.

## Hard rules

- The Answer Key goes to the PRIVATE Drive folder only. Never link it, post it, or paste its text anywhere students can see.
- Never run `post-material.mjs` (without `--dry-run`) until the teacher says "send" in chat for that exact title, link and section.
- Never send a Messenger message without that same "send", given for a confirmation block that showed the exact announcement text and group chat name. Send only to the chat mapped to that section in `tools/lms-agent/messenger-chats.json`; never to any other chat, and never more than once per approval.
- The scripts only touch data owned by `LMS_OWNER_EMAIL`. Do not try to work around that.
- Never read, print, or ask for the service-account key or Drive credentials.
- Never leave term, week or module number at the renderer default (Term 1 / Week 1 / Module 1). Always set them from `week-of.mjs` output.
- `drive-layout.json` holds the teacher's real Drive tree: `DepEd-AI-System/Term <n> - <school year>/<class folder>/<item folder>`. `--class` must be one of its `classFolders` exactly; never invent a class folder, ask him. `--folder` is the per-item folder, named by the date the module is for (`November 16, 2026`), optionally with ` - <LABEL>`.

## Steps

1. Check the setup: env `LMS_ADMIN_KEY` and `LMS_OWNER_EMAIL` must be set and `rclone` must be on PATH. If not, point to `tools/lms-agent/README.md` and stop.
2. Find the target section:
   `node tools/lms-agent/lms-list.mjs`
   Match the teacher's subject and section name to a section id. If it is ambiguous, ask which one.
3. Author the module. Read `D:\Desktop\DepEd-AI-System\.claude\Skills\deped-offline-module\SKILL.md` and follow its content rules and file format; do not copy its rules here. Write the content file in the scratchpad folder, not in the repo.
   Get term and week for the module date: `node tools/lms-agent/week-of.mjs --date <YYYY-MM-DD>` (reads `school-calendar.json`; if it errors, ask ian to fill in the calendar, never guess). Put `term`, `weekNumber` and `moduleNumber` into the content file's `meta`. `moduleNumber` = the week number by default; if ian says it is a 2nd module that week, ask for the number.
4. Render the Module, Worksheet and Answer Key `.docx` with `D:\Desktop\DepEd-AI-System\tools\offline-module\render.js`, using the command shown in that skill. Open or check the outputs exist.
5. Upload (dry run first, then real). `--term` and `--sy` come from the `week-of.mjs` output; class folder and item folder come from the request and `drive-layout.json`; ask if missing.
   `node tools/lms-agent/drive-upload.mjs --file "<module.docx>" --kind module --term <n> --sy "<2026-2027>" --class "<class folder>" --folder "<Month D, YYYY>" --dry-run`
   Then the same without `--dry-run`. Repeat with `--kind worksheet` and `--kind answer-key`. Keep the printed share links for module and worksheet. The answer key prints no link, which is correct.
6. Show the teacher a short confirmation block: title, "Term 2 · Week 9 · Module 9" (real values, so ian can correct them), Module link, Worksheet link, target subject + section name, post type, total points, component, due date, and "Answer key stored privately, not posted". Add the **group chat name** from `messenger-chats.json` (or "no group chat mapped, Messenger skipped") and the full **announcement text** (template in step 9) so one "send" approves both the LMS post and the Messenger message. Then WAIT for an explicit "send".
7. After "send", post. **Default is a submittable assignment** (students get a Submit button; a material has none). Use `--kind material` only when the teacher says "material" / "read only" / "no submission".
   `node tools/lms-agent/post-material.mjs --kind assignment --section <sectionId> --title "<title>" --link "<module link>" --lesson "<topic>" --instructions "<what to submit>" --points <total> --component written|performance --due <YYYY-MM-DD> --file-types document|image|code|video`
   Ask for points and due date if the teacher did not give them (no guessing). `--file-types` default `document`; use `image` for photo work. Add `--allow-download` or `--protect-file` only if the teacher asked. Run once with `--dry-run` first and show the payload.
8. Report: the new doc id, section, and the link. Remind the teacher it is visible to students now and can be deleted from the teacher page if needed.
9. Messenger announcement (only after step 7 succeeded, under the same "send"). Uses the Claude-in-Chrome tools in ian's Brave, which is signed in to Facebook.
   - Look up the section id in `tools/lms-agent/messenger-chats.json`. Not listed: skip, and ask ian for the chat name and link.
   - `list_connected_browsers`, then `select_browser` the one named by `browser` in that file (if it is missing, `switch_browser` and ask ian to click Connect in Brave). Then `tabs_context_mcp` with `createIfEmpty`, and `navigate` to the chat's `threadUrl`.
   - Check, before typing: the page is signed in (no login form), and the textbox is `Write to <name>` with the exact `name`. If either fails, do not type; copy the text to the clipboard (`Set-Clipboard`) and tell ian to paste it.
   - Click the textbox and type the announcement one line at a time, pressing **shift+Enter** between lines. A plain Enter sends a half-typed message. Take a screenshot to check it, then press Send once.
   - Confirm the message now appears in the chat. If a step fails after Send, look at the chat first; never send it again unless the message is really missing.
   - Template (plain English, fill in real values; no markdown, since Messenger shows `**` as-is):
     ```
     📚 <SUBJECT SHORT> Module <N> is now posted!
     Topic: <topic>

     Read the module, then answer the worksheet (Part I and Part II) on your answer sheet.
     Points: <points> (<Written Work|Performance Task>)
     Due: <Weekday, Month D, YYYY>

     Submit on our Class Submissions LMS: a clear photo of your answer sheet or a Google Doc link.
     Module: <module link>
     ```
     For a material, drop the Points/Due/Submit lines and write "Please read this before our next class." Never include the answer key.

## If something fails

- `Refusing: ... is not owned`: wrong section id or wrong `LMS_OWNER_EMAIL`. Re-run `lms-list.mjs`.
- `rclone not found`: tell the teacher to install rclone and run `rclone config` himself.
- Upload succeeded but posting failed: do not re-upload; fix and re-run step 7 only.
