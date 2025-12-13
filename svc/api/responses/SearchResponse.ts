import commonProperties from "./properties/commonProperties.ts";

export default {
  SearchResponse: {
    title: "SearchResponse",
    type: "object",
    properties: {
      account_id: commonProperties.account_id,
      avatarfull: {
        description: "avatarfull",
        type: "string",
        nullable: true,
      },
      personaname: commonProperties.persona_name,
      last_match_time: {
        description: "last_match_time. May not be present or null.",
        type: "string",
      },
      similarity: {
        description: "similarity",
        type: "number",
      },
    },
  },
};
