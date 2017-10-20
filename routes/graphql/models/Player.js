const search = require('../../../store/search');

const Player = `
    type Player{
        account_id:Int,
        avatarfull:String,
        personaname:String,
        last_match_time:String,
        similarity:Float
    }
`;

const PlayerResolver = {
  RootQuery: {
    search(_, { query }) {
      console.log('alive', query);
      return new Promise((resolve, reject) => search({ q: query }, (err, result) => {
        if (err) {
          reject(err);
        }
        const final = result.map(val => ({ ...val }));
        console.log('final  ', final);
        resolve(final);
      }));
    },
  },
};

module.exports = { PlayerResolver, PlayerSchema: () => [Player] };
