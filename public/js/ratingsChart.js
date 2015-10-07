window.ratingsChart = function ratingsChart(ratings) {
    var times = ratings.map(function(r) {
        return new Date(r.time);
    });
    var solo = ratings.map(function(r) {
        return r.solo_competitive_rank;
    });
    var party = ratings.map(function(r) {
        return r.competitive_rank;
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
