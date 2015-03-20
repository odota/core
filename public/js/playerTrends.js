var $records = $(".records"),
    $matchups = $(".matchups"),
    $wards = $(".wards"),
    $charts = $(".charts"),
    $content = $("#content");
$("#the_stats").empty();
$content.append($records);

function makeHeroesDT() {
    if (! $.fn.dataTable.isDataTable( '#heroes' )) {
        $('#heroes').dataTable({
            "paging": true,
            "order": [
                [2, "desc"]
            ],
            "columnDefs": [{
                "targets": [0],
                "orderData": [1]
            }, {
                "targets": [1],
                visible: false
            }]
        });
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
  makeHeroesDT();
  tooltips();
})