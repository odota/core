import { match_id as _match_id, radiant_win as _radiant_win, radiant_score as _radiant_score, dire_score as _dire_score, duration as _duration, start_time as _start_time } from '../../properties/commonProperties';

export const TeamMatchObjectResponse = {
  title: 'TeamMatchObjectResponse',
  type: 'object',
  properties: {
    match_id: _match_id,
    radiant: {
      description: 'Whether the team/player/hero was on Radiant',
      type: 'boolean',
    },
    radiant_win: _radiant_win,
    radiant_score: _radiant_score,
    dire_score: _dire_score,
    duration: _duration,
    start_time: _start_time,
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
};
