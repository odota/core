const commonProperties = require("../../properties/commonProperties");

module.exports = {
  ParsedMatchesResponse: {
    title: "ParsedMatchesResponse",
    type: "object",
    properties: {
      match_id: commonProperties.match_id,
    },
  },
};
