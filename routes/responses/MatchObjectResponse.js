import { match_id as _match_id, duration as _duration, start_time as _start_time, radiant_score as _radiant_score, dire_score as _dire_score, radiant_win as _radiant_win } from '../../properties/commonProperties';

export const MatchObjectResponse = {
  title: 'MatchObjectResponse',
  type: 'object',
  properties: {
    match_id: _match_id,
    duration: _duration,
    start_time: _start_time,
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
    radiant_score: _radiant_score,
    dire_score: _dire_score,
    radiant_win: _radiant_win,
    radiant: {
      description: 'Whether the team/player/hero was on Radiant',
      type: 'boolean',
    },
  },
};
