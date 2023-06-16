const commonProperties = require("../../properties/commonProperties");

module.exports = {
  HeroObjectResponse: {
    title: "HeroObjectResponse",
    type: "object",
    properties: {
      id: commonProperties.hero_id,
      name: commonProperties.hero_command_name,
      localized_name: commonProperties.hero_name,
      primary_attr: {
        description: "Hero primary shorthand attribute name, e.g. 'agi'",
        type: "string",
      },
      attack_type: {
        description: "Hero attack type, either 'Melee' or 'Ranged'",
        type: "string",
      },
      roles: {
        type: "array",
        items: {
          description: "A hero's role in the game",
          type: "string",
        },
      },
    },
  },
};
