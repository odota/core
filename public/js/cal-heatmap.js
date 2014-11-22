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

/*
cal.init({
    start: new Date(w),
    range: 90,
    domain: "day",
    subDomain: "hour",
    label:
{
    position: "left"
},
    domainLabelFormat: "",
    verticalOrientation: true,
    colLimit: 24,
    data: data,
    cellSize:5,
    cellPadding:1,
    domainGutter:1
});
*/