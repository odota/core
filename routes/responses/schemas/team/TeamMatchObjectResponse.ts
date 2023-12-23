import commonProperties from '../../properties/commonProperties';

export default {
  TeamMatchObjectResponse: {
    title: 'TeamMatchObjectResponse',
    type: 'object',
    properties: {
      match_id: commonProperties.match_id,
      radiant: {
        description: 'Whether the team/player/hero was on Radiant',
        type: 'boolean',
      },
      radiant_win: commonProperties.radiant_win,
      radiant_score: commonProperties.radiant_score,
      dire_score: commonProperties.dire_score,
      duration: commonProperties.duration,
      start_time: commonProperties.start_time,
      leagueid: {
        description: 'Identifier for the league the match took place in',
        type: 'integer',
      },
      league_name: {
        description: 'Name of league the match took place in',
        type: 'string',
      },
      cluster: {
        description: 'cluster',
        type: 'integer',
      },
      opposing_team_id: {
        description: 'Opposing team identifier',
        type: 'integer',
      },
      opposing_team_name: {
        description: "Opposing team name, e.g. 'Evil Geniuses'",
        type: 'string',
        nullable: true,
      },
      opposing_team_logo: {
        description: 'Opposing team logo url',
        type: 'string',
      },
    },
  },
};
