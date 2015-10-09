// resize detection with some slight changes to fit module system from:
// http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/

var attachEvent = document.attachEvent;
var isIE = navigator.userAgent.match(/Trident/);
var requestFrame = (function(){
  var raf = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame ||
      function(fn){ return window.setTimeout(fn, 20); };
  return function(fn){ return raf(fn); };
})();

var cancelFrame = (function() {
  var cancel = window.cancelAnimationFrame || window.mozCancelAnimationFrame || window.webkitCancelAnimationFrame ||
         window.clearTimeout;
  return function(id){ return cancel(id); };
})();

function resizeListener(e) {
  var win = e.target || e.srcElement;
  if (win.__resizeRAF__) cancelFrame(win.__resizeRAF__);
  win.__resizeRAF__ = requestFrame(function(){
    var trigger = win.__resizeTrigger__;
    trigger.__resizeListeners__.forEach(function(fn){
      fn.call(trigger, e);
    });
  });
}

function objectLoad(e) {
  this.contentDocument.defaultView.__resizeTrigger__ = this.__resizeElement__;
  this.contentDocument.defaultView.addEventListener('resize', resizeListener);
}

window.resize = {};

window.resize.addResizeListener = function(element, fn) {
  if (!element.__resizeListeners__) {
    element.__resizeListeners__ = [];
    if (attachEvent) {
      element.__resizeTrigger__ = element;
      element.attachEvent('onresize', resizeListener);
    }
    else {
      if (getComputedStyle(element).position == 'static') element.style.position = 'relative';
      var obj = element.__resizeTrigger__ = document.createElement('object');
      obj.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; height: 100%; width: 100%; overflow: hidden; pointer-events: none; z-index: -1;');
      obj.__resizeElement__ = element;
      obj.onload = objectLoad;
      obj.type = 'text/html';
      if (isIE) element.appendChild(obj);
      obj.data = 'about:blank';
      if (!isIE) element.appendChild(obj);
    }
  }
  element.__resizeListeners__.push(fn);
};

window.resize.removeResizeListener = function(element, fn) {
  element.__resizeListeners__.splice(element.__resizeListeners__.indexOf(fn), 1);
  if (!element.__resizeListeners__.length) {
    if (attachEvent) element.detachEvent('onresize', resizeListener);
    else {
      element.__resizeTrigger__.contentDocument.defaultView.removeEventListener('resize', resizeListener);
      element.__resizeTrigger__ = !element.removeChild(element.__resizeTrigger__);
    }
  }
}

var heatmaps = {};
var activated = {};

function renderHeatmap(posData, renderer, elem, fetcher) {
  var data = fetcher(elem, posData);
  renderer.setData(data);
}

function elementResized(element, posData, event, eventElements, fetcher) {
  var width = element.outerWidth();
  var elementId = element.attr('id');
  if (heatmaps[elementId]) {
    $(heatmaps[elementId]._renderer.canvas).remove();
    delete heatmaps[elementId];
  }

  // scale points by width/127 units to fit to size of map
  // offset points by 25 units to increase visibility
  var adjustedData = adjustHeatmapData(posData, width/127, null, 25);

  heatmaps[elementId] = h337.create({
    container: element[0],
    radius: 15*(width/600)
  });

  if (event) {
    if (activated[elementId]) {
      renderHeatmap(adjustedData, heatmaps[elementId], activated[elementId], fetcher);
    }
    eventElements.off().on(event, function() {
      activated[elementId] = $(this);
      renderHeatmap(adjustedData, heatmaps[elementId], activated[elementId], fetcher);
    });
  }
  else {
    renderHeatmap(adjustedData, heatmaps[elementId], null, fetcher);
  }
}

/**
 * Adjust each x/y coordinate by the provided scale factor.
 * If max is provided, use that, otherwise, use local max of data.
 * Shift all values by the provided shift.
 * Returns the adjusted heatmap data.
 */
function adjustHeatmapData(posData, scalef, max, shift) {
    var adjusted = [];
    posData.forEach(function(d) {
        var newData = {};
        for (var key in d) {
            newData[key] = scaleAndExtrema(d[key], scalef, max, shift);
        }
        adjusted.push(newData);
    });
    return adjusted;

    function scaleAndExtrema(points, scalef, max, shift) {
        var newPoints = [];
        points.forEach(function(p) {
            newPoints.push({x: p.x * scalef,
                            y: p.y * scalef,
                            value: p.value + (shift || 0)});
        });
        var vals = points.map(function(p) {
            return p.value;
        });
        var localMax = Math.max.apply(null, vals);
        return {
            min: 0,
            max: max || localMax,
            data: newPoints,
        };
    }
};

/**
 * Initialize a heatmap that resizes as another underlying element does. It
 * takes the element to base the heatmap off, the position data, an optional
 * event when to rerender the heatmap, the elements to apply the event for and
 * finally a function that from the element can extract the necessary heatmap
 * data.
 */
window.resize.initResizableHeatmap = function(element, posData, event,
                                              eventElements, fetcher) {
  window.resize.addResizeListener(element[0], function() {
    elementResized(element, posData, event, eventElements, fetcher);
  });
  elementResized(element, posData, event, eventElements, fetcher);
}
