itemTimingConditions = [{   
    hero: 1,
    item: 'bfury',
    time: 10050
  },
  {
    hero: 1,
    item: 'power_treads',
    time: 10050
  },
  {
    hero: 88,
    item: 'arcane_boots',
    time: 10050
  },
  {
    hero: 88,
    item: 'tpscroll',
    time: 10050
  }
];

scenarioChecks = [
  
    function itemTimings(match) {
      const rows = [];
      itemTimingConditions.forEach((c) => {
        const player = match.players.find(h => h.hero_id === c.hero);
        if (player) {
          const item = player.purchase_log.find(i => i.key === c.item);
          if (item && item.time < c.time) {
            const won = (player.player_slot < 5 && match.radiant_win) || (player.player_slot > 4 && !match.radiant_win);
            rows.push({
              columns: {
                scenario: "Item Timing",
                hero: c.hero,
                item: c.item,
                time: c.time,
                patch: match.patch,
                game_mode: match.game_mode,
                region: match.region,
                lobby_type: match.lobby_type,
              },
              won,
              table: 'scenarios',
            });
          }
        }
      });
      return rows;
    },
    function firstBlood(match) {
      let isRadiant;
      let won;
      const condition = match.objectives.find(x => x.type === 'CHAT_MESSAGE_FIRSTBLOOD');
      if (condition) {
        isRadiant = condition.player_slot < 5;
      }
      won = match.radiant_win === isRadiant;
      if (condition) {
        return [{
          columns: {
            scenario: "First Blood",
            is_radiant: isRadiant,
            patch: match.patch,
            game_mode: match.game_mode,
            lobby_type: match.lobby_type,
            region: match.region
          },
          won,
          table: 'team_scenarios',
        }]}
      return []
    },
    function courierKill(match) {
      let isRadiant;
      let won;
      const condition = match.objectives.find(x => x.type === 'CHAT_MESSAGE_COURIER_LOST' && x.time < 180000);
      if (condition) {
        isRadiant = condition.team === 3;
      }
      won = match.radiant_win === isRadiant;
      if (condition) {
        return [{
          columns: {
            scenario: "Courier Kill before 3min",
            is_radiant: isRadiant,
            patch: match.patch,
            game_mode: match.game_mode,
            lobby_type: match.lobby_type,
            region: match.region
          },
          won,
          table: 'team_scenarios',
        }]}
      return []
    },
  ];


module.exports.scenarioChecks = scenarioChecks;