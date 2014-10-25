exports.ALinesMutator = ALinesMutator;

var assert = require('assert');
var AStringMutator = require('./astringmutator').AStringMutator;
var ComponentList = require('./componentlist').ComponentList;
var OpComponent = require('./opcomponent').OpComponent;
var Position = require('./position');


/*
 * This mutator works with lines of AStrings. It supports multiline ops and can 
 * efficiently patch multiline structure in place.
 */
function ALinesMutator(alines, pool) {
  this._lines = alines;
  this._pool = pool;
  this._l = 0;
  this._curLine = null;
}

ALinesMutator.prototype._skipLines = function(L) {
  // we do some checks here, so do first skip manually
  assert((this._l + L) <= this._lines.length, 'line position became greater than lines count');
  var n = 0;
  if(this._curLine) {
    n += this._curLine.remaining();
    this._nextLine();
    L--;
  }
  // unlike _takeLines(), we do not parse each next line, just take the length
  for(var x = this._l + L; this._l < x; this._l++) {
    n += this._lines[this._l].s.length;
  }
  return n;
};

ALinesMutator.prototype._takeLines = function(L) {
  assert((this._l + L) <= this._lines.length, 'line position became greater than lines count');

  var ops = new ComponentList();
  while(L-- > 0) {
    ops.concat(this._getCurLine().takeRemaining());
    this._nextLine();
  }
  return ops;
};

ALinesMutator.prototype._getCurLine = function() {
  return this._curLine || (this._curLine = new AStringMutator(this._lines[this._l] || {a:'',s:''}, this._pool));
};

ALinesMutator.prototype._closeCurLine = function() {
  if(this._curLine) {
    // fix for case with inserting into empty document - we must store first line that doesn't
    // exists in collection yet
    this._lines[this._l] = this._curLine.finish();
    this._curLine = null;
  }
};

ALinesMutator.prototype._nextLine = function() {
  this._closeCurLine();
  this._l++;
};

ALinesMutator.prototype.skip = function(N, L) {
  if(L) {
    var n = this._skipLines(L);
    assert.equal(n, N, 'N does not match actual chars in multiline op');
  } else {
    // assertion is done in AStringMutator
    this._getCurLine().skip(N);
  }
  return this;
};

ALinesMutator.prototype.take = function(N, L) {
  if(L) {
    var ops = this._takeLines(L);
    var n = ops.reduce(function(prev, op) { return prev + op.chars; }, 0);
    assert.equal(n, N, 'N does not match actual chars in multiline op');
    return ops;
  } else {
    return this._getCurLine().take(N);
  }
};

/*
 * Remove N chars and L lines from the alines list and return an array of components.
 * Caller can analyze these components to compare actual removed data with what was intended to remove.
 */
ALinesMutator.prototype.remove = function(N, L) {
  var removed;
  if(L) {
    var curLine = this._getCurLine();

    // first, take the rest of the current line, including newline
    // (that will result in joining with the next line after remove)
    removed = curLine.remove(curLine.remaining());

    // now continue from second line and remove more, collecting removed data
    var i = 0;
    while(++i < L) {
      var line = new ComponentList.unpack(this._lines[this._l + i], this._pool);
      removed.concat(line);
    }

    // Drop current line if after removal it becomes empty. 
    // Fixes "remove last line should not leave empty line" and "remove mid line" tests.
    var removeCurLine = 0;
    if(curLine.length() == 0) {
      removeCurLine = 1;
      curLine = this._curLine = null;
    }
    // remove lines from original alines array and take next line
    // here's the trick: if curLine should be dropped, we don't take next line
    var spliced = this._lines.splice(this._l + 1 - removeCurLine, L);
    var nextLine = (spliced.length == L) ? spliced.pop() : null;
    // now join beginning of line from which we started with the next line
    if(nextLine && curLine) {
      // join with current line
      new AStringMutator(nextLine, this._pool).takeRemaining().reverse().map(function(c) {
          curLine.inject(c);
        });
    }
    // do a basic check that requested number of chars match actually removed
    var n = removed.reduce(function(prev, op) { return prev + op.chars; }, 0);
    assert.equal(n, N, 'N does not match actual chars in multiline op');
  } else {
    // check is done in AStringMutator
    removed = this._getCurLine().remove(N);
  }
  return removed;
};

/*
 * Insert a single (multiline) component into current position
 */
ALinesMutator.prototype.insert = function(opc) {
  var curLine = this._getCurLine();
  var removeLines = 1;
  var extraLine = null;
  var newLines = [];

  if(opc.lines) {
    opc = opc.clone();
    var linesToAdd = opc.lines;
    if(curLine.position() != 0 || curLine.isMutated()) {
      // append to the current line and move tail to the new line
      extraLine = curLine.remove(curLine.remaining()).pack(this._pool, true);
      if(extraLine.a == '') {
        extraLine = null;
      }
      // the order here is important since validation won't allow us to insert newline mid-string
      curLine.insert(opc.takeLine());
      newLines.push(curLine.finish());
    } else {
      // current line was not iterated, so just insert before it
      removeLines = 0;
    }

    while(opc.opcode) {
      newLines.push(new ComponentList([opc.takeLine()]).pack(this._pool, true));
    }
    if(extraLine) {
      newLines.push(extraLine);
    }

    // now replace old lines with new insertions
    this._lines.splice.apply(this._lines, [this._l, removeLines].concat(newLines));
    // move position and reset line iterator
    this._l += linesToAdd;
    this._curLine = null;
  } else {
    this._getCurLine().insert(opc);
  }
  return this;
};

ALinesMutator.prototype.applyFormat = function(opc) {
  if(opc.lines) {
    opc = opc.clone();
    // format line by line
    while(opc.opcode) {
      var line = this._getCurLine();
      var len = line.remaining();
      var fop = opc.clone().trimRight(len, 1);

      line.applyFormat(fop);
      opc.trimLeft(len, 1).skipIfEmpty();
      this._nextLine();
    }
    assert(opc.chars == 0 && opc.lines == 0, 'chars in format operation does not match actual chars in the document');
  } else {
    this._getCurLine().applyFormat(opc);
  }
  return this;
};

// TODO: used somewhere?
ALinesMutator.prototype.length = function() {
  var len = 0;
  for(var i = 0, l = this._lines.length; i < l; i++) {
    if(i == this._l && this._curLine) {
      len += this._curLine.length();
    } else {
      len += this._lines[i].s.length;
    }
  }
  return len;
};

ALinesMutator.prototype.position = function() {
  var n = this._curLine ? this._curLine.position() : 0;
  return new Position(n, this._l);
};

/*
 * Return number of remaining lines in the document, including current line
 */
ALinesMutator.prototype.remaining = function() {
  return this._lines.length - this._l;
};

ALinesMutator.prototype.lineRemaining = function() {
  return this._getCurLine().remaining();
};

ALinesMutator.prototype.finish = function() {
  // make sure mutated line is finished
  this._closeCurLine();
  // reset everything
  this._l = 0;
  return this._lines;
};
