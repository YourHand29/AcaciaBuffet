/**
 * Weighted grade calculation replicating Canvas semantics:
 *  - Only graded, non-excused, non-omitted assignments count ("current" grade).
 *  - Per-category drop_lowest / drop_highest by *percentage* (Canvas drops by score ratio).
 *  - If weights are used, each category contributes weight * (earned/possible); categories
 *    with no graded items are excluded and remaining weights are renormalized.
 *  - If no weights, total earned / total possible.
 */

export interface GradeInputAssignment {
  id: number;
  name: string;
  group: string;
  score: number | null;
  pointsPossible: number | null;
  excused: boolean;
  omitFromFinal: boolean;
}

export interface GradeInputCategory {
  name: string;
  weight: number | null;
  dropLowest: number;
  dropHighest: number;
}

export interface CategoryResult {
  name: string;
  weight: number | null;
  dropLowest: number;
  earned: number;
  possible: number;
  percent: number | null;
  dropped: number[];
}

export interface GradeResult {
  percent: number | null;
  categories: CategoryResult[];
  weighted: boolean;
}

export function computeGrade(assignments: GradeInputAssignment[], categories: GradeInputCategory[]): GradeResult {
  const weighted = categories.some((c) => (c.weight ?? 0) > 0);
  const results: CategoryResult[] = [];

  for (const cat of categories) {
    const graded = assignments.filter(
      (a) => a.group === cat.name && a.score !== null && !a.excused && !a.omitFromFinal && (a.pointsPossible ?? 0) > 0,
    );
    const sorted = [...graded].sort((a, b) => a.score! / a.pointsPossible! - b.score! / b.pointsPossible!);
    const dropped: number[] = [];
    for (let i = 0; i < cat.dropLowest && sorted.length > 1; i++) dropped.push(sorted.shift()!.id);
    for (let i = 0; i < cat.dropHighest && sorted.length > 1; i++) dropped.push(sorted.pop()!.id);

    const earned = sorted.reduce((n, a) => n + a.score!, 0);
    const possible = sorted.reduce((n, a) => n + a.pointsPossible!, 0);
    results.push({
      name: cat.name,
      weight: cat.weight,
      dropLowest: cat.dropLowest,
      earned,
      possible,
      percent: possible > 0 ? (earned / possible) * 100 : null,
      dropped,
    });
  }

  let percent: number | null;
  if (weighted) {
    const active = results.filter((r) => r.percent !== null && (r.weight ?? 0) > 0);
    const totalWeight = active.reduce((n, r) => n + r.weight!, 0);
    percent = totalWeight > 0 ? active.reduce((n, r) => n + (r.weight! / totalWeight) * r.percent!, 0) : null;
  } else {
    const earned = results.reduce((n, r) => n + r.earned, 0);
    const possible = results.reduce((n, r) => n + r.possible, 0);
    percent = possible > 0 ? (earned / possible) * 100 : null;
  }

  return { percent, categories: results, weighted };
}

export const STANDARD_SCHEME: Record<string, number> = {
  A: 93, "A-": 90, "B+": 87, B: 83, "B-": 80, "C+": 77, C: 73, "C-": 70, "D+": 67, D: 63, "D-": 60, F: 0,
};

export function letterFor(percent: number | null, scheme: Record<string, number> = STANDARD_SCHEME): string | null {
  if (percent === null) return null;
  const entries = Object.entries(scheme).sort((a, b) => b[1] - a[1]);
  for (const [letter, cutoff] of entries) if (percent >= cutoff) return letter;
  return entries.at(-1)?.[0] ?? null;
}
