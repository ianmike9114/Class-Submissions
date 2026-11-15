// Mirror of js/grading.js (maxAfterReturns) used by openReview() in js/teacher.js.
// Each "Return for revision" lowers the max score by RETURN_PENALTY, floor 0.
export const RETURN_PENALTY = 10;

function count(returnCount) {
  const n = Math.floor(Number(returnCount));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function maxAfterReturns(totalPoints, returnCount) {
  const total = Number(totalPoints);
  if (!Number.isFinite(total) || total < 0) return 0;
  return Math.max(0, total - RETURN_PENALTY * count(returnCount));
}
