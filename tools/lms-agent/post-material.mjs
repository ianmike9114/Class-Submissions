// Create a "material" or a submittable "assignment" doc exactly as js/teacher.js:3652-3695 does,
// then touchSection(). A material has no submit button; an assignment does.
import { db, assertOwned, OWNER_EMAIL, parseArgs, isMain } from "./admin.mjs";
import { touchSection } from "./touch.mjs";

const COMPONENTS = ["written", "performance"];
const FILE_TYPES = ["document", "code", "image", "video"];

export async function postMaterial({
  section, title, link, lesson = "", instructions = "", allowDownload = false, protectFile = false,
  kind = "material", points, component = "written", due = "", fileTypes = "document",
  rubricLink = "", uploadLink = "", dryRun = false,
}) {
  if (!section || !title || !link) throw new Error("--section, --title and --link are required.");
  if (kind !== "material" && kind !== "assignment") throw new Error("--kind must be material or assignment.");
  const secSnap = await db.collection("sections").doc(section).get();
  if (!secSnap.exists) throw new Error(`Section ${section} not found.`);
  const sec = assertOwned(secSnap.data(), `section ${section}`);
  if (!sec.subjectId) throw new Error("Section has no subjectId.");
  // Same field set the site writes for a material (graded fields omitted on purpose).
  const base = {
    subjectId: sec.subjectId,
    sectionId: section,
    title: String(title).trim(),
    type: kind,
    lesson: String(lesson || "").trim(),
    instructions: String(instructions || "").trim(),
    instructionsLink: String(link).trim(),
    allowDownload: !!allowDownload,
    protectFile: !!protectFile,
    createdAt: Date.now(),
    ownerEmail: OWNER_EMAIL,
  };
  let payload = base;
  if (kind === "assignment") {
    const total = Number(points);
    if (!Number.isFinite(total) || total <= 0) throw new Error("--points (a number above 0) is required for an assignment.");
    if (!COMPONENTS.includes(component)) throw new Error(`--component must be one of: ${COMPONENTS.join(", ")}.`);
    if (!FILE_TYPES.includes(fileTypes)) throw new Error(`--file-types must be one of: ${FILE_TYPES.join(", ")}.`);
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("--due must look like 2026-11-20.");
    payload = {
      ...base,
      uploadFolderLink: String(uploadLink || "").trim(),
      component,
      dueDate: due || "",
      allowedFileTypes: fileTypes,
      totalPoints: total,
      rubricReferenceLink: String(rubricLink || "").trim(),
    };
  }
  if (dryRun) return { dryRun: true, payload };
  const ref = await db.collection("assignments").add(payload);
  await touchSection(section, { changed: [ref.id] });
  return { id: ref.id, payload };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const str = (v) => (v === true || v === undefined ? "" : String(v));
  try {
    const r = await postMaterial({
      section: a.section, title: a.title, link: a.link, lesson: str(a.lesson), instructions: str(a.instructions),
      allowDownload: !!a["allow-download"], protectFile: !!a["protect-file"],
      kind: a.kind ? String(a.kind) : "material", points: a.points, component: a.component ? String(a.component) : "written",
      due: str(a.due), fileTypes: a["file-types"] ? String(a["file-types"]) : "document",
      rubricLink: str(a["rubric-link"]), uploadLink: str(a["upload-link"]), dryRun: !!a["dry-run"],
    });
    console.log(r.dryRun ? "DRY RUN (nothing written):\n" + JSON.stringify(r.payload, null, 2) : `Posted ${r.payload.type}. Doc id: ${r.id}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
