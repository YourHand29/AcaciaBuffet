import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGrade, letterFor } from "./grades.ts";

const a = (id: number, group: string, score: number | null, pts: number, extra: Partial<{ excused: boolean; omitFromFinal: boolean }> = {}) => ({
  id,
  name: `a${id}`,
  group,
  score,
  pointsPossible: pts,
  excused: extra.excused ?? false,
  omitFromFinal: extra.omitFromFinal ?? false,
});

test("unweighted: total points", () => {
  const r = computeGrade([a(1, "HW", 8, 10), a(2, "HW", 10, 10), a(3, "Exam", 70, 100)], [
    { name: "HW", weight: null, dropLowest: 0, dropHighest: 0 },
    { name: "Exam", weight: null, dropLowest: 0, dropHighest: 0 },
  ]);
  assert.equal(r.weighted, false);
  assert.equal(r.percent, (88 / 120) * 100);
});

test("weighted with drop lowest and renormalization for empty categories", () => {
  const r = computeGrade([a(1, "HW", 5, 10), a(2, "HW", 10, 10), a(3, "HW", 9, 10)], [
    { name: "HW", weight: 40, dropLowest: 1, dropHighest: 0 },
    { name: "Final", weight: 60, dropLowest: 0, dropHighest: 0 },
  ]);
  assert.equal(r.weighted, true);
  assert.equal(r.categories[0]!.percent, 95);
  assert.deepEqual(r.categories[0]!.dropped, [1]);
  assert.equal(r.percent, 95);
});

test("ungraded, excused and omitted assignments are ignored", () => {
  const r = computeGrade(
    [a(1, "HW", 10, 10), a(2, "HW", null, 10), a(3, "HW", 0, 10, { excused: true }), a(4, "HW", 0, 10, { omitFromFinal: true })],
    [{ name: "HW", weight: null, dropLowest: 0, dropHighest: 0 }],
  );
  assert.equal(r.percent, 100);
});

test("letters", () => {
  assert.equal(letterFor(95), "A");
  assert.equal(letterFor(90), "A-");
  assert.equal(letterFor(59.9), "F");
  assert.equal(letterFor(null), null);
  assert.equal(letterFor(85, { Pass: 70, Fail: 0 }), "Pass");
});
