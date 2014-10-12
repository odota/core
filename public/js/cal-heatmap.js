var cal = new CalHeatMap();
var m = moment().subtract(11, 'month');
cal.init({
    start: new Date(m),
	range: 12,
	domain: "month",
	subDomain: "day",
    data: data,
    tooltip: true,
    legend: [1,2,3,4],
    itemName: ["match", "matches"],
    subDomainTextFormat: function(date, value) {
		return value;
	},
    cellSize: 15
});