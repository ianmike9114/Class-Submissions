// Create a "material" assignment doc exactly as js/teacher.js:3652-3695 does, then touchSection().
import { db, assertOwned, OWNER_EMAIL, parseArgs, isMain } from "./admin.mjs";
import { touchSection } from "./touch.mjs";

export async function postMaterial({ section, title, link, lesson = "", instructions = "", allowDownload = false, protectFile = false, dryRun = false }) {
  if (!section || !title || !link) throw new Error("--section, --title and --link are required.");
  const secSnap = await db.collection("sections").doc(section).get();
  if (!secSnap.exists) throw new Error(`Section ${section} not found.`);
  const sec = assertOwned(secSnap.data(), `section ${section}`);
  if (!sec.subjectId) throw new Error("Section has no subjectId.");
  // Same field set the site writes for a material (graded fields omitted on purpose).
  const payload = {
    subjectId: sec.subjectId,
    sectionId: section,
    title: String(title).trim(),
    type: "material",
    lesson: String(lesson || "").trim(),
    instructions: String(instructions || "").trim(),
    instructionsLink: String(link).trim(),
    allowDownload: !!allowDownload,
    protectFile: !!protectFile,
    createdAt: Date.now(),
    ownerEmail: OWNER_EMAIL,
  };
  if (dryRun) return { dryRun: true, payload };
  const ref = await db.collection("assignments").add(payload);
  await touchSection(section, { changed: [ref.id] });
  return { id: ref.id, payload };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  try {
    const r = await postMaterial({
      section: a.section, title: a.title, link: a.link, lesson: a.lesson === true ? "" : a.lesson,
      instructions: a.instructions === true ? "" : a.instructions,
      allowDownload: !!a["allow-download"], protectFile: !!a["protect-file"], dryRun: !!a["dry-run"],
    });
    console.log(r.dryRun ? "DRY RUN (nothing written):\n" + JSON.stringify(r.payload, null, 2) : `Posted material. Doc id: ${r.id}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
