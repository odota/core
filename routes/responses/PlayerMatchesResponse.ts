import commonProperties from './properties/commonProperties';

export default {
  PlayerMatchesResponse: {
    title: 'PlayerMatchesResponse',
    description: 'Object containing information on the match',
    type: 'object',
    properties: {
      match_id: commonProperties.match_id,
      player_slot: commonProperties.player_slot,
      radiant_win: commonProperties.radiant_win,
      duration: commonProperties.duration,
      game_mode: {
        description:
          'Integer corresponding to game mode played. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/game_mode.json',
        type: 'integer',
      },
      lobby_type: {
        description:
          'Integer corresponding to lobby type of match. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/lobby_type.json',
        type: 'integer',
      },
      hero_id: commonProperties.hero_id,
      start_time: commonProperties.start_time,
      version: {
        description: 'version',
        type: 'integer',
        nullable: true,
      },
      kills: {
        description: 'Total kills the player had at the end of the game',
        type: 'integer',
      },
      deaths: {
        description: 'Total deaths the player had at the end of the game',
        type: 'integer',
      },
      assists: {
        description: 'Total assists the player had at the end of the game',
        type: 'integer',
      },
      skill: {
        description:
          'Skill bracket assigned by Valve (Normal, High, Very High)',
        type: 'integer',
        nullable: true,
      },
      average_rank: {
        description: 'Average rank of players with public match data',
        type: 'integer',
        nullable: true,
      },
      leaver_status: {
        description:
          "Integer describing whether or not the player left the game. 0: didn't leave. 1: left safely. 2+: Abandoned",
        type: 'integer',
      },
      party_size: {
        description: "Size of the player's party",
        type: 'integer',
        nullable: true,
      },
      hero_variant: {
        description:
          '1-indexed facet, see https://github.com/odota/dotaconstants/blob/master/build/hero_abilities.json',
        type: 'integer',
      },
    },
  },
};
