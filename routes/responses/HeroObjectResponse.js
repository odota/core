import { hero_id, hero_command_name, hero_name } from '../../properties/commonProperties';

export const HeroObjectResponse = {
  title: 'HeroObjectResponse',
  type: 'object',
  properties: {
    id: hero_id,
    name: hero_command_name,
    localized_name: hero_name,
    primary_attr: {
      description: "Hero primary shorthand attribute name, e.g. 'agi'",
      type: 'string',
    },
    attack_type: {
      description: "Hero attack type, either 'Melee' or 'Ranged'",
      type: 'string',
    },
    roles: {
      type: 'array',
      items: {
        description: "A hero's role in the game",
        type: 'string',
      },
    },
  },
  required: ['id'],
};
