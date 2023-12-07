module.exports = {
  SchemaResponse: {
    title: 'SchemaResponse',
    type: 'object',
    properties: {
      table_name: {
        description: 'table_name',
        type: 'string',
      },
      column_name: {
        description: 'column_name',
        type: 'string',
      },
      data_type: {
        description: 'data_type',
        type: 'string',
      },
    },
  },
};
