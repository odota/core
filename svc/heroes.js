import { eachSeries } from 'async';
import db from '../store/db.js';
import utility from '../util/utility.js';
import { upsert } from '../store/queries.js';

const { invokeInterval, generateJob, getData } = utility;

function doHeroes(cb) {
  const container = generateJob('api_heroes', {
    language: 'english',
  });
  getData(container.url, (err, body) => {
    if (err) {
      return cb(err);
    }
    if (!body || !body.result || !body.result.heroes) {
      return cb();
    }
    return getData(
      'https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json',
      (err, heroData) => {
        if (err || !heroData) {
          return cb();
        }
        return eachSeries(
          body.result.heroes,
          (hero, cb) => {
            const heroDataHero = heroData[hero.id] || {};
            upsert(
              db,
              'heroes',
              {
                ...hero,
                primary_attr: heroDataHero.primary_attr,
                attack_type: heroDataHero.attack_type,
                roles: heroDataHero.roles,
                legs: heroDataHero.legs,
              },
              {
                id: hero.id,
              },
              cb
            );
          },
          cb
        );
      }
    );
  });
}
invokeInterval(doHeroes, 60 * 60 * 1000);
