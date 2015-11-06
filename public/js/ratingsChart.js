window.ratingsChart = function ratingsChart(ratings, indexBased) {
  var times = ratings.map(function(r) {
    return new Date(r.time);
  });
  var solo = ratings.map(function(r) {
    return r.solo_competitive_rank;
  });
  var party = ratings.map(function(r) {
    return r.competitive_rank;
  });
  console.log(times);
  if (indexBased) {
    c3.generate({
      bindto: "#ratings",
      data: {
        columns: [
            ['Solo'].concat(solo),
            ['Party'].concat(party)
            ],
        type: "spline"
      },
      line: {
        connectNull: true
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
  else {
    //somehow get the MMRs per day, and average them to concatenate to Solo and Party
    c3.generate({
      bindto: "#ratings",
      data: {
        x: 'date',
        columns: [
              ['date'].concat(times),
              ['Solo'].concat(solo),
              ['Party'].concat(party)
            ],
        type: "line"
      },
      line: {
        connectNull: true
      },
      axis: {
        x: {
          label: 'Date',
          type: 'timeseries',
          tick: {
            count: 10,
            format: function(x) {
              return moment(x).format("MMM DD YYYY");
            },
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
}
