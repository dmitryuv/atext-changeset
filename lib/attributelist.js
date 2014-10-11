exports.AttributeList = AttributeList;

var assert = require('assert');
var OpAttribute = require('./opattribute').OpAttribute;
var util = require('./csutil');



/*
 * Represents unpacked attributes list. Unlike most of other classes,
 * AttributeList is immutable collection because it gets copied a lot
 * together with OpComponent. The only mutable functions are
 * addFormatOp() and addRemoveOp(), so take care of them
 */
function AttributeList(list) {
  this._list = list || [];
}

var attRegex = /([\*\^])([0-9a-z]+)/g;

AttributeList.unpack = function(attString, pool) {
  var list = new AttributeList();
  if(attString == '' || attString == null) {
    return list;
  }

  attRegex.lastIndex = 0;
  var m;
  while(m = attRegex.exec(attString)) {
    var n = util.parseInt36(m[2]);
    var pair = pool[n];
    assert(pair, 'attribute not found in the pool: ' + n);

    list._list.push(new OpAttribute(m[1], pair[0], pair[1]));
  }
  return list;
};

AttributeList.prototype.addFormatOp = function(key, value) {
  this._list.push(OpAttribute.format(key, value));
  return this;
};

AttributeList.prototype.addRemoveOp = function(key, value) {
  this._list.push(OpAttribute.remove(key, value));
  return this;
};

AttributeList.prototype.equals = function(otherAtts) {
  var list1 = this._list;
  var list2 = otherAtts._list;
  if(list1.length == list2.length) {
    var l = list1.length;
    var m = 0;
    for(var i = 0; i < l; i++) {
      var oldM = m;
      for(var j = 0; j < l; j++) {
        if(list1[i].equals(list2[j])) {
          m++;
          break;
        }
      }
      // fast fail condition – if we haven't found a match after
      // full list scan, arrays can't be equal
      if(oldM == m) {
        break;
      }
    }
    // assuming that we can't hold 2 exact operations in one list,
    // we can compare number of matches with list size
    return m == l;
  } else {
    return false;
  }
};

AttributeList.prototype.clone = function() {
  return new AttributeList(this._list.slice());
};

AttributeList.prototype.isEmpty = function() {
  return this._list.length == 0;
};

/*
 * Merge adds otherAttributes to current attributes list
 * If new attribute have the same key and opcode but different value, 
 * it replaces current attribute
 */
AttributeList.prototype.merge = function(otherAtts) {
  // do not iterate over added ops
  var list = this._list.slice();
  var thisLen = list.length;
  var otherList = otherAtts._list;

  for(var i = 0; i < otherList.length; i++) {
    var newOp = otherList[i];
    var found = false;
    for(var j = 0; !found && j < thisLen; j++) {
      var op = list[j];
      if(op.opcode == newOp.opcode && op.key == newOp.key && op.value != newOp.value) {
        list[j] = newOp;
        found = true;
      } else if(op.opcode != newOp.opcode && op.key == newOp.key && op.value == newOp.value) {
        throw new Error('cannot merge mutual ops, use compose or format instead');
      }
    }
    if(!found) {
      list.push(newOp);
    }
  }
  return new AttributeList(list);
};

/*
 * Creates composition of two attribute lists.
 * isComposition defines if we peform composition, overwise
 * we're applying attributes. The difference is that on composition
 * we allow deletion of non-existing attribute, but on apply we throw error.
 *
 * Composition rules ([att1,op], [att2,op], isComposition) => ([att,op])
 * ([], [bold, *], true/false) => [bold, *]
 * ([], [bold, ^], true) => [bold, ^]
 * ([], [bold, ^], false) => throw
 * ([bold, *], []) => [bold, *]
 * ([bold, ^], []) => [bold, ^]
 * ([bold, *], [bold, *]) => throw
 * ([bold, *], [bold, ^]) => []
 * ([bold, ^], [bold, *]) => []
 */
AttributeList.prototype.compose = function(otherAtts, isComposition) {
  // We do not iterate over added members, assuming incoming attribute list
  // is valid. Anyway result will be fully validated in pack()
  var list = this._list.slice();
  var thisLen = list.length;
  for(var i = 0; i < otherAtts._list.length; i++) {
    var otherOp = otherAtts._list[i];
    var found = false;

    for(var j = 0; !found && j < thisLen; j++) {
      var thisOp = list[j];
      assert(!thisOp.equals(otherOp), 'trying to compose identical OpAttributes: ' + otherOp.key);

      if(thisOp.opcode != otherOp.opcode && thisOp.key == otherOp.key && thisOp.value == otherOp.value) {
        // remove opposite operation
        list.splice(j, 1);
        thisLen--;
        found = true;
      }
    }
    if(!found) {
      if(!isComposition) {
        assert.notEqual(otherOp.opcode, OpAttribute.REMOVE, 'trying to remove non-existing attribute');
      }
      list.push(otherOp);
    }
  }
  return new AttributeList(list);
};

/*
 * Update this attributes as if they were applied after otherAtt.
 * In other words, merges two sets of attributes. If we have
 * same keys applied, then take lexically-earlier value and remove
 * other one.
 * Unlike Compose() function, were we mostly insterested in summing up
 * attributes, in Transform() we must respect user's intention for
 * formatting. For ex. if user A sets attrib to (img,1) and user B sets
 * attrib to (img,2), we must remove old attrib in one case and ignore
 * set in another.
 * Some rules:
 * ([(img,1), *], [(img,2), *]) => ([(img,2), ^], [(img,1),*]) (1<2)
 * ([(img,1), ^], [(img,2), *]) => throws
 */
AttributeList.prototype.transform = function(otherAtts) {
  var res = [];
  for(var i = 0; i < this._list.length; i++) {
    var thisOp = this._list[i];
    var skip = false;
    for(var j = 0; !skip && j < otherAtts._list.length; j++) {
      var otherOp = otherAtts._list[j];

      if(thisOp.equals(otherOp)) {
        // someone already applied this operation, skip it
        skip = true;
      } else if(thisOp.key == otherOp.key && thisOp.opcode == otherOp.opcode && thisOp.opcode == OpAttribute.FORMAT) {
        // we have format operation for the same attribute key but different value
        if(thisOp.value < otherOp.value) {
          // we need to keep out value, for this, remove other one
          res.push(
            OpAttribute.remove(otherOp.key, otherOp.value),
            thisOp
            );
        }
        skip = true;
      } else if((thisOp.key == otherOp.key && thisOp.value == otherOp.value && thisOp.opcode != otherOp.opcode)
                || (thisOp.key == otherOp.key && thisOp.value != otherOp.value && thisOp.opcode == OpAttribute.REMOVE)) {
        // some sanity checks:
        // 1) can't do opposite operation on N
        // 2) can't remove key with different value
        throw new Error('invalid operation for transform');
      }
    }
    if(!skip) {
      res.push(thisOp);
    }
  }
  return new AttributeList(res);
};

/*
 * Apply format to attributes. The result will be an attribute operation
 * that can be applied to original attributes to perform desired formatting:
 * - formatting can be applied only on attrib strings and not attrib operations (only insertions '*')
 * - insertions over the same key+value pairs will be dropped
 * - insertions over the same keys will create replacement
 * - removals of non-existing Ns will be dropped
 */
AttributeList.prototype.format = function(formatAtts) {
  var res = [];
  for(var i = 0; i < formatAtts._list.length; i++) {
    var formatOp = formatAtts._list[i];
    var skip = false;
    for(var j = 0; !skip && j < this._list.length; j++) {
      var thisOp = this._list[j];

      if(formatOp.key == thisOp.key && formatOp.value == thisOp.value) {
        // for key & value match, keep removals and ignore insertions
        if(formatOp.opcode == OpAttribute.REMOVE) {
          res.push(formatOp);
        }
        skip = true;
      } else if(formatOp.key == thisOp.key && formatOp.value != thisOp.value && formatOp.opcode == OpAttribute.FORMAT) {
        // have same insert operation on the same key but different values
        // need to remove old value and only then push new one
        res.push(
          OpAttribute.remove(thisOp.key, thisOp.value),
          formatOp
          );
        skip = true;
      }
    }
    if(!skip && formatOp.opcode == OpAttribute.FORMAT) {
      // drop removals of non-existing key+value pair and keep only formats
      res.push(formatOp);
    }
  }
  return new AttributeList(res);
};

/*
 * Converts attribute insertion '*' to attribute deletion '^' and vice versa
 */
AttributeList.prototype.invert = function(exceptAtts) {
  var res = [];
  for(var i = 0; i < this._list.length; i++) {
    var op = this._list[i];
    var found = false;
    if(exceptAtts) {
      for(var j = 0; !found && j < exceptAtts._list.length; j++) {
        found = exceptAtts._list[j].equals(op);
      }
    }
    if(!found) {
      res.push(op.invert());
    } else {
      res.push(op);
    }
  }
  return new AttributeList(res);
};

/*
 * Packs attributes into new or existing pool
 * @param? optPool
 */
AttributeList.prototype.pack = function(optPool) {
  var pool = optPool || [];
  var nMap = {};
  var kMap = {};
  var mapped = [];

  for(var i = 0; i < this._list.length; i++) {
    var op = this._list[i];
    mapped.push({
      op: op,
      n: addToPool(pool, op)
    });
  }

  mapped.sort(function(a, b) {
      // move all deletions before insertions 
      // and lower numbers before higher numbers
      if(a.op.opcode == b.op.opcode) {
        return a.n > b.n;
      }
      return a.op.opcode < b.op.opcode;
    });

  var s = '';
  for(var i = 0; i < mapped.length; i++) {
    var item = mapped[i];

    // just in case, run a simple sanity check to make sure
    // we don't have same attrib number twice
    assert(nMap[item.n] === undefined, 'multiple operations on the same attrib key: ' + item.op.key);
    nMap[item.n] = true;

    // another sanity check to make sure we don't have 2 authors
    // or 2 images with different values
    var cnt = kMap[item.op.key] = (kMap[item.op.key] || 0) + (item.op.opcode == OpAttribute.FORMAT ? 1 : -1);
    assert(cnt > -2 && cnt < 2, 'multiple insertions or deletions of attribute with key: ' + item.op.key);

    s += item.op.opcode + util.toString36(item.n);
  }
  return s;
};

AttributeList.prototype.toString = function() {
  return this._list.toString();
};

function addToPool(pool, op) {
  for(var i = 0, l = pool.length; i < l; i++) {
    var pair = pool[i];
    if(pair[0] == op.key && pair[1] == op.value) {
      return i;
    }
  }
  pool.push([op.key, op.value]);
  return pool.length - 1;
};

