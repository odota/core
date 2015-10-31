window.createCalHeatmap = function createCalHeatmap(data) {
    var start = new Date(Number(Object.keys(data)[0]) * 1000 || "2011-01-01");
    var range = moment().diff(moment(start), 'months')+2;
    console.log(start, range);
    //create cal-heatmap from start_time
    var cal = new CalHeatMap();
    cal.init({
        //start: new Date(moment().subtract(1, 'year')),
        start: start,
        itemSelector: "#cal-heatmap",
        //range: 13,
        range: range,
        domain: "month",
        subDomain: "day",
        data: data,
        verticalOrientation: true,
        label: {
            position: "left"
        },
        colLimit: 31,
        tooltip: true,
        legend: [1, 2, 3, 4],
        highlight: new Date(),
        itemName: ["match", "matches"],
        domainLabelFormat: function(date) {
		return moment(date).format("MMM YYYY"); // Use the moment library to format the Date
	},
        subDomainTextFormat: function(date, value) {
            return value;
        },
        cellSize: 18,
        domainGutter: 5,
        //previousSelector: "#prev",
        //nextSelector: "#next",
        legendHorizontalPosition: "right"
    });
}