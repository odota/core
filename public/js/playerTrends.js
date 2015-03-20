var $records = $(".records"),
    $matchups = $(".matchups"),
    $wards = $(".wards"),
    $charts = $(".charts"),
    $content = $("#content");
$("#the_stats").empty();
$content.append($records);

function makeDT() {
    if (! $.fn.dataTable.isDataTable( '#heroes' )) {
        playerTables();
    }
}

$("#charts").click(function() {
    $content.empty();
    $content.append($charts);
    generateHistograms(aggData);
    if ($("#cal-heatmap").children().length < 1) {
        generateActivity(aggData);
    }
})
$("#wards").click(function() {
    $content.empty();
    $content.append($wards);
    $(".activate").on('mouseover', function(){
      heatmap.setData(posData[0][$(this).attr('id')]);
      heatmap.repaint();
    })
})     
$("#records").click(function(){
  $content.empty();
  $content.append($records);
})

$("#matchups").click(function(){
  $content.empty();
  $content.append($matchups);
  makeDT();
  tooltips();
})