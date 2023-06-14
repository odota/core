const commonProperties = require("../../commonProperties");

module.exports = {
  ReplaysResponse: {
    title: "ReplaysResponse",
    type: "object",
    properties: {
      match_id: commonProperties.match_id,
      cluster: {
        description: "cluster",
        type: "integer",
      },
      replay_salt: {
        description: "replay_salt",
        type: "integer",
      },
    },
  },
};
