import commonProperties from '../../properties/commonProperties';

export default {
  MatchObjectResponse: {
    title: 'MatchObjectResponse',
    type: 'object',
    properties: {
      match_id: commonProperties.match_id,
      duration: commonProperties.duration,
      start_time: commonProperties.start_time,
      radiant_team_id: {
        description: "The Radiant's team_id",
        type: 'integer',
      },
      radiant_name: {
        description: "The Radiant's team name",
        type: 'string',
      },
      dire_team_id: {
        description: "The Dire's team_id",
        type: 'integer',
      },
      dire_name: {
        description: "The Dire's team name",
        type: 'string',
      },
      leagueid: {
        description: 'Identifier for the league the match took place in',
        type: 'integer',
      },
      league_name: {
        description: 'Name of league the match took place in',
        type: 'string',
      },
      series_id: {
        description: 'Identifier for the series of the match',
        type: 'integer',
      },
      series_type: {
        description: 'Type of series the match was',
        type: 'integer',
      },
      radiant_score: commonProperties.radiant_score,
      dire_score: commonProperties.dire_score,
      radiant_win: commonProperties.radiant_win,
      radiant: {
        description: 'Whether the team/player/hero was on Radiant',
        type: 'boolean',
      },
    },
  },
};
