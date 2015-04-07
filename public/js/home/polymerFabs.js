$(document).ready(function(){
  $(".fab").hide();
	document.querySelector("#up").addEventListener('click', function(e) {
		window.location.href = e.target.getAttribute('link');
  	})
  	document.querySelector("#tldr").addEventListener('click', function(e) {
    	window.location.href = e.target.getAttribute('link');
  	})
  	document.querySelector("#features").addEventListener('click', function(e) {
    	window.location.href = e.target.getAttribute('link');
  	})
  	document.querySelector("#cheese").addEventListener('click', function(e) {
    	window.location.href = e.target.getAttribute('link');
  	})
 });