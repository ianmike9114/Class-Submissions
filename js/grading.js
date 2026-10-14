// Late-resubmission penalty: every "Return for revision" lowers the maximum
// score that submission can earn by RETURN_PENALTY points (floor 0), so a
// student who submitted right the first time keeps the advantage. The count
// lives on the submission (returnCount, written by the teacher's Return
// handler); the score itself stays out of the assignment's totalPoints.

export const RETURN_PENALTY = 10;

function count(returnCount) {
  const n = Math.floor(Number(returnCount));
  return Number.isFinite(n) && n > 0 ? n : 0; // never negative: can't raise the cap
}

// Highest score this submission may get.
export function maxAfterReturns(totalPoints, returnCount) {
  const total = Number(totalPoints);
  if (!Number.isFinite(total) || total < 0) return 0;
  return Math.max(0, total - RETURN_PENALTY * count(returnCount));
}

// Plain-words note for teacher + student; "" when never returned.
export function penaltyNote(totalPoints, returnCount) {
  const n = count(returnCount);
  if (!n) return "";
  return `Max ${maxAfterReturns(totalPoints, n)} of ${Number(totalPoints) || 0} (returned ${n}× for revision, −${RETURN_PENALTY} each)`;
}
