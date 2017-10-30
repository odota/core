const async = require('async');
const db = require('../store/db');
const utility = require('../util/utility');
const invokeInterval = utility.invokeInterval;
const queries = require('../store/queries');

function doHeroes(cb) {
  const container = utility.generateJob('api_heroes', {
    language: 'english',
  });
  utility.getData(container.url, (err, body) => {
    if (err) {
      return cb(err);
    }
    if (!body || !body.result || !body.result.heroes) {
      return cb();
    }
    return utility.getData('https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json', (err, heroData) => {
      if (err || !heroData) {
        return cb();
      }
      return async.eachSeries(body.result.heroes, (hero, cb) => {
        const heroDataHero = heroData[hero.id] || {};
        queries.upsert(db, 'heroes', Object.assign({}, hero, {
          primary_attr: heroDataHero.primary_attr,
          attack_type: heroDataHero.attack_type,
          roles: heroDataHero.roles,
          legs: heroDataHero.legs,
        }), {
          id: hero.id,
        }, cb);
      }, cb);
    });
  });
}
invokeInterval(doHeroes, 60 * 60 * 1000);
