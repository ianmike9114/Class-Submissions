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
      setDoc(doc(db, "submissions", "new9"), {
        studentUID: "student9",
        ownerEmail: TEACHER_A,
        status: "pending",
      })
    );
    await assertFails(
      setDoc(doc(db, "submissions", "spoof9"), {
        studentUID: "someone-else",
        ownerEmail: TEACHER_A,
        status: "pending",
      })
    );
  });
});

describe("submissions: student edits are field-limited and status-gated", () => {
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
  it("student can self-enroll (own uid, ownerEmail present)", async () => {
    const db = ctxFor("student1", "s1@x.com");
    await assertSucceeds(
      addDoc(collection(db, "enrollments"), {
        studentUID: "student1",
        ownerEmail: TEACHER_A,
        sectionId: "secA",
        studentName: "Juan",
        seen: false,
      })
    );
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

describe("unauthenticated access is denied", () => {
  it("anon cannot read a subject or submission", async () => {
    await assertFails(getDoc(doc(anon(), "subjects", "subjA")));
    await assertFails(getDoc(doc(anon(), "submissions", "subA_stud1")));
  });
});
