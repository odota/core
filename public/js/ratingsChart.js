module.exports = function ratingsChart(ratings) {
    $("#solo").append(ratings[0] ? ratings[0].soloCompetitiveRank : "N/A");
    $("#party").append(ratings[0] ? ratings[0].competitiveRank : "N/A");
    var times = ratings.map(function(r) {
        return new Date(r.time);
    });
    var solo = ratings.map(function(r) {
        return r.soloCompetitiveRank;
    });
    var party = ratings.map(function(r) {
        return r.competitiveRank;
    });
    c3.generate({
        bindto: "#ratings",
        data: {
            x: 'x',
            columns: [
          ['x'].concat(times),
          ['Solo'].concat(solo),
          ['Party'].concat(party)
          ],
            type: "line"
        },
        axis: {
            x: {
                type: 'timeseries',
                label: 'Date',
                tick: {
                    format: '%Y-%m-%d',
                    count: 10
                }
            },
            y: {
                label: 'Rating'
            }
        }
    });
}