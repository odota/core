const su = require('../../../util/scenariosUtil');

module.exports = {
  scenarioParam: {
    name: 'scenario',
    in: 'query',
    description: su.teamScenariosQueryParams.toString(),
    required: false,
    schema: {
      type: 'string',
    },
  },
};
