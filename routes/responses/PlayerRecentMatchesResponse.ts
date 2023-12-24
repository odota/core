import commonProperties from './properties/commonProperties';

export default {
  PlayerRecentMatchesResponse: {
    title: 'PlayerRecentMatchesResponse',
    description: 'match',
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
        description: 'Total kills the player had at the end of the match',
        type: 'integer',
      },
      deaths: {
        description: 'Total deaths the player had at the end of the match',
        type: 'integer',
      },
      assists: {
        description: 'Total assists the player had at the end of the match',
        type: 'integer',
      },
      skill: {
        description:
          'Skill bracket assigned by Valve (Normal, High, Very High). If the skill is unknown, will return null.',
        type: 'integer',
        nullable: true,
      },
      average_rank: {
        description: 'Average rank of players with public match data',
        type: 'integer',
        nullable: true,
      },
      xp_per_min: {
        description: 'Experience Per Minute obtained by the player',
        type: 'integer',
      },
      gold_per_min: {
        description: 'Average gold per minute of the player',
        type: 'integer',
      },
      hero_damage: {
        description: 'Total hero damage to enemy heroes',
        type: 'integer',
      },
      hero_healing: {
        description: 'Total healing of ally heroes',
        type: 'integer',
      },
      last_hits: {
        description: 'Total last hits the player had at the end of the match',
        type: 'integer',
      },
      lane: {
        description:
          'Integer corresponding to which lane the player laned in for the match',
        type: 'integer',
        nullable: true,
      },
      lane_role: {
        description: 'lane_role',
        type: 'integer',
        nullable: true,
      },
      is_roaming: {
        description: 'Boolean describing whether or not the player roamed',
        type: 'boolean',
        nullable: true,
      },
      cluster: {
        description: 'cluster',
        type: 'integer',
      },
      leaver_status: {
        description:
          "Integer describing whether or not the player left the game. 0: didn't leave. 1: left safely. 2+: Abandoned",
        type: 'integer',
      },
      party_size: {
        description:
          'Size of the players party. If not in a party, will return 1.',
        type: 'integer',
        nullable: true,
      },
    },
  },
};
