const perMinute = (total: number | null, duration: number | null) =>
  total != null && duration ? (total / duration) * 60 : null;

/**
 * Object listing the stored columns each derived column is computed from.
 * Derived columns aren't in player_caches, so requesting one (in project, or in
 * sort, which gets projected) reads its dependencies and computes it on read.
 * */
export const derivedCols = {
  kills_per_min: {
    deps: ["kills", "duration"],
    compute: (m: ParsedPlayerMatch) => perMinute(m.kills, m.duration),
  },
  hero_damage_per_min: {
    deps: ["hero_damage", "duration"],
    compute: (m: ParsedPlayerMatch) => perMinute(m.hero_damage, m.duration),
  },
  tower_damage_per_min: {
    deps: ["tower_damage", "duration"],
    compute: (m: ParsedPlayerMatch) => perMinute(m.tower_damage, m.duration),
  },
} as const;

export type DerivedCol = keyof typeof derivedCols;

export const isDerivedCol = (field: string): field is DerivedCol =>
  field in derivedCols;

/**
 * Returns the projection with the stored columns the given derived columns are
 * computed from, or the projection untouched when none were requested.
 * */
export const withDerivedDeps = (
  cols: DerivedCol[],
  project: (keyof ParsedPlayerMatch)[],
): (keyof ParsedPlayerMatch)[] =>
  cols.length
    ? [...project, ...cols.flatMap((col) => derivedCols[col].deps)]
    : project;

/**
 * Returns the matches with the given derived columns computed onto them,
 * or the matches untouched when none were requested.
 * */
export const withDerivedCols = (
  cols: DerivedCol[],
  matches: ParsedPlayerMatch[],
): ParsedPlayerMatch[] =>
  cols.length
    ? matches.map((match) => ({
        ...match,
        ...Object.fromEntries(
          cols.map((col) => [col, derivedCols[col].compute(match)]),
        ),
      }))
    : matches;
