// Runs the agent test suite on the Firestore emulator.
// On Windows `firebase emulators:exec` often leaves the emulator's java.exe alive on port 8080,
// which makes the NEXT run fail with "port taken". So: clean before, run, clean after.
// Only a process whose command line is the Firebase Firestore emulator jar is ever stopped.
import { spawnSync, execFileSync } from "node:child_process";

function stopLeftoverEmulator() {
  if (process.platform !== "win32") return;
  const ps = [
    "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\"",
    "Where-Object { $_.CommandLine -match 'cloud-firestore-emulator' }",
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false; \"stopped leftover Firestore emulator (pid $($_.ProcessId))\" }",
  ].join(" | ");
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8" }).trim();
    if (out) console.log(out);
  } catch { /* best effort */ }
}

stopLeftoverEmulator();
const r = spawnSync(
  'firebase emulators:exec --only firestore --project demo-lms-agent "vitest run --config vitest.agent.config.js"',
  { stdio: "inherit", shell: true },
);
stopLeftoverEmulator();
process.exit(r.status ?? 1);
