export const HeroDurationsResponse = {
  title: 'HeroDurationsResponse',
  type: 'object',
  properties: {
    duration_bin: {
      description: 'Lower bound of number of seconds the match lasted',
      type: 'string',
    },
    games_played: {
      description: 'Number of games played',
      type: 'integer',
    },
    wins: {
      description: 'Number of wins',
      type: 'integer',
    },
  },
};
