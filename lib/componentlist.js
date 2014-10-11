exports.ComponentList = ComponentList;

var assert = require('assert');
var OpComponent = require('./opcomponent').OpComponent;
var AttributeList = require('./attributelist').AttributeList;
var util = require('./csutil');


function ComponentList(list) {
  this._list = list || [];
  this._dirty = true;
}

var opsRegex = /((?:[\*\^][0-9a-z]+)*)(?:\|([0-9a-z]+))?([-+=])([0-9a-z]+)|\?|/g;
/*
 * Unpacks changeset object into components
 * @param obj - { a: String, s: String }
 * @param pool - pool for attributes
 */
ComponentList.unpack = function(obj, pool) {
  var m;
  var list = new ComponentList();
  var n = 0;

  opsRegex.lastIndex = 0;
  while((m = opsRegex.exec(obj.a)) && !!m[0]) {
    var chars = util.parseInt36(m[4]);
    var opcode = m[3];
    // for efficiency, since we already have matched and splitted into parts
    // component, we do not have OpComponent.unpack() method, instead
    // build it directly via constructor
    list.push(
      new OpComponent(
        opcode,
        chars,
        util.parseInt36(m[2] || 0), 
        AttributeList.unpack(m[1], pool),
        opcode != OpComponent.KEEP ? obj.s.substr(n, chars) : ''
        ));

    if(opcode != OpComponent.KEEP) {
      n += chars;
    }
  }
  list._dirty = false; // we've just unpacked changeset, it's in a good sorted state
  return list;
}

// inheriting from Array.prototype with Object.create() is very
// expensive in JS, so we just mirror few useful functions
ComponentList.prototype.push = function(op) {
  if(op.chars > 0) {
    this._list.push(op);
    this._dirty = true;
  }
  return this;
};

ComponentList.prototype.concat = function(otherList) {
  this._list = this._list.concat(otherList._list);
  this._dirty = true;
  return this;
};

ComponentList.prototype.map = function(func, optContext) {
  return new ComponentList(this._list.map(func, optContext));
};

ComponentList.prototype.reduce = function(callback, initValue) {
  return this._list.reduce(callback, initValue);
};

ComponentList.prototype.some = function(callback, optContext) {
  return this._list.some(callback, optContext);
};

ComponentList.prototype.reverse = function() {
  this._list.reverse();
  this._dirty = true;
  return this;
};

ComponentList.prototype.elem = function(i) {
  return this._list[i];
};

ComponentList.prototype.length = function() {
  return this._list.length;
};

ComponentList.prototype.getIterator = function() {
  var i = 0;
  var list = this._list;
  var backlist = [];
  return {
    next: function() {
      return backlist.pop() || list[i++];
    },

    hasNext: function() {
      return i < (list.length + backlist.length);
    },

    pushBack: function(c) {
      backlist.push(c);
    }
  };
};

ComponentList.prototype.addKeep = function(N, L, alist) {
  this.push(new OpComponent(OpComponent.KEEP, N, L, alist));
  return this;
};

ComponentList.prototype.addInsert = function(N, L, alist, charBank) {
  this.push(new OpComponent(OpComponent.INSERT, N, L, alist, charBank));
  return this;
};

ComponentList.prototype.addRemove = function(N, L, alist, charBank) {
  this.push(new OpComponent(OpComponent.REMOVE, N, L, alist, charBank));
  return this;
};

ComponentList.prototype.invert = function() {
  for(var i = 0; i < this._list.length; i++) {
    this._list[i].invert();
  }
  this._dirty = true;
  return this;
};

/*
 * Reorders components to keep removals before insertions. Makes sense
 * in tie operations to keep result consistent across clients.
 */
ComponentList.prototype.reorder = function() {
  if(!this._dirty) {
    return;
  }

  var res = [];
  var lists = {};
  lists[OpComponent.INSERT] = [];
  lists[OpComponent.REMOVE] = [];
  lists[OpComponent.KEEP] = [];

  var lastOpcode = '';
  for(var i = 0; i < this._list.length; i++) {
    var op = this._list[i];
    if(op.opcode == OpComponent.KEEP  && lastOpcode != OpComponent.KEEP) {
      res = res.concat(lists[OpComponent.REMOVE], lists[OpComponent.INSERT]);
      lists[OpComponent.REMOVE].length = 0;
      lists[OpComponent.INSERT].length = 0;
    } else if(op.opcode != OpComponent.KEEP && lastOpcode == OpComponent.KEEP) {
      res = res.concat(lists[OpComponent.KEEP]);
      lists[OpComponent.KEEP].length = 0;
    }
    lists[op.opcode].push(op);
    lastOpcode = op.opcode;
  }
  this._list = res.concat(lists[OpComponent.REMOVE], lists[OpComponent.INSERT], lists[OpComponent.KEEP]);
  this._dirty = false;
  return this;
};

/*
 * Packs components list into compact form that can be sent over the wire
 * or stored in the database. Performs smart packing, specifically:
 * - reorders components to keep removals before insertions
 * - merges mergeable components into one
 * - drops final "pure" keeps (that don't do formatting)
 * @param? optCompact - true if we need to omit dLen and pool from result object
 *            (for packing AStrings into document)
 * @returns {Object(a, s, dLen, pool)} to use by Changeset class
 */
ComponentList.prototype.pack = function(optPool, optCompact) {
  optPool = optPool || [];

  var res = { a: '', s: '', dLen: 0, pool: optPool };
  var buf = { a: '', s: '', dLen: 0, last: new OpComponent(), inner: new OpComponent() };

  function push(res, packed, clear) {
    res.a += packed.a;
    res.s += packed.s;
    res.dLen += packed.dLen;
    if(clear) {
      packed.a = '';
      packed.s = '';
      packed.dLen = 0;
    }
  }

  function flush(finalize) {
    if(buf.last.opcode) {
      if(finalize && buf.last.opcode == OpComponent.KEEP && buf.last.attribs.isEmpty()) {
        // final keep, drop
      } else {
        push(res, buf.last.pack(optPool));
        buf.last.clear();
        if(buf.inner.opcode) {
          push(res, buf.inner.pack(optPool));
          buf.inner.clear();
        }
      }
    }
  }

  function append(op) {
    if(buf.last.opcode == op.opcode && buf.last.attribs.equals(op.attribs)) {
      if(op.lines > 0) {
        // last and inner are all mergable into multi-line op
        buf.last.append(buf.inner).append(op);
        buf.inner.clear();
      } else if (buf.last.lines == 0) {
        // last and op are both in-line
        buf.last.append(op);
      } else {
        buf.inner.append(op);
      }
    } else {
      flush();
      op.copyTo(buf.last);
    }
  }

  this.reorder();
  for(var i = 0, l = this._list.length; i < l; i++) {
    append(this._list[i]);
  }
  flush(true);

  if(optCompact) {
    return {
      a: res.a,
      s: res.s
    }
  } else {
    return res;
  }
};