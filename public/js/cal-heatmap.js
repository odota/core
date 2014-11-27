var cal = new CalHeatMap();
cal.init({
    start: new Date(moment().subtract(11, 'month')),
    range: 12,
    domain: "month",
    subDomain: "day",
    data: data,
    tooltip: true,
    legend: [1,2,3,4],
    highlight: new Date(),
    itemName: ["match", "matches"],
    subDomainTextFormat: function(date, value) {
        return value;
    },
    cellSize: 15,
    previousSelector: "#prev",
    nextSelector: "#next"
});