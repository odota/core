module.exports = {
  PlayerWordCloudResponse: {
    title: 'PlayerWordCloudResponse',
    type: 'object',
    properties: {
      my_word_counts: {
        description: 'my_word_counts',
        type: 'object',
      },
      all_word_counts: {
        description: 'all_word_counts',
        type: 'object',
      },
    },
  },
};
