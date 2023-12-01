import { hero_id as _hero_id } from '../../properties/commonProperties';

export const BenchmarksResponse = {
  title: 'BenchmarksResponse',
  type: 'object',
  properties: {
    hero_id: _hero_id,
    result: {
      description: 'result',
      type: 'object',
      properties: {
        gold_per_min: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              percentile: {
                description: 'percentile',
                type: 'number',
              },
              value: {
                description: 'value',
                type: 'number',
              },
            },
          },
        },
        xp_per_min: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              percentile: {
                description: 'percentile',
                type: 'number',
              },
              value: {
                description: 'value',
                type: 'number',
              },
            },
          },
        },
        kills_per_min: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              percentile: {
                description: 'percentile',
                type: 'number',
              },
              value: {
                description: 'value',
                type: 'number',
              },
            },
          },
        },
        last_hits_per_min: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              percentile: {
                description: 'percentile',
                type: 'number',
              },
              value: {
                description: 'value',
                type: 'number',
              },
            },
          },
        },
        hero_damage_per_min: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              percentile: {
                description: 'percentile',
                type: 'number',
              },
              value: {
                description: 'value',
                type: 'number',
              },
            },
          },
        },
        hero_healing_per_min: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              percentile: {
                description: 'percentile',
                type: 'number',
              },
              value: {
                description: 'value',
                type: 'number',
              },
            },
          },
        },
        tower_damage: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              percentile: {
                description: 'percentile',
                type: 'number',
              },
              value: {
                description: 'value',
                type: 'integer',
              },
            },
          },
        },
      },
    },
  },
};
