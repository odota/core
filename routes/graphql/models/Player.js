const search = require('../../../store/search');
const Pagination = require('./Pagination');

const Player = `
    type Player{
        account_id:Int,
        avatarfull:String,
        personaname:String,
        last_match_time:String,
        similarity:Float
    } 
`;
const PagedPlayer = `
    type PagedPlayer{
    content:[Player]
    pagination:Pagination
    }
`;


const PlayerResolver = {
  RootQuery: {
    search(_, {
      query, pageSize, page, similarity,
    }) {
      return new Promise((resolve, reject) =>
        search(
          {
            q: query,
            pageSize,
            page,
            similarity,
          },
          (err, result) => {
            if (err) {
              reject(err);
            }
            const players = result.map(val => ({
              ...val,
            }));
            resolve({
              content: players,
              pagination: { page, pageSize },
            });
          },
        ));
    },
  },
};

module.exports = {
  PlayerResolver,
  PlayerSchema: () => [Player, PagedPlayer, Pagination],
};
