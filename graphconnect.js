var graphconnect = function (container, objectlist) {
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

    container.appendChild(toolsbox);
    container.appendChild(dragboard);
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

    function printstate() {
        var list = document.getElementsByClassName('object');
        for (var i of list) {
            var out = i.data.name + ' ';
            for (var j in i.data.pins) {
                if (i.data.pins[j].connector) {
                    out += j + ':' + (i.data.pins[j].connector === undefined ? '-' : 'Y');
                    if (i.data.pins[j].connector.pin_i && i.data.pins[j].connector.pin_o) {
                        var otherside;
                        if (i.data.pins[j].connector.pin_i.object === i) {
                            otherside = i.data.pins[j].connector.pin_o.object;
                        } else {
                            otherside = i.data.pins[j].connector.pin_i.object;
                        }
                        out += '(' + otherside.data.name + ')';
                    }
                    out += ' ';
                } else {
                    out += j + ':- ';
                }
            }
            console.log(out);
        }
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
        var newobj = document.createElement('div');
        newobj.data = JSON.parse(JSON.stringify(element.data));
        newobj.data.make = element.data.make;
        newobj.className = "object";
        newobj.style.left = element.style.left;
        newobj.style.top = element.style.top;

        element.style.left = element.style.leftback;
        element.style.top = element.style.topback;

        dragboard.appendChild(newobj);
        newobj.style.left = parseInt(newobj.offsetLeft) - toolsbox.offsetWidth + 'px';

        var header = document.createElement('div');
        var close = document.createElement('div');
        header.className = 'header';
        close.className = 'close';
        header.innerHTML = newobj.data.name;
        header.appendChild(close);

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


        newobj.appendChild(clon);

        var n_input = 0;
        var n_output = 0;
        var c_input = 1;
        var c_output = 1;

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
        }

        for (i = 0; i < newobj.data.pins.length; i++) {
            newobj.data.pins[i].obj = document.createElement('div');
            newobj.data.pins[i].obj.className = 'connector';
            newobj.appendChild(newobj.data.pins[i].obj);

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

            newobj.data.pins[i].obj.pin = i;

            if (newobj.data.pins[i].type === 'o') {
                newobj.data.pins[i].fire = fireoutputpin;
            }
            newobj.data.pins[i].obj.onmousedown = mousedown;
        }

        newobj.data.code = new newobj.data.make(newobj, newobj.data);

        newobj.dragobject = new Draggable(newobj, {
            grid: 10,
            limit: dragboard,
            handle: header,
            onDrag: function (element, x, y, event) {
                for (var i of newobj.data.pins) {
                    alignline(i.connector);
                }
            },
            onDragEnd: function (element, x, y, event) {
                for (var i of newobj.data.pins) {
                    alignline(i.connector);
                }
            }
        });
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
    }

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