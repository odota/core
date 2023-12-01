module.exports = {
  heroIdPathParam: {
    name: 'hero_id',
    in: 'path',
    description: 'Hero ID',
    required: true,
    schema: {
      type: 'integer',
    },
  },
};
