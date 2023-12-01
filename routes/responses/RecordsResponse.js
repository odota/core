import { match_id as _match_id, start_time as _start_time, hero_id as _hero_id } from '../../properties/commonProperties';

export const RecordsResponse = {
  title: 'RecordsResponse',
  type: 'object',
  properties: {
    match_id: _match_id,
    start_time: _start_time,
    hero_id: _hero_id,
    score: {
      description: 'Record score',
      type: 'integer',
    },
  },
};
