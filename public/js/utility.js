var numeral = require('numeral');

function format(input) {
    input = Number(input);
    if (input === 0 || isNaN(input)) {
        return "-";
    }
    return (Math.abs(input) < 1000 ? ~~(input) : numeral(input).format('0.0a'));
}

function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function formatSeconds(input) {
    var absTime = Math.abs(input);
    var minutes = ~~(absTime / 60);
    var seconds = pad(absTime % 60, 2);
    var time = ((input < 0) ? "-" : "");
    time += minutes + ":" + seconds;
    return time;
}

module.exports = {
    format: format,
    pad: pad,
    formatSeconds: formatSeconds
};