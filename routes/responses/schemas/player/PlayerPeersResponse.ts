import commonProperties from '../../properties/commonProperties';

export default {
  PlayerPeersResponse: {
    title: 'PlayerPeersResponse',
    type: 'object',
    properties: {
      account_id: commonProperties.account_id,
      last_played: {
        description: 'last_played',
        type: 'integer',
      },
      win: {
        description: 'win',
        type: 'integer',
      },
      games: {
        description: 'games',
        type: 'integer',
      },
      with_win: {
        description: 'with_win',
        type: 'integer',
      },
      with_games: {
        description: 'with_games',
        type: 'integer',
      },
      against_win: {
        description: 'against_win',
        type: 'integer',
      },
      against_games: {
        description: 'against_games',
        type: 'integer',
      },
      with_gpm_sum: {
        description: 'with_gpm_sum',
        type: 'integer',
      },
      with_xpm_sum: {
        description: 'with_xpm_sum',
        type: 'integer',
      },
      personaname: commonProperties.persona_name,
      name: commonProperties.general_name,
      is_contributor: {
        description: 'is_contributor',
        type: 'boolean',
      },
      is_subscriber: {
        description: 'is_subscriber',
        type: 'boolean',
      },
      last_login: {
        description: 'last_login',
        type: 'string',
        nullable: true,
      },
      avatar: {
        description: 'avatar',
        type: 'string',
        nullable: true,
      },
      avatarfull: {
        description: 'avatarfull',
        type: 'string',
        nullable: true,
      },
    },
  },
};
