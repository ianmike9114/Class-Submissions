// Integration tests for the REAL firestore.rules against the Firestore
// emulator. firestore.rules IS the app's access control (per CLAUDE.md), so
// this is the most valuable functional layer: it verifies multi-teacher
// isolation and student self-scope without any brittle DOM driving.
//
// Run via: npm run test:rules  (firebase emulators:exec wraps vitest so the
// emulator is up for the duration). Requires the Firestore emulator; these
// tests are skipped by the plain `npm test` unit run (different glob).
//
// NEVER points at production - initializeTestEnvironment talks only to the
// local emulator on 127.0.0.1:8080.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
} from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SUPER_ADMIN = "galutira.ianjoseph.f@gmail.com"; // must match firestore.rules
const TEACHER_A = "teacher.a@example.com";
const TEACHER_B = "teacher.b@example.com";

let testEnv;

// Auth context helpers. request.auth.token.email drives every owner check;
// email_verified mirrors what Google / email-link sign-in put on the token.
function ctxFor(uid, email) {
  return testEnv
    .authenticatedContext(uid, { email, email_verified: true })
    .firestore();
}
const anon = () => testEnv.unauthenticatedContext().firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-lms-rules",
    firestore: {
      rules: readFileSync(resolve(ROOT, "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed the /teachers allowlist docs (isGrantedTeacher) + owned data, with
  // rules disabled so seeding never fights the rules under test.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "teachers", TEACHER_A), { email: TEACHER_A });
    await setDoc(doc(db, "teachers", TEACHER_B), { email: TEACHER_B });
    // A subject + submission owned by teacher A, and a student's submission.
    await setDoc(doc(db, "subjects", "subjA"), {
      ownerEmail: TEACHER_A,
      name: "ICT",
    });
    await setDoc(doc(db, "submissions", "subA_stud1"), {
      ownerEmail: TEACHER_A,
      studentUID: "student1",
      status: "pending",
      link: "https://youtu.be/x",
    });
    await setDoc(doc(db, "sections", "secA"), {
      ownerEmail: TEACHER_A,
      subjectId: "subjA",
      sectionName: "STEM",
    });
    // Assignments (submission create checks the real owner) - one legacy
    // assignment with no ownerEmail (pre multi-teacher, owned by the super admin)
    // and a legacy section likewise.
    await setDoc(doc(db, "assignments", "a1"), { ownerEmail: TEACHER_A, sectionId: "secA", title: "A1" });
    await setDoc(doc(db, "assignments", "a2"), { ownerEmail: TEACHER_B, sectionId: "secB", title: "A2" });
    await setDoc(doc(db, "assignments", "aLegacy"), { sectionId: "secLegacy", title: "Old" });
    await setDoc(doc(db, "sections", "secB"), { ownerEmail: TEACHER_B, subjectId: "subjB", sectionName: "ABM" });
    await setDoc(doc(db, "sections", "secLegacy"), { subjectId: "subjA", sectionName: "Old section" });
    await setDoc(doc(db, "settings", TEACHER_A), {
      ownerEmail: TEACHER_A,
      currentSchoolYear: "2026-2027",
      currentTerm: "2",
    });
  });
});

// Regression: the student-side term-hide (getHiddenSectionIds) resolves
// sectionId -> subject -> owner-setting using SINGLE-DOC gets, because a student
// is not the owner and LIST on these collections is owner-only. A `where(
// documentId(),"in")` LIST here was silently denied for real students, so the
// hide fell back to showing everything. These lock the get-allowed / list-denied
// contract that fix depends on.
describe("student term-hide reads: single-doc get allowed, list denied", () => {
  const stud = () => ctxFor("student1", "s1@x.com");
  it("a student CAN get a subject / section / settings doc by id", async () => {
    await assertSucceeds(getDoc(doc(stud(), "subjects", "subjA")));
    await assertSucceeds(getDoc(doc(stud(), "sections", "secA")));
    await assertSucceeds(getDoc(doc(stud(), "settings", TEACHER_A)));
  });
  it("a student CANNOT list subjects / sections / settings (why the old `in` query failed)", async () => {
    await assertFails(getDocs(query(collection(stud(), "subjects"), where("__name__", "==", "subjA"))));
    await assertFails(getDocs(query(collection(stud(), "sections"), where("__name__", "==", "secA"))));
    await assertFails(getDocs(collection(stud(), "settings")));
  });
});

describe("teachers allowlist", () => {
  it("a user can read only their OWN teacher doc (role routing)", async () => {
    await assertSucceeds(getDoc(doc(ctxFor("ua", TEACHER_A), "teachers", TEACHER_A)));
  });
  it("a user cannot read someone else's teacher doc", async () => {
    await assertFails(getDoc(doc(ctxFor("ua", TEACHER_A), "teachers", TEACHER_B)));
  });
  it("only the super admin can add a teacher", async () => {
    await assertFails(
      setDoc(doc(ctxFor("ua", TEACHER_A), "teachers", "new@x.com"), { email: "new@x.com" })
    );
    await assertSucceeds(
      setDoc(doc(ctxFor("adm", SUPER_ADMIN), "teachers", "new@x.com"), { email: "new@x.com" })
    );
  });
});

describe("subjects: create is owner-stamped, list is owner-scoped", () => {
  it("granted teacher can create a subject stamped with their own email", async () => {
    await assertSucceeds(
      addDoc(collection(ctxFor("ua", TEACHER_A), "subjects"), { ownerEmail: TEACHER_A, name: "New" })
    );
  });
  it("granted teacher CANNOT create a subject stamped as another owner", async () => {
    await assertFails(
      addDoc(collection(ctxFor("ua", TEACHER_A), "subjects"), { ownerEmail: TEACHER_B, name: "Spoof" })
    );
  });
  it("a non-teacher signed-in user cannot create a subject", async () => {
    await assertFails(
      addDoc(collection(ctxFor("stud", "student@x.com"), "subjects"), { ownerEmail: "student@x.com" })
    );
  });
  it("owner-scoped list query succeeds; unscoped list is denied", async () => {
    const db = ctxFor("ua", TEACHER_A);
    await assertSucceeds(getDocs(query(collection(db, "subjects"), where("ownerEmail", "==", TEACHER_A))));
    await assertFails(getDocs(collection(db, "subjects")));
  });
  it("super admin can list across all owners", async () => {
    await assertSucceeds(getDocs(collection(ctxFor("adm", SUPER_ADMIN), "subjects")));
  });
});

describe("submissions: multi-teacher isolation + student self-scope", () => {
  it("teacher A can read a submission they own", async () => {
    const db = ctxFor("ua", TEACHER_A);
    await assertSucceeds(
      getDocs(query(collection(db, "submissions"), where("ownerEmail", "==", TEACHER_A)))
    );
  });
  it("teacher B CANNOT read teacher A's submissions (isolation)", async () => {
    const db = ctxFor("ub", TEACHER_B);
    await assertFails(
      getDocs(query(collection(db, "submissions"), where("ownerEmail", "==", TEACHER_A)))
    );
  });
  it("the owning student can read their own submission", async () => {
    await assertSucceeds(getDoc(doc(ctxFor("student1", "s1@x.com"), "submissions", "subA_stud1")));
  });
  it("a different student cannot read someone else's submission", async () => {
    await assertFails(getDoc(doc(ctxFor("student2", "s2@x.com"), "submissions", "subA_stud1")));
  });
  it("a student can create a submission only for their own uid", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertSucceeds(
      setDoc(doc(db, "submissions", "a1_student9"), {
        assignmentId: "a1",
        studentUID: "student9",
        ownerEmail: TEACHER_A,
        status: "pending",
      })
    );
    await assertFails(
      setDoc(doc(db, "submissions", "a1_someone-else"), {
        assignmentId: "a1",
        studentUID: "someone-else",
        ownerEmail: TEACHER_A,
        status: "pending",
      })
    );
  });
});

describe("submissions: create cannot carry grading state", () => {
  const base = { studentUID: "student9", ownerEmail: TEACHER_A, assignmentId: "a1" };
  it("denies create with status published", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, status: "published" }));
  });
  it("denies create with finalGrade", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, status: "pending", finalGrade: { score: 100 } }));
  });
  it("denies create with returnCount/publishedAt/aiDraft or missing status", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, status: "pending", returnCount: 0 }));
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, status: "pending", publishedAt: 1 }));
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, status: "pending", aiDraft: {} }));
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base }));
  });
  it("allows a normal pending create (link, photos, quiz fields)", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertSucceeds(
      setDoc(doc(db, "submissions", "a1_student9"), {
        ...base, status: "pending", assignmentId: "a1", link: "https://x.y", code: "", codeOutput: "",
        photoPages: [], quizAnswers: {}, quizServed: [], quizLog: {}, submittedAt: 1,
      })
    );
  });
});

describe("submissions: one doc per student per assignment (penalty-dodge guard)", () => {
  const base = { studentUID: "student9", ownerEmail: TEACHER_A, assignmentId: "a1", status: "pending" };
  it("denies a random id or another student's id once the student already has the real doc", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "submissions", "a1_student9"), { ...base, status: "returned", returnCount: 1 });
    });
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(setDoc(doc(db, "submissions", "randomId123"), base));
    await assertFails(setDoc(doc(db, "submissions", "a1_student1"), base));
  });
  it("denies a create with no assignmentId", async () => {
    const db = ctxFor("student9", "s9@x.com");
    const { assignmentId, ...noAsg } = base;
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), noAsg));
  });
  it("a returned student cannot reset returnCount by re-creating the same id", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "submissions", "a1_student9"), { ...base, status: "returned", returnCount: 1 });
    });
    const db = ctxFor("student9", "s9@x.com");
    // setDoc on an existing id is an update: it must be denied (it would drop returnCount).
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), base));
    // Editing in place still works and the count is untouched.
    await assertSucceeds(updateDoc(doc(db, "submissions", "a1_student9"), { link: "https://x.y", status: "pending", submittedAt: 2 }));
  });
});

// TEMPORARY stale-page transition (see the comment in firestore.rules): a page
// loaded before #94 creates with addDoc (random id). That must work while no doc
// exists at assignmentId_uid, and stop working the moment one does.
describe("submissions: legacy random-id create (stale pages) only when no assignmentId_uid doc", () => {
  const base = { studentUID: "student9", ownerEmail: TEACHER_A, assignmentId: "a1", status: "pending", link: "https://x.y", photoPages: [], submittedAt: 1 };
  it("allows an old-style addDoc create when no doc exists at the deterministic id", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertSucceeds(addDoc(collection(db, "submissions"), base));
  });
  it("denies a random-id create once the deterministic doc exists", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "submissions", "a1_student9"), base);
    });
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(addDoc(collection(db, "submissions"), base));
  });
  it("a random id does not bypass the uid check", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(addDoc(collection(db, "submissions"), { ...base, studentUID: "student1" }));
  });
});

describe("submissions: create ownerEmail must be the assignment's real owner", () => {
  const base = { studentUID: "student9", assignmentId: "a1", status: "pending", link: "https://x.y" };
  it("denies a fake teacher email on the submission", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, ownerEmail: TEACHER_B }));
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, ownerEmail: "evil@x.com" }));
  });
  it("allows the real owner's email", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertSucceeds(setDoc(doc(db, "submissions", "a1_student9"), { ...base, ownerEmail: TEACHER_A }));
  });
  it("a legacy assignment with no ownerEmail belongs to the super admin", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(setDoc(doc(db, "submissions", "aLegacy_student9"), { ...base, assignmentId: "aLegacy", ownerEmail: TEACHER_A }));
    await assertSucceeds(setDoc(doc(db, "submissions", "aLegacy_student9"), { ...base, assignmentId: "aLegacy", ownerEmail: SUPER_ADMIN }));
  });
  it("denies a create for an assignment that does not exist", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(setDoc(doc(db, "submissions", "ghost_student9"), { ...base, assignmentId: "ghost", ownerEmail: TEACHER_A }));
  });
});

describe("submissions: create field list and size checks", () => {
  const base = { studentUID: "student9", ownerEmail: TEACHER_A, assignmentId: "a1", status: "pending" };
  it("denies an extra field the client never writes", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, link: "x", isAdmin: true }));
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, link: "x", resubmitRequested: true }));
  });
  it("allows every field the file and quiz create paths write", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertSucceeds(setDoc(doc(db, "submissions", "a1_student9"), {
      ...base, studentName: "Juan", link: "", code: "c", codeOutput: "o", photoPages: ["data:image/webp;base64,AA"], submittedAt: 1,
      quizAnswers: { q1: "a" }, quizServed: ["q1"], quizLog: { leftCount: 0 }, quizSubmittedAt: serverTimestamp(),
    }));
  });
  it("denies a link over 2000 chars or a non-string link", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, link: "x".repeat(2000) }));
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, link: 5 }));
    await assertSucceeds(setDoc(doc(db, "submissions", "a1_student9"), { ...base, link: "x".repeat(1999) }));
  });
  it("denies more than 15 photo pages or a non-list photoPages", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, photoPages: new Array(16).fill("p") }));
    await assertFails(setDoc(doc(db, "submissions", "a1_student9"), { ...base, photoPages: "p" }));
    await assertSucceeds(setDoc(doc(db, "submissions", "a1_student9"), { ...base, photoPages: new Array(15).fill("p") }));
  });
  it("student update still enforces the same size checks", async () => {
    const db = ctxFor("student1", "s1@x.com");
    await assertFails(updateDoc(doc(db, "submissions", "subA_stud1"), { link: "x".repeat(2000), status: "pending", submittedAt: 2 }));
    await assertFails(updateDoc(doc(db, "submissions", "subA_stud1"), { photoPages: new Array(16).fill("p"), status: "pending", submittedAt: 2 }));
    await assertSucceeds(updateDoc(doc(db, "submissions", "subA_stud1"), { link: "https://ok", status: "pending", submittedAt: 2 }));
  });
});

describe("submissions: student edits are field-limited and status-gated", () => {
  it("student can set a demoLink on create and edit (project submissions)", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertSucceeds(setDoc(doc(db, "submissions", "a1_student9"), {
      assignmentId: "a1", studentUID: "student9", ownerEmail: TEACHER_A, status: "pending",
      link: "https://github.com/x/y", demoLink: "https://youtu.be/demo", submittedAt: 1,
    }));
    const db1 = ctxFor("student1", "s1@x.com");
    await assertSucceeds(updateDoc(doc(db1, "submissions", "subA_stud1"), {
      demoLink: "https://youtu.be/new", status: "pending", submittedAt: 2,
    }));
  });
  it("demoLink must be a short string", async () => {
    const db1 = ctxFor("student1", "s1@x.com");
    await assertFails(updateDoc(doc(db1, "submissions", "subA_stud1"), {
      demoLink: "x".repeat(2000), status: "pending", submittedAt: 2,
    }));
    await assertFails(updateDoc(doc(db1, "submissions", "subA_stud1"), {
      demoLink: 5, status: "pending", submittedAt: 2,
    }));
  });
  it("student can edit their own pending submission's link (re-queues it)", async () => {
    const db = ctxFor("student1", "s1@x.com");
    await assertSucceeds(
      updateDoc(doc(db, "submissions", "subA_stud1"), {
        link: "https://youtu.be/new",
        status: "pending",
      })
    );
  });
  it("student CANNOT change the score/grade on their submission", async () => {
    const db = ctxFor("student1", "s1@x.com");
    await assertFails(
      updateDoc(doc(db, "submissions", "subA_stud1"), { finalGrade: { score: 100 } })
    );
  });
  it("student cannot edit once the submission is published", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "submissions", "pub1"), {
        ownerEmail: TEACHER_A,
        studentUID: "student1",
        status: "published",
        link: "https://youtu.be/x",
      });
    });
    const db = ctxFor("student1", "s1@x.com");
    await assertFails(
      updateDoc(doc(db, "submissions", "pub1"), { link: "https://youtu.be/sneaky", status: "pending" })
    );
  });
  // Late-resubmission penalty (returnCount, js/grading.js): the student must
  // not be able to reset it by editing, or by deleting + submitting fresh.
  async function seedSub(id, extra) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "submissions", id), {
        ownerEmail: TEACHER_A, studentUID: "student1", link: "https://youtu.be/x", ...extra,
      });
    });
  }
  it("student CANNOT change returnCount on their submission", async () => {
    await seedSub("rc1", { status: "returned", returnCount: 2 });
    const db = ctxFor("student1", "s1@x.com");
    await assertFails(updateDoc(doc(db, "submissions", "rc1"), { returnCount: 0, status: "pending" }));
    await assertFails(updateDoc(doc(db, "submissions", "rc1"), { link: "https://youtu.be/y", status: "pending", returnCount: 0 }));
    await assertSucceeds(updateDoc(doc(db, "submissions", "rc1"), { link: "https://youtu.be/y", status: "pending" }));
  });
  it("student CANNOT delete a returned submission", async () => {
    await seedSub("rc2", { status: "returned", returnCount: 1 });
    await assertFails(deleteDoc(doc(ctxFor("student1", "s1@x.com"), "submissions", "rc2")));
  });
  it("student CANNOT delete a resubmitted (pending) one that was returned before", async () => {
    await seedSub("rc3", { status: "pending", returnCount: 1 });
    await assertFails(deleteDoc(doc(ctxFor("student1", "s1@x.com"), "submissions", "rc3")));
  });
  it("student CAN still delete a fresh pending submission", async () => {
    await seedSub("rc4", { status: "pending" });
    await assertSucceeds(deleteDoc(doc(ctxFor("student1", "s1@x.com"), "submissions", "rc4")));
  });
  it("owning teacher can bump returnCount when returning", async () => {
    await seedSub("rc5", { status: "pending" });
    await assertSucceeds(updateDoc(doc(ctxFor("ua", TEACHER_A), "submissions", "rc5"), { status: "returned", returnCount: 1 }));
  });
  it("the owning teacher can publish (grade) the submission", async () => {
    await assertSucceeds(
      updateDoc(doc(ctxFor("ua", TEACHER_A), "submissions", "subA_stud1"), {
        status: "published",
        finalGrade: { score: 90 },
      })
    );
  });
});

describe("enrollments: self-enroll + limited self-edit", () => {
  const enr = (over = {}) => ({
    studentUID: "student1", ownerEmail: TEACHER_A, sectionId: "secA", studentName: "Juan", seen: false, status: "pending", ...over,
  });
  it("student can self-enroll as pending (own uid, real section owner, id sectionId_uid)", async () => {
    const db = ctxFor("student1", "s1@x.com");
    await assertSucceeds(setDoc(doc(db, "enrollments", "secA_student1"), enr()));
  });
  it("denies a self-approved enrollment (status approved with no invite)", async () => {
    const db = ctxFor("student1", "s1@x.com");
    await assertFails(setDoc(doc(db, "enrollments", "secA_student1"), enr({ status: "approved" })));
  });
  it("denies a missing status (would count as approved everywhere)", async () => {
    const db = ctxFor("student1", "s1@x.com");
    const { status, ...noStatus } = enr();
    await assertFails(setDoc(doc(db, "enrollments", "secA_student1"), noStatus));
  });
  it("denies a fake ownerEmail (must be the section's real owner)", async () => {
    const db = ctxFor("student1", "s1@x.com");
    await assertFails(setDoc(doc(db, "enrollments", "secA_student1"), enr({ ownerEmail: TEACHER_B })));
  });
  it("legacy section with no ownerEmail belongs to the super admin", async () => {
    const db = ctxFor("student1", "s1@x.com");
    await assertFails(setDoc(doc(db, "enrollments", "secLegacy_student1"), enr({ sectionId: "secLegacy", ownerEmail: TEACHER_A })));
    await assertSucceeds(setDoc(doc(db, "enrollments", "secLegacy_student1"), enr({ sectionId: "secLegacy", ownerEmail: SUPER_ADMIN })));
  });
  it("denies a random id or an id for someone else's uid", async () => {
    const db = ctxFor("student1", "s1@x.com");
    await assertFails(addDoc(collection(db, "enrollments"), enr()));
    await assertFails(setDoc(doc(db, "enrollments", "secA_student2"), enr()));
  });
  it("student cannot create an enrollment with manualScores", async () => {
    const db = ctxFor("student1", "s1@x.com");
    await assertFails(setDoc(doc(db, "enrollments", "secA_student1"), enr({ manualScores: { termExam: 100 } })));
  });
  it("approved is allowed only when the teacher invited this exact email to this section", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "invites", "secA_s1@x.com"), {
        studentEmail: "s1@x.com", sectionId: "secA", ownerEmail: TEACHER_A, studentName: "Juan",
      });
    });
    const db = ctxFor("student1", "s1@x.com");
    await assertSucceeds(setDoc(doc(db, "enrollments", "secA_student1"), enr({ status: "approved" })));
    // someone else's invite does not approve me
    await assertFails(setDoc(doc(ctxFor("student2", "s2@x.com"), "enrollments", "secA_student2"), enr({ studentUID: "student2", status: "approved" })));
    // an invite to a different section does not approve this one
    await assertFails(setDoc(doc(db, "enrollments", "secLegacy_student1"), enr({ sectionId: "secLegacy", ownerEmail: SUPER_ADMIN, status: "approved" })));
  });
  it("an old random-id invite does not unlock approved (client falls back to pending)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "invites", "randomInviteId"), { studentEmail: "s1@x.com", sectionId: "secA", ownerEmail: TEACHER_A });
    });
    const db = ctxFor("student1", "s1@x.com");
    await assertFails(setDoc(doc(db, "enrollments", "secA_student1"), enr({ status: "approved" })));
    await assertSucceeds(setDoc(doc(db, "enrollments", "secA_student1"), enr({ status: "pending" })));
  });
  it("student can flag leaveRequested but not change which section they're in", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "enrollments", "enr1"), {
        studentUID: "student1",
        ownerEmail: TEACHER_A,
        sectionId: "secA",
        studentName: "Juan",
      });
    });
    const db = ctxFor("student1", "s1@x.com");
    await assertSucceeds(updateDoc(doc(db, "enrollments", "enr1"), { leaveRequested: true }));
    await assertFails(updateDoc(doc(db, "enrollments", "enr1"), { sectionId: "secB" }));
  });
  it("student can stamp subsVersion on their OWN enrollment only", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "enrollments", "enr1"), {
        studentUID: "student1", ownerEmail: TEACHER_A, sectionId: "secA", studentName: "Juan",
      });
    });
    await assertSucceeds(updateDoc(doc(ctxFor("student1", "s1@x.com"), "enrollments", "enr1"), { subsVersion: 123 }));
    await assertFails(updateDoc(doc(ctxFor("student2", "s2@x.com"), "enrollments", "enr1"), { subsVersion: 456 }));
    await assertFails(updateDoc(doc(ctxFor("student1", "s1@x.com"), "enrollments", "enr1"), { subsVersion: 789, status: "approved" }));
  });
  it("owning teacher can stamp subsVersion (touchStudentSubs)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "enrollments", "enr1"), {
        studentUID: "student1", ownerEmail: TEACHER_A, sectionId: "secA", studentName: "Juan",
      });
    });
    await assertSucceeds(updateDoc(doc(ctxFor("ua", TEACHER_A), "enrollments", "enr1"), { subsVersion: 1 }));
  });
});

describe("settings: per-teacher current-term marker", () => {
  it("a teacher can write their OWN settings doc (id == their email)", async () => {
    await assertSucceeds(
      setDoc(doc(ctxFor("ua", TEACHER_A), "settings", TEACHER_A), {
        currentSchoolYear: "2026-2027",
        currentTerm: "2",
        ownerEmail: TEACHER_A,
      })
    );
  });
  it("a teacher CANNOT write another teacher's settings doc", async () => {
    await assertFails(
      setDoc(doc(ctxFor("ub", TEACHER_B), "settings", TEACHER_A), {
        currentSchoolYear: "2026-2027",
        currentTerm: "2",
        ownerEmail: TEACHER_A,
      })
    );
  });
  it("a non-teacher signed-in user cannot write a settings doc", async () => {
    await assertFails(
      setDoc(doc(ctxFor("stud", "student@x.com"), "settings", "student@x.com"), {
        currentSchoolYear: "2026-2027",
        currentTerm: "2",
      })
    );
  });
  it("any signed-in user can GET a teacher's settings (students read it to filter terms)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "settings", TEACHER_A), {
        currentSchoolYear: "2026-2027",
        currentTerm: "2",
        ownerEmail: TEACHER_A,
      });
    });
    await assertSucceeds(getDoc(doc(ctxFor("stud", "s1@x.com"), "settings", TEACHER_A)));
  });
  it("an unauthenticated user cannot read settings", async () => {
    await assertFails(getDoc(doc(anon(), "settings", TEACHER_A)));
  });
});

describe("submissionAttempts: returned-version history", () => {
  it("the owning teacher can create an attempt snapshot stamped with their email", async () => {
    await assertSucceeds(
      addDoc(collection(ctxFor("ua", TEACHER_A), "submissionAttempts"), {
        ownerEmail: TEACHER_A,
        submissionId: "subA_stud1",
        assignmentId: "asgnA",
        studentUID: "student1",
        score: 5,
        returnedAt: 1,
      })
    );
  });
  it("a teacher CANNOT create an attempt stamped as another owner", async () => {
    await assertFails(
      addDoc(collection(ctxFor("ua", TEACHER_A), "submissionAttempts"), {
        ownerEmail: TEACHER_B,
        submissionId: "x",
        assignmentId: "y",
        studentUID: "z",
      })
    );
  });
  it("a student cannot create an attempt snapshot", async () => {
    await assertFails(
      addDoc(collection(ctxFor("student1", "s1@x.com"), "submissionAttempts"), {
        ownerEmail: TEACHER_A,
        submissionId: "subA_stud1",
        assignmentId: "asgnA",
        studentUID: "student1",
      })
    );
  });
  it("owner reads their attempts; another teacher is denied (isolation)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "submissionAttempts", "att1"), {
        ownerEmail: TEACHER_A,
        submissionId: "subA_stud1",
        assignmentId: "asgnA",
        studentUID: "student1",
      });
    });
    await assertSucceeds(
      getDocs(query(collection(ctxFor("ua", TEACHER_A), "submissionAttempts"), where("ownerEmail", "==", TEACHER_A)))
    );
    await assertFails(
      getDocs(query(collection(ctxFor("ub", TEACHER_B), "submissionAttempts"), where("ownerEmail", "==", TEACHER_A)))
    );
  });
  it("the owning student can read their own attempt history", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "submissionAttempts", "att2"), {
        ownerEmail: TEACHER_A,
        submissionId: "subA_stud1",
        assignmentId: "asgnA",
        studentUID: "student1",
      });
    });
    await assertSucceeds(getDoc(doc(ctxFor("student1", "s1@x.com"), "submissionAttempts", "att2")));
    await assertFails(getDoc(doc(ctxFor("student2", "s2@x.com"), "submissionAttempts", "att2")));
  });
  it("an attempt snapshot is immutable (no update)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "submissionAttempts", "att3"), {
        ownerEmail: TEACHER_A,
        submissionId: "subA_stud1",
        assignmentId: "asgnA",
        studentUID: "student1",
        score: 1,
      });
    });
    await assertFails(updateDoc(doc(ctxFor("ua", TEACHER_A), "submissionAttempts", "att3"), { score: 99 }));
  });
  it("the owner can delete an attempt (cascade cleanup)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "submissionAttempts", "att4"), {
        ownerEmail: TEACHER_A,
        submissionId: "subA_stud1",
        assignmentId: "asgnA",
        studentUID: "student1",
      });
    });
    await assertSucceeds(deleteDoc(doc(ctxFor("ua", TEACHER_A), "submissionAttempts", "att4")));
  });
});

describe("quizKeys: answer key is owner-only", () => {
  const key = { assignmentId: "qz1", ownerEmail: TEACHER_A, answers: { q1: 2 } };
  it("owning teacher can create + read the key", async () => {
    const db = ctxFor("ua", TEACHER_A);
    await assertSucceeds(setDoc(doc(db, "quizKeys", "qz1"), key));
    await assertSucceeds(getDoc(doc(db, "quizKeys", "qz1")));
  });
  it("a student can NEVER read the key", async () => {
    await testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "quizKeys", "qz1"), key));
    await assertFails(getDoc(doc(ctxFor("student1", "s1@x.com"), "quizKeys", "qz1")));
  });
  it("another teacher cannot read or overwrite the key", async () => {
    await testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "quizKeys", "qz1"), key));
    await assertFails(getDoc(doc(ctxFor("ub", TEACHER_B), "quizKeys", "qz1")));
    await assertFails(setDoc(doc(ctxFor("ub", TEACHER_B), "quizKeys", "qz1"), { ...key, ownerEmail: TEACHER_B }));
  });
  it("a student cannot create a key", async () => {
    await assertFails(setDoc(doc(ctxFor("student1", "s1@x.com"), "quizKeys", "qz9"), key));
  });
});

describe("quizAttempts: one server-timed start per student", () => {
  const stud = () => ctxFor("student1", "s1@x.com");
  const attempt = () => ({ assignmentId: "qz1", studentUID: "student1", ownerEmail: TEACHER_A, startedAt: serverTimestamp() });
  it("student can check a not-yet-existing attempt of their own", async () => {
    await assertSucceeds(getDoc(doc(stud(), "quizAttempts", "qz1_student1")));
  });
  it("student cannot peek at another student's attempt id", async () => {
    await assertFails(getDoc(doc(stud(), "quizAttempts", "qz1_student2")));
  });
  it("student can start once with server time", async () => {
    await assertSucceeds(setDoc(doc(stud(), "quizAttempts", "qz1_student1"), attempt()));
    await assertSucceeds(getDoc(doc(stud(), "quizAttempts", "qz1_student1")));
  });
  it("student cannot backdate startedAt", async () => {
    await assertFails(setDoc(doc(stud(), "quizAttempts", "qz1_student1"), { ...attempt(), startedAt: new Date(2020, 0, 1) }));
  });
  it("student cannot restart (overwrite) or delete their attempt", async () => {
    await assertSucceeds(setDoc(doc(stud(), "quizAttempts", "qz1_student1"), attempt()));
    await assertFails(setDoc(doc(stud(), "quizAttempts", "qz1_student1"), attempt()));
    await assertFails(deleteDoc(doc(stud(), "quizAttempts", "qz1_student1")));
  });
  it("student cannot create an attempt under someone else's id", async () => {
    await assertFails(setDoc(doc(stud(), "quizAttempts", "qz1_student2"), attempt()));
  });
  it("owning teacher can list + delete (allow retake); other teacher cannot list", async () => {
    await assertSucceeds(setDoc(doc(stud(), "quizAttempts", "qz1_student1"), attempt()));
    const a = ctxFor("ua", TEACHER_A);
    await assertSucceeds(getDocs(query(collection(a, "quizAttempts"), where("ownerEmail", "==", TEACHER_A), where("assignmentId", "==", "qz1"))));
    await assertFails(getDocs(query(collection(ctxFor("ub", TEACHER_B), "quizAttempts"), where("ownerEmail", "==", TEACHER_A))));
    await assertSucceeds(deleteDoc(doc(a, "quizAttempts", "qz1_student1")));
  });
});

describe("submissions: quiz answers are final for the student", () => {
  it("student CANNOT change quizAnswers after submitting", async () => {
    await testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "submissions", "quizSub"), {
      ownerEmail: TEACHER_A, studentUID: "student1", status: "pending", quizAnswers: { q1: 0 },
    }));
    await assertFails(updateDoc(doc(ctxFor("student1", "s1@x.com"), "submissions", "quizSub"), { quizAnswers: { q1: 2 }, status: "pending" }));
  });
});

describe("unauthenticated access is denied", () => {
  it("anon cannot read a subject or submission", async () => {
    await assertFails(getDoc(doc(anon(), "subjects", "subjA")));
    await assertFails(getDoc(doc(anon(), "submissions", "subA_stud1")));
  });
});
