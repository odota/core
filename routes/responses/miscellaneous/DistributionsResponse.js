const commonProperties = require("../../commonProperties");

module.exports = {
  DistributionsResponse: {
    title: "DistributionsResponse",
    type: "object",
    properties: {
      ranks: {
        description: "ranks",
        type: "object",
        properties: {
          commmand: {
            description: "command",
            type: "string",
          },
          rowCount: {
            description: "rowCount",
            type: "integer",
          },
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
          fields: {
            description: "fields",
            type: "array",
            items: {
              type: "object",
              properties: {
                name: commonProperties.field_name,
                tableID: {
                  description: "tableID",
                  type: "integer",
                },
                columnID: {
                  description: "columnID",
                  type: "integer",
                },
                dataTypeID: {
                  description: "dataTypeID",
                  type: "integer",
                },
                dataTypeSize: {
                  description: "dataTypeSize",
                  type: "integer",
                },
                dataTypeModifier: {
                  description: "dataTypeModifier",
                  type: "integer",
                },
                format: {
                  description: "format",
                  type: "string",
                },
              },
            },
          },
          rowAsArray: {
            description: "rowAsArray",
            type: "boolean",
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
      mmr: {
        description: "mmr",
        type: "object",
        properties: {
          commmand: {
            description: "command",
            type: "string",
          },
          rowCount: {
            description: "rowCount",
            type: "integer",
          },
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
          fields: {
            description: "fields",
            type: "array",
            items: {
              type: "object",
              properties: {
                name: commonProperties.field_name,
                tableID: {
                  description: "tableID",
                  type: "integer",
                },
                columnID: {
                  description: "columnID",
                  type: "integer",
                },
                dataTypeID: {
                  description: "dataTypeID",
                  type: "integer",
                },
                dataTypeSize: {
                  description: "dataTypeSize",
                  type: "integer",
                },
                dataTypeModifier: {
                  description: "dataTypeModifier",
                  type: "integer",
                },
                format: {
                  description: "format",
                  type: "string",
                },
              },
            },
          },
          rowAsArray: {
            description: "rowAsArray",
            type: "boolean",
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
      country_mmr: {
        description: "country_mmr",
        type: "object",
        properties: {
          commmand: {
            description: "command",
            type: "string",
          },
          rowCount: {
            description: "rowCount",
            type: "integer",
          },
          rows: {
            description: "rows",
            type: "array",
            items: {
              type: "object",
              properties: {
                loccountrycode: {
                  description: "loccountrycode",
                  type: "string",
                  nullable: true,
                },
                count: {
                  description: "count",
                  type: "integer",
                },
                avg: {
                  description: "avg",
                  type: "string",
                },
                common: {
                  description: "common",
                  type: "string",
                },
              },
            },
          },
          fields: {
            description: "fields",
            type: "array",
            items: {
              type: "object",
              properties: {
                name: commonProperties.field_name,
                tableID: {
                  description: "tableID",
                  type: "integer",
                },
                columnID: {
                  description: "columnID",
                  type: "integer",
                },
                dataTypeID: {
                  description: "dataTypeID",
                  type: "integer",
                },
                dataTypeSize: {
                  description: "dataTypeSize",
                  type: "integer",
                },
                dataTypeModifier: {
                  description: "dataTypeModifier",
                  type: "integer",
                },
                format: {
                  description: "format",
                  type: "string",
                },
              },
            },
          },
          rowAsArray: {
            description: "rowAsArray",
            type: "boolean",
          },
        },
      },
    },
  },
};
