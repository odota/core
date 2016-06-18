var benchmarks = {
    "gold_per_min": function(m, p)
    {
        return p.gold_per_min;
    },
    "xp_per_min": function(m, p)
    {
        return p.xp_per_min;
    },
    "kills_per_min": function(m, p)
    {
        return (p.kills / m.duration * 60);
    },
    "last_hits_per_min": function(m, p)
    {
        return (p.last_hits / m.duration * 60);
    },
    "hero_damage_per_min": function(m, p)
    {
        return (p.hero_damage / m.duration * 60);
    },
    "hero_healing_per_min": function(m, p)
    {
        return (p.hero_healing / m.duration * 60);
    },
    "tower_damage_per_min": function(m, p)
    {
        return (p.tower_damage / m.duration * 60);
    },
};
module.exports = benchmarks;
