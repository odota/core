import commonProperties from './properties/commonProperties';

export default {
  ScenarioLaneRolesResponse: {
    title: 'ScenarioLaneRolesResponse',
    type: 'object',
    properties: {
      hero_id: commonProperties.hero_id,
      lane_role: {
        description: "The hero's lane role",
        type: 'integer',
      },
      time: {
        description: 'Maximum game length in seconds',
        type: 'integer',
      },
      games: {
        description:
          'The number of games where the hero played in this lane role',
        type: 'string',
      },
      wins: {
        description:
          'The number of games won where the hero played in this lane role',
        type: 'string',
      },
    },
  },
};
