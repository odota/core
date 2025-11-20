// Updates the heroes in the database
import axios from 'axios';
import db, { upsert } from './store/db.ts';
import {
  SteamAPIUrls,
  getSteamAPIDataWithRetry,
  runInLoop,
} from './util/utility.ts';

runInLoop(
  async function heroes() {
    const url = SteamAPIUrls.api_heroes({
      language: 'english',
    });
    const body = await getSteamAPIDataWithRetry({ url });
    if (!body || !body.result || !body.result.heroes) {
      return;
    }
    const heroResp = await axios.get(
      'https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json',
    );
    const heroData = heroResp.data;
    if (!heroData) {
      return;
    }
    for (let i = 0; i < body.result.heroes.length; i++) {
      const hero = body.result.heroes[i];
      const heroDataHero = heroData[hero.id] || {};
      await upsert(
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
      );
    }
  },
  60 * 60 * 1000,
);
