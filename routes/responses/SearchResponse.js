import { account_id as _account_id, persona_name } from '../../properties/commonProperties';

export const SearchResponse = {
  title: 'SearchResponse',
  type: 'object',
  properties: {
    account_id: _account_id,
    avatarfull: {
      description: 'avatarfull',
      type: 'string',
      nullable: true,
    },
    personaname: persona_name,
    last_match_time: {
      description: 'last_match_time. May not be present or null.',
      type: 'string',
    },
    similarity: {
      description: 'similarity',
      type: 'number',
    },
  },
};
