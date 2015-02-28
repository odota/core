$(window).scroll(function() {
    if ($(this).scrollTop() > 300) {
        $('.navbar-fixed-top').addClass('opaque');
    } else {
        $('.navbar-fixed-top').removeClass('opaque');
    }
});

$(window).scroll( function(){

  //get scroll position
  var topWindow = $(window).scrollTop();
  //multipl by 1.5 so the arrow will become transparent half-way up the page
  var topWindow = topWindow * 1.5;
  
  //get height of window
  var windowHeight = $(window).height();
      
  //set position as percentage of how far the user has scrolled 
  var position = topWindow / windowHeight;
  //invert the percentage
  position = 1 - position;

  //define arrow opacity as based on how far up the page the user has scrolled
  //no scrolling = 1, half-way up the page = 0
  $('.arrow-wrap').css('opacity', position);
  $('.fab').css('opacity', (1-position-.3));

  if ($('.fab').css('opacity') <= 0) {
    $('.fab').hide();
  }
  else {
    $('.fab').show();
  }
});
