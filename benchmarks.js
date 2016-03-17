var benchmarks = {
    "lh_per_ten": function(m, p)
    {
        return ~~(p.last_hits / m.duration * 60 / 10) * 10;
    },
    "gold_per_min": function(m, p)
    {
        return p.gold_per_min;
    }
};
module.exports = benchmarks;