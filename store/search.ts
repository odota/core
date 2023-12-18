import db from './db';

export async function search(query: string) {
  const accountIdMatch = Number.isInteger(Number(query)) ? await db.select(['account_id', 'personaname', 'avatarfull'])
    .from('players')
    .where({ account_id: Number(query)}) : [];
  const personaNameMatch = await db.raw(
    `
  SELECT * FROM 
  (SELECT account_id, avatarfull, personaname, last_match_time
  FROM players 
  WHERE personaname ILIKE ?
  LIMIT 100) search
  ORDER BY last_match_time DESC NULLS LAST;
  `,
    [`%${query}%`]
  );
  return [...accountIdMatch, ...personaNameMatch.rows]
}
