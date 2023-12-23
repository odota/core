export default {
  teamIdPathParam: {
    name: 'team_id',
    in: 'path',
    description: 'Team ID',
    required: true,
    schema: {
      type: 'integer',
    },
  },
};
