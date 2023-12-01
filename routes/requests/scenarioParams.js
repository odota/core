import { teamScenariosQueryParams } from '../../../util/scenariosUtil.js';

export const scenarioParam = {
  name: 'scenario',
  in: 'query',
  description: teamScenariosQueryParams.toString(),
  required: false,
  schema: {
    type: 'string',
  },
};
