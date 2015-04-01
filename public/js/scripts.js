
// $(document).ready(function(){
// 	Polymer('.fab', {
// 		clickEvent: function() {
			
// 		}
// 	});

// });

$(document).ready(function(){
	$('.fab').hover(
	function() {

		var e = $('<a href="#top"></a>');
		e.wrapInner('<paper-fab mini class="appended-fab">');
		var el = $('<core-tooltip noarrow label="Scroll up!" position="left">').wrapInner(e);
		var up = $('<div class="fab-buttons"></di>').append(el);

		var tldr = $(up.clone());
		var features = $(up.clone());
		var cheese = $(up.clone());
		var main = $('<div class="fab-buttons" id="fab-button-extension"></div>');

		style="color: blue;"
		
		$(up).find( "paper-fab" ).attr("id","up").attr("icon","expand-less").attr("style", "background-color:rgb(23, 190, 207);");
		$(tldr).find( "paper-fab" ).attr("id","tldr").attr("icon","filter-list").attr("style", "background-color:rgb(255, 127, 14);");
		$(tldr).find("a").attr("href","#philosophy");
		$(tldr).find("core-tooltip").attr("label","TL;DR");
		$(features).find( "paper-fab" ).attr("id","features").attr("icon","star").attr("style", "background-color:rgb(44, 160, 44);");
		$(features).find("a").attr("href","#match_statistics");
		$(features).find("core-tooltip").attr("label","Features");
		$(cheese).find( "paper-fab" ).attr("id","cheese").attr("icon","redeem").attr("style", "background-color:rgb(214, 39, 40);");
		$(cheese).find("a").attr("href","#cheeses");
		$(cheese).find("core-tooltip").attr("label","We need your help!");
		
		main.append($(up));
		main.append($(tldr));
		main.append($(features));
		main.append($(cheese));

		$(this).prepend($(main));
  	}, 
  	function() {
  	$('.fab-button').attr("icon", "dashboard");
    $( "#fab-button-extension" ).remove();
  })

});