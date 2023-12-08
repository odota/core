// Updates the heroes in the database
import db from '../store/db';
import { upsertPromise } from '../store/queries';
import {
  generateJob,
  getDataPromise,
  invokeIntervalAsync,
} from '../util/utility';

async function doHeroes() {
  const container = generateJob('api_heroes', {
    language: 'english',
  });
  const body = await getDataPromise(container.url);
  if (!body || !body.result || !body.result.heroes) {
    return;
  }
  const heroData = await getDataPromise(
    'https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json'
  );
  if (!heroData) {
    return;
  }
  for (let i = 0; i < body.result.heroes.length; i++) {
    const hero = body.result.heroes[i];
    const heroDataHero = heroData[hero.id] || {};
    await upsertPromise(
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
}
invokeIntervalAsync(doHeroes, 60 * 60 * 1000);
