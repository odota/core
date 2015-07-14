module.exports = function ratingsChart(ratings) {
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
            columns: [
          ['Solo'].concat(solo),
          ['Party'].concat(party)
          ],
            type: "spline"
        },
        axis: {
            x: {
                label: "Date",
                tick: {
                    format: function(x) {
                        return moment(times[x]).format("MMM DD YYYY");
                    }
                }
            },
            y: {
                label: 'Rating'
            }
        },
        zoom: {
            enabled: true
        }
    });
}
