const Player = `
    type Player{
        account_id:Int,
        avatarfull:String,
        personaname:String,
        similarity:Float
    }
`;

const PlayerResolver = {
  RootQuery: {
    search(_, { query }) {
      console.log('alive', query);
      return [
        {
          account_id: 50,
          avatarfull: 'test',
          personaname: 'testName',
          similarity: 1.5,
        },
      ];
    },
  },
};

module.exports = { PlayerResolver, PlayerSchema: () => [Player] };
