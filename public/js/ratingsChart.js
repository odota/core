module.exports = function ratingsChart(ratings) {
    //sort ratings by time
    ratings = ratings.sort(function(a, b) {
        return a.time - b.time;
    });
    $("#solo").append(ratings[0] ? ratings[ratings.length - 1].soloCompetitiveRank : "N/A");
    $("#party").append(ratings[0] ? ratings[ratings.length - 1].competitiveRank : "N/A");
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
