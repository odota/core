// Updates game items in the database
import { items } from "dotaconstants";
import db, { upsert } from "./store/db.ts";
import { runInLoop } from "./store/queue.ts";
import axios from "axios";

await runInLoop(
  async function doItems() {
    const url = `https://www.dota2.com/datafeed/itemlist?language=english`;
    const resp = await axios.get(url);
    const arr: any[] = resp.data?.result?.data?.itemabilities;
    if (!arr) {
      throw new Error("invalid response");
    }
    for (let item of arr) {
      item.localized_name = item.name_english_loc;
      item.cost =
        items?.[item.name.replace(/^item_/, "") as keyof typeof items]?.cost ||
        0;
      item.recipe = item.name.includes("recipe") ? 1 : 0;
      // NOTE: properties secret_shop and side_shop are no longer present
      await upsert(db, "items", item, {
        id: item.id,
      });
    }
  },
  1 * 60 * 60 * 1000,
);
