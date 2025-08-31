import commonProperties from './properties/commonProperties.ts';

export default {
  TeamPlayersResponse: {
    title: 'TeamPlayersResponse',
    type: 'object',
    properties: {
      account_id: commonProperties.account_id,
      name: commonProperties.general_name,
      games_played: {
        description: 'Number of games played',
        type: 'integer',
      },
      wins: {
        description: 'Number of wins',
        type: 'integer',
      },
      is_current_team_member: {
        description: 'If this player is on the current roster',
        type: 'boolean',
      },
    },
  },
};
