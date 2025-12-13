export default {
  DistributionsResponse: {
    title: "DistributionsResponse",
    type: "object",
    properties: {
      ranks: {
        description: "ranks",
        type: "object",
        properties: {
          rows: {
            description: "rows",
            type: "array",
            items: {
              type: "object",
              properties: {
                bin: {
                  description: "bin",
                  type: "integer",
                },
                bin_name: {
                  description: "bin_name",
                  type: "integer",
                },
                count: {
                  description: "count",
                  type: "integer",
                },
                cumulative_sum: {
                  description: "cumulative_sum",
                  type: "integer",
                },
              },
            },
          },
          sum: {
            description: "sum",
            type: "object",
            properties: {
              count: {
                description: "count",
                type: "integer",
              },
            },
          },
        },
      },
    },
  },
};
