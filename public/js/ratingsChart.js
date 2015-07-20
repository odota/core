module.exports = function ratingsChart(ratings) {
    const times = ratings.map((r) => new Date(r.time));
    const solo = ratings.map((r) => r.soloCompetitiveRank);
    const party = ratings.map((r) => r.competitiveRank);
    c3.generate({
        bindto: '#ratings',
        data: {
            columns: [
          ['Solo'].concat(solo),
          ['Party'].concat(party)
          ],
            type: 'spline'
        },
        axis: {
            x: {
                label: 'Date',
                tick: {
                    format: function(x) {
                        return moment(times[x]).format('MMM DD YYYY');
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
};
