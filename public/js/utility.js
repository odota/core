/**
* Created with dev.
* User: howardc93
* Date: 2014-10-06
* Time: 11:38 AM
* To change this template use Tools | Templates.
*/
function format(input){
    input = parseInt(input)
    return (input<1000 ? input : numeral(input).format('0.0a'))
}
function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function formatSeconds(input) {
    var absTime = Math.abs(input)
    var minutes = ~~ (absTime / 60)
    var seconds = pad(absTime % 60, 2)
    var time = ((input < 0) ? "-" : "")
    time += minutes + ":" + seconds
    return time
}

function momentTime(input) {
    return moment().startOf('day').seconds(input)
}
$( document ).ready(function() {
    $('.format').each(function(){
        $(this).text(format($(this).text()))
    })
    $('.format-seconds').each(function(){
        $(this).text(formatSeconds($(this).text()))
    })
})