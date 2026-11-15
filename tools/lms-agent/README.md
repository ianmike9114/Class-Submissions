# lms-agent (dev-only admin scripts)

Local Node scripts the Module Publisher and Auto-Grader agents call. They use the Firebase
Admin SDK, which **bypasses `firestore.rules`**; every script is locked to `LMS_OWNER_EMAIL`.
Not deployed. See `docs/design-notes/agents.md`.

## One-time setup (you do this yourself)

1. Firebase Console > Project settings > Service accounts > Generate new private key. Save the
   JSON **outside any repo** (for example `D:\Claude\secrets\lms-admin.json`). Never commit it.
2. Set environment variables (PowerShell, then reopen the terminal):
   ```
   setx LMS_ADMIN_KEY "D:\Claude\secrets\lms-admin.json"
   setx LMS_OWNER_EMAIL "your.teacher.email@gmail.com"
   ```
3. `npm install` in the repo root (installs `firebase-admin`, dev-only).
4. For Drive uploads: install rclone, then run `rclone config` and create a Google Drive remote
   named `gdrive` (Google sign-in is done by you).
5. `drive-layout.json` already matches your Drive tree (`DepEd-AI-System/Term <n> - <school year>/<class folder>/<item folder>`). Add a new class folder name to its `classFolders` list when you create one in Drive.

Without a key, scripts talk only to the emulator when `FIRESTORE_EMULATOR_HOST` is set.

## Commands (run from the repo root)

```
node tools/lms-agent/lms-list.mjs [--section <sectionId>]
node tools/lms-agent/post-material.mjs --section <id> --title "Module 1" --link "<url>" [--kind assignment|material] [--points 50] [--component written|performance] [--due 2026-11-20] [--file-types document|image|code|video] [--rubric-link "<url>"] [--lesson "..."] [--instructions "..."] [--allow-download] [--protect-file] [--dry-run]
#   --kind material (default for back-compat) has no Submit button; --kind assignment needs --points.
node tools/lms-agent/subs-pull.mjs --assignment <id> --out tools/lms-agent/out/<id>
node tools/lms-agent/grade-publish.mjs --assignment <id> --grades tools/lms-agent/out/<id>/grades.json [--dry-run] [--min-confidence 0.7]
node tools/lms-agent/grade-undo.mjs --audit tools/lms-agent/out/<id>/audit-<timestamp>.jsonl [--dry-run]
node tools/lms-agent/drive-upload.mjs --file module.docx --kind module|worksheet|answer-key --term 2 --sy 2026-2027 --class "Grade 10 - Orchid - CSS" --folder "November 16, 2026" [--dry-run]
```

`grades.json` is an array of `{ "submissionId", "action": "publish"|"return"|"skip", "score"?, "feedback", "confidence", "reason"? }`
(`action` defaults to `publish`; old `skipReason` still means skip). `return` = sent back for revision with **no**
`returnCount` increment (no -10 penalty), archived under "Previous attempts"; undo reverts it.

Answer keys (`--kind answer-key`) always go to `privatePath` and no share link is ever created.

## Tests

`npm run test:agent` (Firestore emulator, never live).
