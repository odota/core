import commonProperties from '../../properties/commonProperties';

export default {
  PlayerCountsResponse: {
    title: 'PlayerCountsResponse',
    type: 'object',
    properties: {
      leaver_status: {
        description:
          "Integer describing whether or not the player left the game. 0: didn't leave. 1: left safely. 2+: Abandoned",
        type: 'object',
      },
      game_mode: {
        description:
          'Integer corresponding to game mode played. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/game_mode.json',
        type: 'object',
      },
      lobby_type: {
        description:
          'Integer corresponding to lobby type of match. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/lobby_type.json',
        type: 'object',
      },
      lane_role: {
        description: 'lane_role',
        type: 'object',
      },
      region: {
        description:
          'Integer corresponding to the region the game was played on',
        type: 'object',
      },
      patch: {
        description: 'Patch ID, from dotaconstants',
        type: 'object',
      },
    },
  },
};
