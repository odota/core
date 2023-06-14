module.exports = {
  PlayerTotalsResponse: {
    title: "PlayerTotalsResponse",
    type: "object",
    properties: {
      field: {
        description: "field",
        type: "string",
      },
      n: {
        description: "number",
        type: "integer",
      },
      sum: {
        description: "sum",
        type: "number",
      },
    },
  },
};
