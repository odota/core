window.pad = function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
};
//adjust each x/y coordinate by the provided scale factor
//if max is provided, use that, otherwise, use local max of data
//shift all values by the provided shift
window.adjustHeatmapData = function adjustHeatmapData(posData, scalef, max, shift) {
    posData.forEach(function(d) {
        for (var key in d) {
            d[key] = scaleAndExtrema(d[key], scalef, max, shift);
        }
    });

    function scaleAndExtrema(points, scalef, max, shift) {
        points.forEach(function(p) {
            p.x *= scalef;
            p.y *= scalef;
            p.value += (shift || 0);
        });
        var vals = points.map(function(p) {
            return p.value;
        });
        var localMax = Math.max.apply(null, vals);
        return {
            min: 0,
            max: max || localMax,
            data: points,
        };
    }
};
window.format = function format(input) {
    input = Number(input);
    if (input === 0 || isNaN(input)) {
        return "-";
    }
    return (Math.abs(input) < 1000 ? ~~(input) : window.numeral(input).format('0.0a'));
};
window.formatSeconds = function formatSeconds(input) {
    var absTime = Math.abs(input);
    var minutes = ~~(absTime / 60);
    var seconds = window.pad(~~(absTime % 60), 2);
    var time = ((input < 0) ? "-" : "");
    time += minutes + ":" + seconds;
    return time;
};