var benchmarks = {
    "gold_per_min": function(m, p)
    {
        return p.gold_per_min;
    },
    "kills_per_min": function(m, p)
    {
        return (p.kills / m.duration * 60);
    },
    "last_hits_per_min": function(m, p)
    {
        return (p.last_hits / m.duration * 60);
    },
    "kills": function(m, p)
    {
        return p.kills;
    },
    "last_hits": function(m, p)
    {
        return p.last_hits;
    }
};
module.exports = benchmarks;