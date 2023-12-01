import { league_name } from '../../properties/commonProperties';

export const LeagueObjectResponse = {
  title: 'LeagueObjectResponse',
  type: 'object',
  properties: {
    leagueid: {
      description: 'leagueid',
      type: 'integer',
    },
    ticket: {
      description: 'ticket',
      type: 'string',
    },
    banner: {
      description: 'banner',
      type: 'string',
    },
    tier: {
      description: 'tier',
      type: 'string',
    },
    name: league_name,
  },
};
