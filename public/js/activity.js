function generateActivity(time_result) {
    //time_result is a hash of start_time : result
    //create a hash with start_time: 1 for standard
    //create one with day of week : pct for days
    //create one with hour : pct or hours
    var activity = {};
    var days = {};
    var hours = {};
    //prefill the hashes with the number of days/hours
    for (var i = 0; i < 7; i++) {
        days[i] = {
            win: 0,
            games: 0
        };
    }
    for (var i = 0; i < 24; i++) {
        hours[i] = {
            win: 0,
            games: 0
        };
    }
    for (var key in time_result) {
        activity[key] = 1;
        var d = moment(key, 'X').day()
        var h = moment(key, 'X').hours();
        days[d].games += 1;
        days[d].win += time_result[key] ? 1 : 0;
        hours[h].games += 1;
        hours[h].win += time_result[key] ? 1 : 0;
    }
    //transform the days/hours into percents
    /*
    var days_pct = {};
    var hours_pct = {};
    var days_count = {};
    var hours_count = {};
    for (var key in days) {
        days_pct[key] = days[key].win / days[key].games;
        days_count[key] = days[key].games;
    }
    for (var key in hours) {
        hours_pct[key] = hours[key].win / hours[key].games;
        hours_count[key] = hours[key].games;
    }
    */
    var cal = new CalHeatMap();
    cal.init({
        start: new Date(moment().subtract(1, 'year')),
        itemSelector: "#cal-heatmap",
        range: 13,
        domain: "month",
        subDomain: "day",
        data: activity,
        verticalOrientation: true,
        label: {
            position: "left"
        },
        colLimit: 31,
        tooltip: true,
        legend: [1, 2, 3, 4],
        highlight: new Date(),
        itemName: ["match", "matches"],
        subDomainTextFormat: function(date, value) {
            return value;
        },
        cellSize: 13,
        domainGutter: 5,
        previousSelector: "#prev",
        nextSelector: "#next",
        legendHorizontalPosition: "right"
    });
    /*
    var calDays = new CalHeatMap();
    calDays.init({
        start: new Date(),
        itemSelector: "#cal-heatmap-days",
        weekStartOnMonday: false,
        range: 1,
        domain: "week",
        subDomain: "day",
        //data: days_count,
        data: days_pct,
        verticalOrientation: true,
        label: {
            position: "left"
        },
        //itemName: ["match", "matches"],
        itemName: ["percent", "percent"],
        domainLabelFormat: "",
        subDomainDateFormat: function(date) {
            return moment(date).format("dddd"); // Use the moment library to format the Date
        },
        colLimit: 7,
        tooltip: true,
        legend: makeLegend(7),
        legendColors: {
            min: "#d9534f",
            max: "#5cb85c"
        },
        subDomainTextFormat: function(date, value) {
            return value ? value.toFixed(2) : "0";
        },
        cellSize: 60,
        legendHorizontalPosition: "right"
    });
    var calHours = new CalHeatMap();
    calHours.init({
        start: new Date(),
        itemSelector: "#cal-heatmap-hours",
        weekStartOnMonday: false,
        range: 1,
        domain: "day",
        subDomain: "hour",
        //data: hours_count,
        data: hours_pct,
        verticalOrientation: true,
        label: {
            position: "left"
        },
        //itemName: ["match", "matches"],
        itemName: ["percent", "percent"],
        domainLabelFormat: "",
        subDomainDateFormat: function(date) {
            return moment(date).format("ha"); // Use the moment library to format the Date
        },
        colLimit: 24,
        tooltip: true,
        legend: makeLegend(24),
        legendColors: {
            min: "#d9534f",
            max: "#5cb85c"
        },
        subDomainTextFormat: function(date, value) {
            return value ? value.toFixed(2) : "0";
        },
        cellSize: 18,
        legendHorizontalPosition: "right"
    });
    */
    //code below generates c3 charts
    var bar_days = ["Matches"];
    for (var key in days) {
        bar_days.push(days[key].games);
    }
    console.log(days);
    console.log(hours);
    c3.generate({
        bindto: "#chart-days",
        data: {
            columns: [bar_days],
            type: 'bar',
            color: function(color, d) {
                return computeColor(color, d, days);
            }
        },
        bar: {
            width: {
                ratio: 0.9
            }
        },
        axis: {
            x: {
                type: "category",
                categories: moment.weekdays()
            }
        },
        tooltip: {
            format: {
                value: function(value, ratio, id, ind) {
                    return value + " (" + (days[ind] && days[ind].win ? days[ind].win / days[ind].games * 100 : 0).toFixed(2) + "%)";
                }
            }
        }
    });
    var bar_hours = ["Matches"];
    for (var key in hours) {
        bar_hours.push(hours[key].games);
    }
    c3.generate({
        bindto: "#chart-hours",
        data: {
            columns: [bar_hours],
            type: 'bar',
            color: function(color, d) {
                return computeColor(color, d, hours);
            }
        },
        bar: {
            width: {
                ratio: 0.9
            }
        },
        axis: {
            x: {
                type: "category",
                //pop off the first element and create array of formatted times (1am, 2am...)''
                categories: bar_hours.slice(1).map(function(e, i) {
                    return moment().startOf('day').hours(i).format('ha');
                })
            }
        },
        tooltip: {
            format: {
                value: function(value, ratio, id, ind) {
                    return value + " (" + (hours[ind] && hours[ind].win ? hours[ind].win / hours[ind].games * 100 : 0).toFixed(2) + "%)";
                }
            }
        }
    });

    function computeColor(color, d, source) {
        if (d.index !== undefined) {
            var pct = source[d.index] && source[d.index].win ? source[d.index].win / source[d.index].games : 0;
            //0 is red and 120 is green, scale by pct
            //we probably want to scale so 0.4- is 0 and 0.6+ is 1
            var min = 0.4;
            var max = 0.6;
            var range = (max - min);
            var clamp = Math.max(min, Math.min(pct, max));
            pct = (clamp - min) / range;
            var h = Math.floor(120 * pct);
            //can use standard saturation of 1
            var s = 1;
            //value/brightness can be 1
            var v = 1;
            var col = hsv2rgb(h, s, v);
            return col;
            //return pct < 0.5 ? "#d9534f" : "#5cb85c"
        }
        else {
            return color;
        }
    }

    function makeLegend(buckets) {
        var count = Object.keys(activity).length / buckets;
        //return [count * 0.2, count * 0.4, count * 0.6, count * 0.8];
        //return [0.47, 0.49, 0.51, 0.53];
        return [0.5];
    }

    function hsv2rgb(h, s, v) {
        // adapted from http://schinckel.net/2012/01/10/hsv-to-rgb-in-javascript/
        var rgb, i, data = [];
        if (s === 0) {
            rgb = [v, v, v];
        }
        else {
            h = h / 60;
            i = Math.floor(h);
            data = [v * (1 - s), v * (1 - s * (h - i)), v * (1 - s * (1 - (h - i)))];
            switch (i) {
                case 0:
                    rgb = [v, data[2], data[0]];
                    break;
                case 1:
                    rgb = [data[1], v, data[0]];
                    break;
                case 2:
                    rgb = [data[0], v, data[2]];
                    break;
                case 3:
                    rgb = [data[0], data[1], v];
                    break;
                case 4:
                    rgb = [data[2], data[0], v];
                    break;
                default:
                    rgb = [v, data[0], data[1]];
                    break;
            }
        }
        return '#' + rgb.map(function(x) {
            return ("0" + Math.round(x * 255).toString(16)).slice(-2);
        }).join('');
    };
}
