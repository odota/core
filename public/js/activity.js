function generateActivity(time_result) {
    //time_result is a hash of start_time : result
    //create a hash with start_time: 1 for standard
    //create one with day of week : pct for days
    //create one with hour : pct or hours
    var activity = {};
    var days = {};
    var hours = {};
    for (var key in time_result) {
        activity[key] = 1;
        var kd = moment(key, 'X').day()
        var kh = moment(key, 'X').hours();
        var d = moment().startOf('week').day(kd).format('X');
        var h = moment().startOf('day').hours(kh).format('X');
        if (!days[d]) {
            days[d] = {
                win: 0,
                games: 0
            }
        }
        days[d].games += 1;
        days[d].win += time_result[key] ? 1 : 0;
        if (!hours[h]) {
            hours[h] = {
                win: 0,
                games: 0
            }
        }
        hours[h].games += 1;
        hours[h].win += time_result[key] ? 1 : 0;
    }
    //transform the days/hours into percents
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
    //code below generates c3 charts
    var days = {};
    var hours = {};
    for (var key in time_result) {
        activity[key] = 1;
        var d = moment(key, 'X').day()
        var h = moment(key, 'X').hours();
        if (!days[d]) {
            days[d] = {
                win: 0,
                games: 0
            }
        }
        days[d].games += 1;
        days[d].win += time_result[key] ? 1 : 0;
        if (!hours[h]) {
            hours[h] = {
                win: 0,
                games: 0
            }
        }
        hours[h].games += 1;
        hours[h].win += time_result[key] ? 1 : 0;
    }
    var bar_days = ["Matches"];
    for (var key in days) {
        bar_days.push(days[key].games);
    }
    console.log(days);
    c3.generate({
        bindto: "#chart-days",
        data: {
            columns: [bar_days],
            type: 'bar',
            color: function(color, d) {
                if (d.index !== undefined) {
                    return days[d.index].win / days[d.index].games < 0.5 ? "#d9534f" : "#5cb85c"
                }
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
        }
    });
    var bar_hours = ["Matches"];
    for (var key in hours) {
        bar_hours.push(hours[key].games);
    }
    var hour_cats = [];
    for (var i = 0; i < 24; i++) {
        hour_cats.push(i);
    }
    c3.generate({
        bindto: "#chart-hours",
        data: {
            columns: [bar_hours],
            type: 'bar',
            color: function(color, d) {
                if (d.index !== undefined) {
                    return hours[d.index].win / hours[d.index].games < 0.5 ? "#d9534f" : "#5cb85c"
                }
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
                categories: hour_cats
            }
        }
    });

    function makeLegend(buckets) {
        var count = Object.keys(activity).length / buckets;
        //return [count * 0.2, count * 0.4, count * 0.6, count * 0.8];
        //return [0.47, 0.49, 0.51, 0.53];
        return [0.5];
    }
}
