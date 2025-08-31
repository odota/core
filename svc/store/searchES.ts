import db from './db.ts';
import { es, INDEX } from './elasticsearch.ts';

export async function searchES(query: string) {
  const accountIdMatch = Number.isInteger(Number(query))
    ? await db
        .select(['account_id', 'personaname', 'avatarfull'])
        .from('players')
        .where({ account_id: Number(query) })
    : [];

  const { body } = await es.search({
    index: INDEX,
    size: 50,
    body: {
      query: {
        match: {
          personaname: {
            query,
          },
        },
      },
      sort: [{ _score: 'desc' }, { last_match_time: 'desc' }],
    },
  });
  const esRows = body.hits.hits.map((e: any) => ({
    account_id: Number(e._id),
    personaname: e._source.personaname,
    avatarfull: e._source.avatarfull,
    last_match_time: e._source.last_match_time,
    similarity: e._score,
  }));

  return [...accountIdMatch, ...esRows];
}
