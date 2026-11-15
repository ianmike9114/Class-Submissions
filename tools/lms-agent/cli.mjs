import { pathToFileURL } from "node:url";

// Tiny CLI arg parser: --flag, --key value.
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[k] = true;
    else { out[k] = next; i++; }
  }
  return out;
}

// True when this module is the script being run (not imported by a test).
export function isMain(metaUrl) {
  return !!process.argv[1] && metaUrl === pathToFileURL(process.argv[1]).href;
}
