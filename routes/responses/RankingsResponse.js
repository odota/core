import { hero_id as _hero_id, account_id as _account_id, persona_name } from '../../properties/commonProperties';

export const RankingsResponse = {
  title: 'RankingsResponse',
  type: 'object',
  properties: {
    hero_id: _hero_id,
    rankings: {
      description: 'rankings',
      type: 'array',
      items: {
        type: 'object',
        properties: {
          account_id: _account_id,
          score: {
            description: 'Score',
            type: 'number',
          },
          steamid: {
            description: 'steamid',
            type: 'string',
            nullable: true,
          },
          avatar: {
            description: 'avatar',
            type: 'string',
            nullable: true,
          },
          avatarmedium: {
            description: 'avatarmedium',
            type: 'string',
            nullable: true,
          },
          avatarfull: {
            description: 'avatarfull',
            type: 'string',
            nullable: true,
          },
          profileurl: {
            description: 'profileurl',
            type: 'string',
            nullable: true,
          },
          personaname: persona_name,
          last_login: {
            description: 'last_login',
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          full_history_time: {
            description: 'full_history_time',
            type: 'string',
            format: 'date-time',
          },
          cheese: {
            description: 'cheese',
            type: 'integer',
            nullable: true,
          },
          fh_unavailable: {
            description: 'fh_unavailable',
            type: 'boolean',
            nullable: true,
          },
          loccountrycode: {
            description: 'loccountrycode',
            type: 'string',
            nullable: true,
          },
          rank_tier: {
            description: 'rank_tier',
            type: 'integer',
            nullable: true,
          },
        },
      },
    },
  },
};
