module.exports = {
  scenarioParam: {
    name: 'scenario',
    in: 'query',
    description: 'Name of the scenario (see teamScenariosQueryParams)',
    required: false,
    schema: {
      type: 'string',
    },
  },
};
