import { account_id as _account_id, general_name } from '../../properties/commonProperties';

export const TeamPlayersResponse = {
  title: 'TeamPlayersResponse',
  type: 'object',
  properties: {
    account_id: _account_id,
    name: general_name,
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
};
