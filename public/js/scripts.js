
// $(document).ready(function(){
// 	Polymer('.fab', {
// 		clickEvent: function() {
			
// 		}
// 	});

// });

$(document).ready(function(){
	$('.fab').hover(
	function() {
		$('.fab-button').attr("icon", "expand-less");

		var e = $('<a href="#philosophy"></a>');
		e.wrapInner('<paper-fab mini class="appended-fab">');
		var el = $('<core-tooltip noarrow label="TL;DR" position="left">').wrapInner(e);
		var tldr = $('<div class="fab-buttons"></di>').append(el);

		var features = $(tldr.clone());
		var cheese = $(tldr.clone());
		var main = $('<div class="fab-buttons" id="fab-button-extension"></div>');

		style="color: blue;"
		
		$(tldr).find( "paper-fab" ).attr("id","tldr").attr("icon","filter-list").attr("style", "background-color:red;");
		$(features).find( "paper-fab" ).attr("id","features").attr("icon","star").attr("style", "background-color:green;");
		$(features).find("a").attr("href","#match_statistics");
		$(features).find("core-tooltip").attr("label","Features");
		$(cheese).find( "paper-fab" ).attr("id","cheese").attr("icon","redeem").attr("style", "background-color:#eea236;");
		$(cheese).find("a").attr("href","#cheeses");
		$(cheese).find("core-tooltip").attr("label","We need your help!");
		
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