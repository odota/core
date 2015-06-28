module.exports = function ratingsChart(ratings) {
    $("#solo").append(ratings[0] ? ratings[0].soloCompetitiveRank : "N/A");
    $("#party").append(ratings[0] ? ratings[0].competitiveRank : "N/A");
    //sort ratings by time
    ratings.sort(function(a, b) {
        return a.time - b.time;
    });
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
                        return moment(times[x]).format("MMM YYYY");
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