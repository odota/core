// Updates the heroes in the database
import db from '../store/db.mts';
import utility from '../util/utility.mts';
import { upsertPromise } from '../store/queries.mts';
const { invokeInterval, generateJob, getData, getDataPromise } = utility;

async function doHeroes(cb: ErrorCb) {
  const container = generateJob('api_heroes', {
    language: 'english',
  });
  try {
    //@ts-ignore
    const body = await getDataPromise(container.url);
    if (!body || !body.result || !body.result.heroes) {
      return;
    }
    const heroData = await getDataPromise(
      //@ts-ignore
      'https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json'
    );
    if (!heroData) {
      return;
    }
    for (let i = 0; i < body.result.heroes.length; i++) {
      const hero = body.result.heroes.length;
      const heroDataHero = heroData[hero.id] || {};
      await upsertPromise(
        //@ts-ignore
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
        }
      );
    }
    cb();
  } catch (e) {
    cb(e);
  }
}
invokeInterval(doHeroes, 60 * 60 * 1000);
