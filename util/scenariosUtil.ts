import { items } from 'dotaconstants';
import { playerWon } from './utility';

// all items that cost at least 1400
const itemCost = 1400;
const dotaItems = Object.entries(items)
  .filter(([k, v]) => v.cost != null && v.cost >= itemCost)
  .map(([k, v]) => k);
const timings = [7.5, 10, 12, 15, 20, 25, 30].map((x) => x * 60);
const gameDurationBucket = [15, 30, 45, 60, 90].map((x) => x * 60);
const negativeWords = ['ff', 'report', 'gg', 'end', 'noob'];
const positiveWords = ['gl', 'glhf', 'hf', 'good luck', 'have fun'];
export const teamScenariosQueryParams = [
  'pos_chat_1min',
  'neg_chat_1min',
  'courier_kill',
  'first_blood',
];
function buildTeamScenario(
  scenario: any,
  isRadiant: boolean,
  match: ParsedMatch,
) {
  return [
    {
      scenario,
      is_radiant: isRadiant,
      region: match.region,
      wins: match.radiant_win === isRadiant,
    },
  ];
}
export const scenarioChecks = {
  scenarios: [
    function itemTimings(match: ParsedMatch) {
      const rows: any[] = [];
      match.players.forEach((player) => {
        if (player.purchase_log) {
          player.purchase_log.forEach((item) => {
            if (
              dotaItems.indexOf(item.key) !== -1 &&
              item.time <= timings[timings.length - 1]
            ) {
              rows.push({
                hero_id: player.hero_id,
                item: item.key,
                time: timings.find((x) => x >= item.time),
                wins: playerWon(player, match),
              });
            }
          });
        }
      });
      return rows;
    },
    function laneRole(match: ParsedMatch) {
      // hero's lane role
      const rows: any[] = [];
      match.players.forEach((player) => {
        if (
          match.duration <= gameDurationBucket[gameDurationBucket.length - 1]
        ) {
          rows.push({
            hero_id: player.hero_id,
            lane_role: player.lane_role,
            time: gameDurationBucket.find((x) => x >= match.duration),
            wins: playerWon(player, match),
          });
        }
      });
      return rows;
    },
  ],
  team_scenarios: [
    function firstBlood(match: ParsedMatch) {
      const condition =
        match.objectives &&
        match.objectives.find((x) => x.type === 'CHAT_MESSAGE_FIRSTBLOOD');
      if (condition) {
        const isRadiant = condition.player_slot < 5;
        return buildTeamScenario('first_blood', isRadiant, match);
      }
      return [];
    },
    function courierKill(match: ParsedMatch) {
      // team killed enemy courier at least once before the 3 min mark
      const condition =
        match.objectives &&
        match.objectives.find(
          (x) => x.type === 'CHAT_MESSAGE_COURIER_LOST' && x.time < 180,
        );
      if (condition) {
        const isRadiant = condition.team === 3;
        return buildTeamScenario('courier_kill', isRadiant, match);
      }
      return [];
    },
    function chat(match: ParsedMatch) {
      // negative/positive words in chat before minute 1
      const rows = [];
      let radiantNegative = false;
      let direNegative = false;
      let radiantPositive = false;
      let direPositive = false;
      if (match.chat) {
        for (let i = 0; i < match.chat.length; i += 1) {
          const c = match.chat[i];
          if (c.time >= 60) {
            break;
          }
          if (
            negativeWords.some((word) =>
              RegExp(`\\b${word}\\b`, 'i').test(c.key),
            )
          ) {
            if (c.player_slot < 128) {
              radiantNegative = true;
            } else {
              direNegative = true;
            }
          }
          if (
            positiveWords.some((word) =>
              RegExp(`\\b${word}\\b`, 'i').test(c.key),
            )
          ) {
            if (c.player_slot < 128) {
              radiantPositive = true;
            } else {
              direPositive = true;
            }
          }
        }
        if (radiantNegative) {
          rows.push(buildTeamScenario('neg_chat_1min', true, match)[0]);
        }
        if (direNegative) {
          rows.push(buildTeamScenario('neg_chat_1min', false, match)[0]);
        }
        if (radiantPositive) {
          rows.push(buildTeamScenario('pos_chat_1min', true, match)[0]);
        }
        if (direPositive) {
          rows.push(buildTeamScenario('pos_chat_1min', false, match)[0]);
        }
      }
      return rows;
    },
  ],
};
// list of match object properties that are required for scenario checks.
const matchProperties: (keyof ParsedMatch)[] = [
  'players',
  'objectives',
  'duration',
  'chat',
  'radiant_win',
];
export const metadata = {
  itemCost,
  timings,
  gameDurationBucket,
  teamScenariosQueryParams,
};
/**
 * Make sure the match object has all required properties.
 * */
export function validateMatchProperties(match: ParsedMatch) {
  return matchProperties.every(
    (property) => match[property] !== undefined && match[property] !== null,
  );
}
