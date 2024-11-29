import db from './db';

export async function search(query: string) {
  const accountIdMatch = Number.isInteger(Number(query))
    ? await db
        .select(['account_id', 'personaname', 'avatarfull'])
        .from('players')
        .where({ account_id: Number(query) })
    : [];
  const personaNameMatch = await db.raw(
    `
    SELECT account_id, avatarfull, personaname, last_match_time, similarity(personaname, ?) as similarity
    FROM players
    WHERE ? % personaname
    ORDER BY similarity(personaname, ?) DESC, last_match_time DESC NULLS LAST
    LIMIT 50;
  `,
    [query, query, query],
  );
  // Later versions of postgres have word_similarity which may be more accurate
  return [...accountIdMatch, ...personaNameMatch.rows];
}
