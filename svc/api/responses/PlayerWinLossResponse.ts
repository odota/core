export default {
  PlayerWinLossResponse: {
    title: "PlayerWinLossResponse",
    type: "object",
    properties: {
      win: {
        description: "Number of wins",
        type: "integer",
      },
      lose: {
        description: "Number of loses",
        type: "integer",
      },
    },
  },
};
