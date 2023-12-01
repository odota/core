import { match_id as _match_id } from "../../properties/commonProperties";

export const ReplaysResponse = {
  title: "ReplaysResponse",
  type: "object",
  properties: {
    match_id: _match_id,
    cluster: {
      description: "cluster",
      type: "integer",
    },
    replay_salt: {
      description: "replay_salt",
      type: "integer",
    },
  },
};
