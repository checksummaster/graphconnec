//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////

(function (root, factory) {
    if (typeof exports === 'object') {
      module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
      define([], factory);
    } else {
      root.Draggable = factory();
    }
}(this, function () {

  'use strict';

  var defaults = {

    // settings
    grid: 0,                // grid cell size for snapping to on drag
    filterTarget: null,     // disallow drag when target passes this test
    limit: {                // limit the drag bounds
      x: null,              // [minimum position, maximum position] || position
      y: null               // [minimum position, maximum position] || position
    },
    threshold: 0,           // threshold to move before drag begins (in px)

    // flags
    setCursor: false,       // change cursor to reflect draggable?
    setPosition: true,      // change draggable position to absolute?
    smoothDrag: true,       // snap to grid when dropped, but not during
    useGPU: true,           // move graphics calculation/composition to the GPU

    // event hooks
    onDrag: noop,           // function(element, X, Y, event)
    onDragStart: noop,      // function(element, X, Y, event)
    onDragEnd: noop         // function(element, X, Y, event)

  };

  var env = {

    // CSS vendor-prefixed transform property
    transform: (function(){

      var prefixes = ' -o- -ms- -moz- -webkit-'.split(' ');
      var style = document.body.style;

      for (var n = prefixes.length; n--;) {
        var property = prefixes[n] + 'transform';
        if (property in style) {
          return property;
        }
      }

    })()

  };

  var util = {

    assign: function () {

      var obj = arguments[0];
      var count = arguments.length;

      for ( var n = 1; n < count; n++ ) {
        var argument = arguments[n];
        for ( var key in argument ) {
          obj[key] = argument[key];
        }
      }

      return obj;

    },

    bind: function (fn, context) {
      return function() {
        fn.apply(context, arguments);
      }
    },

    on: function (element, e, fn) {
      if (e && fn) {
        util.addEvent (element, e, fn);
      } else if (e) {
        for (var ee in e) {
          util.addEvent (element, ee, e[ee]);
        }
      }
    },

    off: function (element, e, fn) {
      if (e && fn) {
        util.removeEvent (element, e, fn);
      } else if (e) {
        for (var ee in e) {
          util.removeEvent (element, ee, e[ee]);
        }
      }
    },

    // Example:
    //
    //     util.limit(x, limit.x)
    limit: function (n, limit) {
      // {Array} limit.x
      if (isArray(limit)) {
        limit = [+limit[0], +limit[1]];
        if (n < limit[0]) n = limit[0];
        else if (n > limit[1]) n = limit[1];
      // {Number} limit.x
      } else {
        n = +limit;
      }

      return n;
    },

    addEvent: ('attachEvent' in Element.prototype)
      ? function (element, e, fn) { element.attachEvent('on'+e, fn) }
      : function (element, e, fn) { element.addEventListener(e, fn, false) },

    removeEvent: ('attachEvent' in Element.prototype)
      ? function (element, e, fn) { element.detachEvent('on'+e, fn) }
      : function (element, e, fn) { element.removeEventListener(e, fn) }

  };

  /*
    usage:

    new Draggable (element, options)
      - or -
    new Draggable (element)
  */

  function Draggable (element, options) {

    var me = this,
      start = util.bind(me.start, me),
      drag = util.bind(me.drag, me),
      stop = util.bind(me.stop, me);

    // sanity check
    if (!isElement(element)) {
      throw new TypeError('Draggable expects argument 0 to be an Element');
    }

    options = util.assign({}, defaults, options);

    // set instance properties
    util.assign(me, {

      // DOM element
      element: element,
      handle: (options.handle && isElement(options.handle))
              ? options.handle
              : element,

      // DOM event handlers
      handlers: {
        start: {
          mousedown: start,
          touchstart: start
        },
        move: {
          mousemove: drag,
          mouseup: stop,
          touchmove: drag,
          touchend: stop
        }
      },

      // options
      options: options

    });

    // initialize
    me.initialize();

  }

  util.assign (Draggable.prototype, {

    // public

    setOption: function (property, value) {

      var me = this;

      me.options[property] = value;
      me.initialize();

      return me;

    },

    get: function() {

      var dragEvent = this.dragEvent;

      return {
        x: dragEvent.x,
        y: dragEvent.y
      };

    },

    set: function (x, y) {

      var me = this,
        dragEvent = me.dragEvent;

      dragEvent.original = {
        x: dragEvent.x,
        y: dragEvent.y
      };

      me.move(x, y);

      return me;

    },

    // internal

    dragEvent: {
      started: false,
      x: 0,
      y: 0
    },

    initialize: function() {

      var me = this,
        element = me.element,
        handle = me.handle,
        style = element.style,
        compStyle = getStyle(element),
        options = me.options,
        transform = env.transform,
        oldTransform;

      // cache element dimensions (for performance)

      var _dimensions = me._dimensions = {
        height: element.offsetHeight - 2,
        left: element.offsetLeft,
        top: element.offsetTop,
        width: element.offsetWidth - 2
      };

      // shift compositing over to the GPU if the browser supports it (for performance)

      if (options.useGPU && transform) {

        // concatenate to any existing transform
        // so we don't accidentally override it
        oldTransform = compStyle[transform];

        if (oldTransform === 'none') {
          oldTransform = '';
        }

        style[transform] = oldTransform + ' translate3d(0,0,0)';
      }

      // optional styling

      if (options.setPosition) {
        style.display = 'block';
        style.left = _dimensions.left + 'px';
        style.top = _dimensions.top + 'px';
        style.width = _dimensions.width + 'px';
        style.height = _dimensions.height + 'px';
        style.bottom = style.right = 'auto';
        style.margin = 0;
        style.position = 'absolute';
      }

      if (options.setCursor) {
        style.cursor = 'move';
      }

      // set limit
      me.setLimit(options.limit);

      // set position in model
      util.assign(me.dragEvent, {
        x: _dimensions.left,
        y: _dimensions.top
      });

      // attach mousedown event
      util.on(me.handle, me.handlers.start);

    },

    start: function (e) {

      var me = this;
      var cursor = me.getCursor(e);
      var element = me.element;

      // filter the target?
      if (!me.useTarget(e.target || e.srcElement)) {
        return;
      }

      // prevent browsers from visually dragging the element's outline
      if (e.preventDefault && !e.target.getAttribute('contenteditable')) {
        e.preventDefault();
      } else if (!e.target.getAttribute('contenteditable')) {
        e.returnValue = false; // IE10
      }

      // set a high z-index, just in case
      me.dragEvent.oldZindex = element.style.zIndex;
      element.style.zIndex = 10000;

      // set initial position
      me.setCursor(cursor);
      me.setPosition();
      me.setZoom();

      // add event listeners
      util.on(document, me.handlers.move);

    },

    drag: function (e) {

      var me = this,
        dragEvent = me.dragEvent,
        element = me.element,
        initialCursor = me._cursor,
        initialPosition = me._dimensions,
        options = me.options,
        zoom = initialPosition.zoom,
        cursor = me.getCursor(e),
        threshold = options.threshold,
        x = (cursor.x - initialCursor.x)/zoom + initialPosition.left,
        y = (cursor.y - initialCursor.y)/zoom + initialPosition.top;

      // check threshold
      if (!dragEvent.started && threshold &&
        (Math.abs(initialCursor.x - cursor.x) < threshold) &&
        (Math.abs(initialCursor.y - cursor.y) < threshold)
      ) {
        return;
      }

      // save original position?
      if (!dragEvent.original) {
        dragEvent.original = { x: x, y: y };
      }

      // trigger start event?
      if (!dragEvent.started) {
        options.onDragStart(element, x, y, e);
        dragEvent.started = true;
      }

      // move the element
      if (me.move(x, y)) {

        // trigger drag event
        options.onDrag(element, dragEvent.x, dragEvent.y, e);
      }

    },

    move: function (x, y) {

      var me = this,
        dragEvent = me.dragEvent,
        options = me.options,
        grid = options.grid,
        style = me.element.style,
        pos = me.limit(x, y, dragEvent.original.x, dragEvent.original.y);

      // snap to grid?
      if (!options.smoothDrag && grid) {
        pos = me.round (pos, grid);
      }

      // move it
      if (pos.x !== dragEvent.x || pos.y !== dragEvent.y) {

        dragEvent.x = pos.x;
        dragEvent.y = pos.y;
        style.left = pos.x + 'px';
        style.top = pos.y + 'px';

        return true;
      }

      return false;

    },

    stop: function (e) {

      var me = this,
        dragEvent = me.dragEvent,
        element = me.element,
        options = me.options,
        grid = options.grid,
        pos;

      // remove event listeners
      util.off(document, me.handlers.move);

      // resent element's z-index
      element.style.zIndex = dragEvent.oldZindex;

      // snap to grid?
      if (options.smoothDrag && grid) {
        pos = me.round({ x: dragEvent.x, y: dragEvent.y }, grid);
        me.move(pos.x, pos.y);
        util.assign(me.dragEvent, pos);
      }

      // trigger dragend event
      if (me.dragEvent.started) {
        options.onDragEnd(element, dragEvent.x, dragEvent.y, e);
      }

      // clear temp vars
      me.reset();

    },

    reset: function() {

      this.dragEvent.started = false;

    },

    round: function (pos) {

      var grid = this.options.grid;

      return {
        x: grid * Math.round(pos.x/grid),
        y: grid * Math.round(pos.y/grid)
      };

    },

    getCursor: function (e) {

      return {
        x: (e.targetTouches ? e.targetTouches[0] : e).clientX,
        y: (e.targetTouches ? e.targetTouches[0] : e).clientY
      };

    },

    setCursor: function (xy) {

      this._cursor = xy;

    },

    setLimit: function (limit) {

      var me = this,
        _true = function (x, y) {
          return { x:x, y:y };
        };

      // limit is a function
      if (isFunction(limit)) {

        me.limit = limit;

      }

      // limit is an element
      else if (isElement(limit)) {

        var draggableSize = me._dimensions,
          height = limit.scrollHeight - draggableSize.height,
          width = limit.scrollWidth - draggableSize.width;

        me.limit = function (x, y) {
          return {
            x: util.limit(x, [0, width]),
            y: util.limit(y, [0, height])
          }
        };

      }

      // limit is defined
      else if (limit) {

        var defined = {
          x: isDefined(limit.x),
          y: isDefined(limit.y)
        };
        var _x, _y;

        // {Undefined} limit.x, {Undefined} limit.y
        if (!defined.x && !defined.y) {

          me.limit = _true;

        } else {

          me.limit = function (x, y) {
            return {
              x: defined.x ? util.limit(x, limit.x) : x,
              y: defined.y ? util.limit(y, limit.y) : y
            };
          };

        }
      }

      // limit is `null` or `undefined`
      else {

        me.limit = _true;

      }

    },

    setPosition: function() {

      var me = this,
        element = me.element,
        style = element.style;

      util.assign(me._dimensions, {
        left: parse(style.left) || element.offsetLeft,
        top: parse(style.top) || element.offsetTop
      });

    },

    setZoom: function() {

      var me = this;
      var element = me.element;
      var zoom = 1;

      while (element = element.offsetParent) {

        var z = getStyle(element).zoom;

        if (z && z !== 'normal') {
          zoom = z;
          break;
        }

      }

      me._dimensions.zoom = zoom;

    },

    useTarget: function (element) {

      var filterTarget = this.options.filterTarget;

      if (filterTarget instanceof Function) {
        return filterTarget(element);
      }

      return true;

    },

    destroy: function () {

      util.off(this.handle, this.handlers.start);
      util.off(document, this.handlers.move);

    }

  });

  // helpers

  function parse (string) {
    return parseInt(string, 10);
  }

  function getStyle (element) {
    return 'currentStyle' in element ? element.currentStyle : getComputedStyle(element);
  }

  function isArray (thing) {
    return thing instanceof Array; // HTMLElement
  }

  function isDefined (thing) {
    return thing !== void 0 && thing !== null;
  }

  function isElement (thing) {
    return thing instanceof Element || typeof HTMLDocument !== 'undefined' && thing instanceof HTMLDocument;
  }

  function isFunction (thing) {
    return thing instanceof Function;
  }

  function noop (){};

  return Draggable;

}));
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////

// getElementById but for node module
function domGet(id, rootNode) {
  if (!id) return null;

  if (rootNode === undefined) {
      var o = document.getElementById(id);
      return o;

  } else {


      var nodes = [];
      nodes.push(rootNode);
      while (nodes && nodes.length > 0) {
          var children = [];
          for (var i = 0; i < nodes.length; i++) {
              var node = nodes[i];
              if (node && node['id'] !== undefined) {
                  if (node.id == id) {
                      return node;
                  }
              }

              var childNodes = node.childNodes;
              if (childNodes && childNodes.length > 0) {
                  for (var j = 0; j < childNodes.length; j++) {
                      children.push(childNodes[j]);
                  }
              }
          }
          nodes = children;
      }
      return null;
  }
}

//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////      

var graphconnect = function (container, objectlist) {

    function IDGenerator() {

        this.length = 8;
        this.timestamp = +new Date;
    
        var _getRandomInt = function( min, max ) {
           return Math.floor( Math.random() * ( max - min + 1 ) ) + min;
        }
    
        this.generate = function() {
            var ts = this.timestamp.toString();
            var parts = ts.split( "" ).reverse();
            var id = "";
    
            for( var i = 0; i < this.length; ++i ) {
               var index = _getRandomInt( 0, parts.length - 1 );
               id += parts[index];
            }
    
            return id;
        }
    
    
    }


    container.classList.add('graphconnect');
    function fireoutputpin(root, data, value) {
        if (this.connector) {
            if (this.connector.pin_i) {
                var othersidepin = this.connector.pin_i.object.data.pins[this.connector.pin_i.pin];
                if (othersidepin) {
                    if (othersidepin.fire) {
                        othersidepin.fire(this.connector.pin_i.object, this.connector.pin_i.object.data, value);
                    }
                }
            }
        }
    }

    var toolsbox = document.createElement('div');
    toolsbox.className = 'toolsbox';
    var dragboard = document.createElement('div');
    dragboard.className = 'dragboard';

    container.appendChild(dragboard);
    container.appendChild(toolsbox);
    
    dragboard.innerHTML = '<svg width="100%" height="100%" id="draftboard"></svg>';

    var draftboard = document.getElementById('draftboard');

    function deleteline(line) {
        if (line) {
            if (line.pin_o) {
                delete line.pin_o.object.data.pins[line.pin_o.pin].connector;
            }
            if (line.pin_i) {
                delete line.pin_i.object.data.pins[line.pin_i.pin].connector;
            }
            draftboard.removeChild(line);

        }
    }

    function alignline(line,start,end) {
        if (line) {

            var x1 = 0,y1 = 0,x2 = 0,y2 = 0;
            if (line.pin_o) {
                if (line.pin_o.object) {
                    x1 = line.pin_o.object.offsetLeft + line.pin_o.object.data.pins[line.pin_o.pin].obj.offsetLeft + line.pin_o.object.data.pins[line.pin_o.pin].obj.offsetWidth;
                    y1 = line.pin_o.object.offsetTop + line.pin_o.object.data.pins[line.pin_o.pin].obj.offsetTop + line.pin_o.object.data.pins[line.pin_o.pin].obj.offsetHeight /2;
                }
            }
            if (line.pin_i) {
                if (line.pin_i.object) {
                    x2 = line.pin_i.object.offsetLeft + line.pin_i.object.data.pins[line.pin_i.pin].obj.offsetLeft;
                    y2 = line.pin_i.object.offsetTop + line.pin_i.object.data.pins[line.pin_i.pin].obj.offsetTop +  line.pin_i.object.data.pins[line.pin_i.pin].obj.offsetHeight /2;

                }
            }

            if (start) {
                x1 = start.x;
                y1 = start.y;
            }
            if (end) {
                x2 = end.x;
                y2 = end.y;
            }


            power = 100;
            var midx = x1 + (x2-x1)/2;
            var midy = y1 + (y2-y1)/2;

            if (x1+power < x2) {
                line.setAttribute('d',`M ${x1} ${y1}
                Q ${midx} ${y1} ${midx} ${midy}
                T ${x2} ${y2}`);
            } else {

                line.setAttribute('d',`M ${x1} ${y1}
                C ${x1+power} ${y1} ${x2-power} ${y2} ${x2} ${y2}`);
            }


            line.setAttribute('fill','transparent');
            line.setAttribute('stroke','black');
        }
    }

    function dragline(targettype, line) {
        function move(e) {
            var x = e.clientX - (dragboard.offsetLeft + container.offsetLeft);
            var y = e.clientY - (dragboard.offsetTop + container.offsetTop);

            switch (targettype) {
                case 'i':
                    alignline(line,undefined,{x,y});
                    break;

                case 'o':
                    alignline(line,{x,y}, undefined);
                    break;
            }
        }
        document.onmousemove = function (e) {
            move(e);
        };

        document.onmouseup = function (e) {

            move(e);

            var target = document.elementFromPoint(e.clientX, e.clientY);
            var ok = false;
            if (target.parentElement.data) {

                var pins = target.parentElement.data.pins;
                if (pins) {
                    var pin = pins[target.pin];
                    if (pin) {
                        if (pin.type === targettype) {
                            if (target.parentElement.data.pins[target.pin].connector === undefined) {
                                target.parentElement.data.pins[target.pin].connector = line;
                                line[targettype === 'i' ? 'pin_i' : 'pin_o'] = {
                                    object: target.parentElement,
                                    pin: target.pin
                                };
                                ok = true;
                            }
                        }
                    }
                }
            }
            if (ok === false) {
                deleteline(line);
            } else {
                alignline(line);
            }
            document.onmouseup = null;
            document.onmousemove = null;

        };
    }

    this.save = function() {
        var data = {
            objs:[],
            lines:[]
        }
        var list = document.getElementsByClassName('object');
        for (var i of list) {

            var t = {
                name:i.data.name,                
                id:i.id,
                left:i.offsetLeft,
                top:i.offsetTop,
                width:i.offsetWidth,
                height:i.offsetHeight,                
            }

            if (i.data.save) {
                t.save = i.data.save(i,i.data);
            }
            
            data.objs.push(t);



        }
        var lines = draftboard.childNodes;
        for (var i of lines) {
            data.lines.push({
                id1:i.pin_i.object.id,
                pin1:i.pin_i.pin,
                id2:i.pin_o.object.id,
                pin2:i.pin_o.pin,
            });
        }
        return data;
    }

    this.printstate = function() {
        
        var out = "";
        var list = document.getElementsByClassName('object');
        for (var i of list) {
            out += i.data.name + ' ' +i.id + ' ';
            for (var j in i.data.pins) {
                if (i.data.pins[j].connector) {

                    if (i.data.pins[j].connector.pin_i && i.data.pins[j].connector.pin_o) {
                        var otherside;
                        if (i.data.pins[j].connector.pin_i.object === i) {
                            otherside = i.data.pins[j].connector.pin_o;
                        } else {
                            otherside = i.data.pins[j].connector.pin_i;
                        }
                        out += j + ':(' + otherside.object.data.name + ' ' + otherside.object.id + ',' + otherside.pin + ')';
                    } else {
                        out += j + ':n.c.';
                    }

                } else {
                    out += j + ':n.c.';
                }
                out += ' ';
            }
            out += '\n';

        }

        out += '\n';

        //var data = this.save();

        //out += JSON.stringify(data,null,2);
        //alert(out);
        console.log(out);




    }

    function getline(targettype, obj, subobject, e) {
        var line = obj.data.pins[subobject.pin].connector;

        if (!line) {
            line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        } else {
            delete(line['pin_' + targettype].object.data.pins[line['pin_' + targettype].pin].connector);
        }

        var x = e.clientX - (dragboard.offsetLeft + container.offsetLeft);
        var y = e.clientY - (dragboard.offsetTop + container.offsetTop);

        switch (targettype) {
            case 'o':
                obj.data.pins[subobject.pin].connector = line;
                line.pin_i = {
                    object: obj,
                    pin: subobject.pin
                };
                alignline(line,{x,y},undefined);
                break;

            case 'i':
                obj.data.pins[subobject.pin].connector = line;
                line.pin_o = {
                    object: obj,
                    pin: subobject.pin
                };
                alignline(line,undefined,{x,y});
                break;
        }
        draftboard.appendChild(line);

        dragline(targettype, line);

        return line;

    }

    var y = 0;

    function dragstart(element, x, y, event)
    {
        element.style.leftback = element.style.left;
        element.style.topback = element.style.top;
    }


    function dragend(element, x, y, event)
    {
        makeobj(element.style.left,element.style.top,element.data)
        element.style.left = element.style.leftback;
        element.style.top = element.style.topback;
    }

    function clonedata(data) {
        ret = JSON.parse(JSON.stringify(data));
        ret.make = data.make;
        ret.save = data.save;
        ret.load = data.load;
        ret.resize = data.resize;
        ret.move = data.move;
        return ret;
    }

    function makeobj( x, y, data, w, h , id)
    {
        var newobj = document.createElement('div');
        if (id === undefined) {
            var idg = new IDGenerator();
            id = idg.generate();
        }
        newobj.id = id;
        //newobj.data = Object.assign({}, data);
        newobj.data = clonedata(data)


        newobj.className = "object";
        newobj.style.left = x;
        newobj.style.top = y;

        dragboard.appendChild(newobj);
        newobj.style.left = parseInt(newobj.offsetLeft) - toolsbox.offsetWidth + 'px';

        var header = document.createElement('div');
        var close = document.createElement('div');
        header.className = 'header';
        close.className = 'close';
        header.innerHTML = newobj.data.name;
        header.appendChild(close);

        
        if (data.tooltip) {
          var tooltip = document.createElement('span');
          tooltip.className = 'tooltiptext'
          tooltip.innerText = data.tooltip;
          header.appendChild(tooltip);
          header.className = 'header tooltip'
        }

        close.onmousedown = function (e) {
            e = e || window.event;
            e.stopPropagation();
        };
        close.onmouseup = function (e) {
            e = e || window.event;
            e.stopPropagation();

            for (var i of this.parentNode.parentNode.data.pins) {
                deleteline(i.connector);
            }
            dragboard.removeChild(this.parentNode.parentNode);
        };

        newobj.innerHTML = '';
        newobj.appendChild(header);

        var temp = document.getElementById(newobj.data.template);
        var clon = temp.content.cloneNode(true);
        var divclone = document.createElement('div');
        divclone.appendChild(clon);
        newobj.appendChild(divclone);




        divclone.style.display = "block";
        divclone.style.position = "absolute";
        divclone.style.left = "0px";
        divclone.style.right = "0px";
        divclone.style.top = header.offsetHeight + 1 + "px";
        divclone.style.bottom = "0px";
        divclone.style.overflow = newobj.data.scroll?"auto":"hidden";

        newobj.style.width = w?w:data.width?data.width:"100px"; //clon.style.width // + e.clientX - startX + "px";
        newobj.style.height = h?h:data.height?data.height:"100px"; //clon.style.height // startHeight + e.clientY - startY + "px";



        
        var n_input = 0;
        var n_output = 0;
        

        for (i = 0; i < newobj.data.pins.length; i++) {
            if (newobj.data.pins[i].type === 'o')  {
                n_output++;
            } else {
                n_input++;
            }
        }

        function mousedown (e) {
            e = e || window.event;
            e.stopPropagation();
            var targtype = newobj.data.pins[this.pin].type === 'i' ? 'o' : 'i'; // Todo if more type of pin, we should edit it
            var line = getline(targtype, newobj, this, e);

            console.log(line.pin_i,line.pin_o);
        }

   

        for (i = 0; i < newobj.data.pins.length; i++) {
            newobj.data.pins[i].obj = document.createElement('div');
            newobj.data.pins[i].obj.className = 'connector';
            newobj.appendChild(newobj.data.pins[i].obj);
            newobj.data.pins[i].obj.pin = i;

            if (newobj.data.pins[i].tooltip) {
              var tdiv = document.createElement('div');
              var tooltip = document.createElement('span');
              tooltip.className = 'tooltiptext'
              tooltip.innerText = newobj.data.pins[i].tooltip;
              tdiv.appendChild(tooltip);
              newobj.data.pins[i].obj.appendChild(tdiv);
              tdiv.className = 'tooltip'
              tdiv.style.width = '10px'
              tdiv.style.height = newobj.data.pins[i].obj.offsetHeight + 'px'
              if (newobj.data.pins[i].type === 'i') {
                tdiv.style.left = newobj.data.pins[i].obj.offsetWidth + 'px'
              } else {
                tdiv.style.right = newobj.data.pins[i].obj.offsetWidth + 'px'
              }

            }

            if (newobj.data.pins[i].type === 'o') {
                newobj.data.pins[i].fire = fireoutputpin;
            }
            newobj.data.pins[i].obj.onmousedown = mousedown;
        }

        function pinsposition() {
            var c_input = 1;
            var c_output = 1;
            for (i = 0; i < newobj.data.pins.length; i++) {
                var w = newobj.offsetWidth;
                var w2 = newobj.data.pins[i].obj.offsetWidth;
                var h = newobj.offsetHeight;

                if (newobj.data.pins[i].type === 'o') {
                    newobj.data.pins[i].obj.style.top = h / (n_output + 1) * c_output + 'px';
                    c_output++;
                    newobj.data.pins[i].obj.style.left = w - 1 + 'px';
                } else {
                    newobj.data.pins[i].obj.style.top = h / (n_input + 1) * c_input + 'px';
                    c_input++;
                    newobj.data.pins[i].obj.style.left = -w2 - 1 + 'px';
                }

                
            }
            for (var j of newobj.data.pins) {
                alignline(j.connector);
            }
        }
        pinsposition();

        newobj.data.code = new newobj.data.make(newobj, newobj.data);

        newobj.dragobject = new Draggable(newobj, {
            grid: 10,
            limit: dragboard,
            handle: header,
            onDrag: function (element, x, y, event) {
                for (var i of newobj.data.pins) {
                    alignline(i.connector);
                }
                if (newobj.data.move) {
                  newobj.data.move(newobj,newobj.data);
                }
            },
            onDragEnd: function (element, x, y, event) {
                for (var i of newobj.data.pins) {
                    alignline(i.connector);
                }
                if (newobj.data.move) {
                  newobj.data.move(newobj,newobj.data);
                }
            }
        });


        function initDrag(e) {
            element = this.parentPopup;
            
        
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(
              document.defaultView.getComputedStyle(element).width,
              10
            );
            startHeight = parseInt(
              document.defaultView.getComputedStyle(element).height,
              10
            );
            document.documentElement.addEventListener("mousemove", doDrag, false);
            document.documentElement.addEventListener("mouseup", stopDrag, false);
          }
        
          function doDrag(e) {
            element.style.width = startWidth + e.clientX - startX + "px";
            element.style.height = startHeight + e.clientY - startY + "px";
            pinsposition();
            if (element.data.resize) {
              element.data.resize(element,element.data);
            }
          }
        
          function stopDrag() {
            document.documentElement.removeEventListener("mousemove", doDrag, false);
            document.documentElement.removeEventListener("mouseup", stopDrag, false);
            
          }

        var right = document.createElement("div");        
        right.style.cssText = "width: 5px;height: 100%;background: transparent;position: absolute;right: 0;bottom: 0;cursor: e-resize;"
        newobj.appendChild(right);
        right.addEventListener("mousedown", initDrag, false);
        right.parentPopup = newobj;

        var bottom = document.createElement("div");
        bottom.style.cssText = "width: 100%;height: 5px;background: transparent;position: absolute;right: 0;bottom: 0;cursor: n-resize;"
        newobj.appendChild(bottom);
        bottom.addEventListener("mousedown", initDrag, false);
        bottom.parentPopup = newobj;

        var both = document.createElement("div");
        both.style.cssText = "width: 5px;height: 5px;background: transparent;position: absolute;right: 0;bottom: 0;cursor: nw-resize;"
        newobj.appendChild(both);
        both.addEventListener("mousedown", initDrag, false);
        both.parentPopup = newobj;

        return newobj;

    }

    for (var o of objectlist) {
        var toolsboxitem = document.createElement('div');
        toolsboxitem.className = 'toolsboxitem';
        toolsboxitem.innerHTML = o.name;
        toolsboxitem.data = o;
        toolsboxitem.style.top = y + 'px';
        toolsbox.appendChild(toolsboxitem);
        y = toolsboxitem.offsetHeight + toolsboxitem.offsetTop;

        new Draggable(toolsboxitem, {
            onDragStart: dragstart,
            onDragEnd: dragend
        });

        if (o.tooltip) {
          var tooltip = document.createElement('span');
          tooltip.className = 'tooltiptext'
          tooltip.innerText = o.tooltip;
          toolsboxitem.appendChild(tooltip);
          toolsboxitem.className = 'toolsboxitem tooltip'
        }
    }

    var s = document.createElement('div');
    s.className = 'toolsboxseparator';
    s.innerHTML = "separator";
    s.data = o;
    s.style.top = y + 'px';
    toolsbox.appendChild(s);
    y = s.offsetHeight + s.offsetTop;


    [{
        name:"get",
        func:e=>{
            this.printstate()
        }
    },{
        name:"insert",
        func:e=>{
            makeobj('200px','200px',objectlist[0],'400px','400px','superid')
        }
    },{
        name:"save",
        func:e=>{
            localStorage.save = JSON.stringify(this.save());
        }
    },{
        name:"load",
        func:e=>{
            var d = JSON.parse(localStorage.save);
            draftboard.innerHTML = '';
            var list = document.getElementsByClassName('object');
            while (list[0]) {
                dragboard.removeChild(list[0]);
            }
            var objlist = {}
            for (var i of d.objs) {
                data = objectlist.filter(v=>v.name === i.name)[0]
                var o = makeobj(i.left + toolsbox.offsetWidth +'px',i.top+'px',data,i.width - 2  +'px',i.height - 2 + 'px',i.id)
                objlist[o.id] = o;

                if (o.data.load && i.save) {
                    o.data.load(o,o.data,i.save);
                }
            }

            for (var i of d.lines) {
                line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                line.pin_i = {
                    object:objlist[i.id1],
                    pin:i.pin1
                }
                line.pin_o = {
                    object:objlist[i.id2],
                    pin:i.pin2
                }

                objlist[i.id1].data.pins[i.pin1].connector = line;
                objlist[i.id2].data.pins[i.pin2].connector = line;


                draftboard.appendChild(line);
                alignline(line);

            }
        }
    },{
        name:"clear",
        func:e=>{
            draftboard.innerHTML = '';
            var list = document.getElementsByClassName('object');
            while (list[0]) {
                dragboard.removeChild(list[0]);
            }
        }
    }].map(v=>{
        var b = document.createElement("BUTTON");
        b.onclick=v.func;
        b.innerText = v.name;
        b.className = 'toolsboxbutton';
        
        b.style.top = y + 'px';
        b.style.position = 'absolute';
        toolsbox.appendChild(b);

        y = b.offsetHeight + b.offsetTop;
    })
    

    function resize() {
        var list = document.getElementsByClassName('object');
        for (var i of list) {
            i.dragobject.setOption('limit', dragboard);
        }
    }

    document.getElementsByTagName("BODY")[0].onresize = function () {
        resize();
    };

    setTimeout(resize, 10);
};