const commonProperties = require("../../properties/responses/commonProperties");

module.exports = {
  ParsedMatchesResponse: {
    title: "ParsedMatchesResponse",
    type: "object",
    properties: {
      match_id: commonProperties.match_id,
    },
  },
};
