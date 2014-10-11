exports.AStringMutator = AStringMutator;

var assert = require('assert');
var ComponentList = require('./componentlist').ComponentList;
var OpComponent = require('./opcomponent').OpComponent;


/*
 * Attributed string mutator. Can iterate or mutate supplied string.
 * String should be a single line. No multi-line mutations are allowed, except
 * appending a newline character at the end.
 * 
 * @param { a, s } astr
 * @param {AttributePool} pool
 */
function AStringMutator(astr, pool) {
  this._astr = astr;
  this._pool = pool;
  this._iter = ComponentList.unpack(astr, pool).getIterator();

  this._len = astr.s.length;

  this._n = 0;
  this._iteratedOps = new ComponentList();
  this._lastOp = new OpComponent();
  this._mutated = false;
  this._hasNewline = astr.s.indexOf('\n') >= 0;
}

AStringMutator.prototype._take = function(N) {
  var ops = new ComponentList();
  var c = this._lastOp;

  while(N > 0) {
    if(c.opcode) {
      assert(c.opcode == OpComponent.INSERT && (c.lines == 0 || (c.lines == 1 && !this._iter.hasNext())), 'cannot iterate over non-astring');

      if(c.chars <= N) {
        // take all and continue
        ops.push(c.clone());
        c.skip();
        N -= c.chars;
      } else {
        // take part
        ops.push(c.clone().trimRight(N, 0));
        c.trimLeft(N, 0);
        N = 0;
      }
    } else {
      assert(this._iter.hasNext(), 'unexpected end of astring');
      this._iter.next().copyTo(c);
    }
  }

  return ops;
};

AStringMutator.prototype._validateInsert = function(opc) {
  assert(opc.opcode == OpComponent.INSERT, 'bad opcode for insertion: ' + opc.opcode);
  if(opc.lines > 0) {
    assert(opc.lines == 1 && this.remaining() == 0, 
      'single newline is accepted only at the end of the string');
    assert(this._hasNewline == false, 'astring already have newline');

    this._hasNewline = true;
  }
};

AStringMutator.prototype.position = function() {
  return this._n;
};

AStringMutator.prototype.skip = function(N) {
  this.take(N); // drop the result
  return this;
};

/*
 * Take N chars from a string and return components list
 */
AStringMutator.prototype.take = function(N) {
  var ops = this._take(N);
  this._n += N;
  // save a copy to internal collection in case of string mutation
  ops.map(function(c) {
    this._iteratedOps.push(c.clone());
  }, this);
  return ops;
};

/*
 * Remove N chars from a string and return removed components list
 */
AStringMutator.prototype.remove = function(N) {
  this._mutated = true;
  this._len -= N;
  // take but do not advance
  var removed = this._take(N);
  if(removed.length() > 0 && removed.elem(removed.length() - 1).lines > 0) {
    // if we've just removed newline, clear the flag
    this._hasNewline = false;
  }
  return removed;
};

/*
 * Insert a single component into current string position
 */
AStringMutator.prototype.insert = function(opc) {
  this._validateInsert(opc);
  this._mutated = true;
  this._iteratedOps.push(opc.clone());
  this._len += opc.chars;
  this._n += opc.chars;
  return this;
};

/*
 * Does what insert does, but does not updates current iterator position
 */
AStringMutator.prototype.inject = function(opc) {
  this._validateInsert(opc);
  this._mutated = true;
  this._iter.pushBack(opc.clone());
  this._len += opc.chars;
  return this;
};

// TODO: naming is probably confusing either here, or 
// in AttributeList.format(). Same name but different meaning
AStringMutator.prototype.applyFormat = function(opc) {
  var valid = opc.lines == 0 || (opc.lines == 1 && opc.chars == this.remaining());
  assert(opc.opcode == OpComponent.KEEP && valid, 'bad format component');

  // here we must cover all components with new format,
  // just iterate over everything and apply
  var n = 0;
  this.remove(opc.chars).map(function(c) {
    n += c.chars;
    this.insert(
      c.composeAttributes(opc.attribs)
      );
  }, this);
  assert.equal(n, opc.chars, 'actual chars does not match operation');
  return this;
};

AStringMutator.prototype.takeRemaining = function() {
  return this.take(this.remaining());
};

AStringMutator.prototype.position = function() {
  return this._n;
};

AStringMutator.prototype.remaining = function() {
  return this._len - this._n;
};

AStringMutator.prototype.length = function() {
  return this._len;
};

AStringMutator.prototype.isMutated = function() {
  return this._mutated;
};

AStringMutator.prototype.finish = function() {
  if(this._mutated) {
    // append the rest
    this.takeRemaining();
    // repack all ops
    return this._iteratedOps.pack(this._pool, true);
  }
  return this._astr;
};
