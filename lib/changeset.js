module.exports = Changeset;

var assert = require('assert');
var ComponentList = require('./componentlist').ComponentList;
var OpComponent = require('./opcomponent').OpComponent;
var AttributeList = require('./attributelist').AttributeList;
var Builder = require('./builder').Builder;
var Position = require('./position');
var util = require('./csutil');


function Changeset(ops, oldLen, optAuthorId, optNewLen) {
  this._ops = ops;
  this._oldLen = oldLen;
  this._authorId = optAuthorId;
  this._newLen = optNewLen;
  if(this._newLen == undefined) {
    var dLen = this._ops.reduce(function(prev, next) {
      return prev + next.deltaLen();
    }, 0);

    this._newLen = oldLen + dLen;
  }
}

var headerRegex = /X:([0-9a-z]+)([><])([0-9a-z]+)|/;
/*
 * Unpacks operation and returns Changeset object.
 * @param {Object} cs - contains {op, p}
 */
Changeset.unpack = function(cs) {
  var header = cs.op.match(headerRegex);
  assert.notEqual(header[0], '', 'wrong changeset');

  var oldLen = util.parseInt36(header[1]);
  var sign = (header[2] == '>') ? 1 : -1;
  var delta = util.parseInt36(header[3]);
  var newLen = oldLen + sign * delta;

  var splitPos = cs.op.indexOf("$");
  if (splitPos < 0) {
    splitPos = cs.op.length;
  }

  var ops = ComponentList.unpack({ 
    a: cs.op.substring(header[0].length, splitPos),
    s: cs.op.substring(splitPos + 1)
  }, cs.p);

  return new Changeset(ops, oldLen, cs.u, newLen);
};

/*
 * Create and return changeset builder
 * @param {AttributedDocument} doc
 * @param? {String} optional author of all changes
 */
Changeset.create = function(doc, optAuthor) {
  return new Builder(doc, optAuthor);
};

// explanation for side = [left | right]
// let's say we have thisOp coming to server after otherOp,
// both creating a "tie" situation.
// server has [otherOp, thisOp]
// for server otherOp is already written, so it transforms thisOp
// by otherOp, taking otherOp as first-win and thisOp as second.
// In [otherOp, thisOp] list otherOp is on the "left"
// 
// Server sends its otherOp back to the client, but client already
// applied thisOp operation, so his queue looks like
// [thisOp, otherOp]
// Client should transorm otherOp, and to get same results as server,
// this time it should take otherOp as first-win. In the list
// otherOp is to the "right"
Changeset.prototype.transform = function(otherCS, side) {
  assert.equal(this._oldLen, otherCS._oldLen, 'changesets from different document versions cannot be transformed');
  assert(side == 'left' || side == 'right', 'side should be \'left\' or \'right\'');

  this._ops.reorder();
  otherCS._ops.reorder();

  var dLen = 0;
  var newOps = util.zip(this._ops, otherCS._ops, 
    function(thisOp, otherOp) {
      // INSERTs are handled unsplitted, always
      var hasInsert = thisOp.opcode == OpComponent.INSERT || otherOp.opcode == OpComponent.INSERT;
      // KEEPs can be reduced by REMOVEs or extended by INSERTs
      var hasKeep = thisOp.opcode == OpComponent.KEEP || otherOp.opcode == OpComponent.KEEP;
      // REMOVEs can reduce KEEPs other REMOVEs
      var hasRemove = thisOp.opcode == OpComponent.REMOVE || otherOp.opcode == OpComponent.REMOVE; 
      // in both situation we can split ops into equal slices
      return (hasKeep || hasRemove) && !hasInsert;
    }, 
    function(thisOp, otherOp, opOut) {
      if(thisOp.opcode && otherOp.opcode && (thisOp.opcode == OpComponent.INSERT || otherOp.opcode == OpComponent.INSERT)) {
        var left;

        var thisChar = thisOp.charBank.charAt(0);
        var otherChar = otherOp.charBank.charAt(0);

        if(thisOp.opcode != otherOp.opcode) {
          // the op that does insert goes first
          left = (otherOp.opcode == OpComponent.INSERT);
        } else if((thisChar == '\n' || otherChar == '\n') && thisChar != otherChar) {
          // insert string that doesn't start with a newline first
          // to not break up lines
          left = otherChar != '\n';
        } else {
          left = side == 'left';
        }

        if(left) {
          // other op goes first
          opOut.set(OpComponent.KEEP, otherOp.chars, otherOp.lines);
          otherOp.skip();
        } else {
          thisOp.copyTo(opOut);
          thisOp.skip();
        }
      } else {
        // If otherOp is not removing something (that could mean it already removed thisOp)
        // then keep our operation
        if(thisOp.opcode && otherOp.opcode != OpComponent.REMOVE) {
          thisOp.copyTo(opOut);
          if(thisOp.opcode == OpComponent.REMOVE && otherOp.opcode) {
            // if thisOp is removing what was reformatted, we need to calculate new attributes for removal
            opOut.composeAttributes(otherOp.attribs);
          }
          else if(thisOp.opcode == OpComponent.KEEP && otherOp.opcode) {
            // both keeps here, also transform attributes
            opOut.transformAttributes(otherOp.attribs);
          }
        }
        // else, if otherOp is removing, skip thisOp ('-' or '=' at this point)
        thisOp.skip();
        otherOp.skip();
      }
      dLen += opOut.deltaLen();
    });

  return new Changeset(newOps, otherCS._newLen, this._authorId, otherCS._newLen + dLen);
};

/*
 * Transform single position by this changeset.
 * @pos {ch, line} - cursor position in the document
 * @param side - if operation is insert and side=='left', cursor is pushed before the insert,
 *    overwise it's after the insert
 */
Changeset.prototype.transformPosition = function(pos, side) {
  assert(side == 'left' || side == 'right', 'side should be \'left\' or \'right\'');
  this._ops.reorder();

  var res = pos.clone();
  // iteration cursor
  var c = new Position();
  this._ops.some(function(op) {
    if(op.opcode == OpComponent.INSERT) {
      if(c.before(res) || (c.equals(res) && side == 'right')) {
        // insert can split current line
        if(op.lines && res.line == c.line) {
          res.subtract(c.ch, 0).add(0, op.lines);
        } else {
          res.add(op.chars, op.lines);
        }
      }
      // advance cursor
      c.advance(op.chars, op.lines);
    } else if(op.opcode == OpComponent.REMOVE) {
      var inRange = c.before(res) && res.before(c.clone().advance(op.chars, op.lines));
      if(c.before(res) && !inRange) {
        // remove muiltiline range can join cursor row with position row, if they end up on the same row
        if (op.lines && (c.line + op.lines) == res.line) {
          res.add(c.ch, 0);
          res.line = c.line;
        } else {
          res.subtract(op.chars, op.lines);
        }
      } else if (inRange) {
        // we're collapsing range where current position is
        res = c.clone();
      }
    } else {
      // KEEP, just advance our position
      c.advance(op.chars, op.lines);
    }

    // iterator break - if we passed calculated position, we can stop iterating over ops
    return res.before(c);
  });

  return res;
};

Changeset.prototype.compose = function(otherCS) {
  assert.equal(this._newLen, otherCS._oldLen, 'changesets from different document versions are not composable');

  this._ops.reorder();
  otherCS._ops.reorder();

  var newOps = util.zip(this._ops, otherCS._ops, 
    function(thisOp, otherOp) {
      var noSplit = thisOp.opcode == OpComponent.REMOVE || otherOp.opcode == OpComponent.INSERT;
      // KEEPS can be replaced by REMOVEs
      var hasKeep = thisOp.opcode == OpComponent.KEEP || otherOp.opcode == OpComponent.KEEP;
      // REMOVEs can affect KEEPs and INSERTs but not other REMOVEs
      var hasRemoveActual = (thisOp.opcode != otherOp.opcode) && (thisOp.opcode == OpComponent.REMOVE || otherOp.opcode == OpComponent.REMOVE); 
      // in both cases we can split ops into equal slices
      return (hasKeep || hasRemoveActual) && !noSplit;
    },
    function(thisOp, otherOp, opOut) {
      if (thisOp.opcode == OpComponent.REMOVE || !otherOp.opcode) {
        // if we've removed something, it cannot be undone by next op
        thisOp.copyTo(opOut);
        thisOp.skip();
      } else if (otherOp.opcode == OpComponent.INSERT || !thisOp.opcode) {
        // if other is inserting something it should be inserted
        otherOp.copyTo(opOut);
        otherOp.skip();
      } else {
        if(otherOp.opcode == OpComponent.REMOVE) {
          // at this point we're operating on actual chars (KEEP or INSERT) in the target string
          // we don't validate KEEPs since they just add format and not keep final attributes list
          var validRemove = (thisOp.opcode == OpComponent.KEEP) || thisOp.equals(otherOp, true);
          assert(validRemove, 'removed in composition does not match original' + JSON.stringify(thisOp) + JSON.stringify(otherOp));

          // if there was no insert on our side, just keep the other op,
          // overwise we're removing what was inserted and will skip both
          if (thisOp.opcode == OpComponent.KEEP) {
            // undo format changes made by thisOp and compose with otherOp
            otherOp.copyTo(opOut)
              .composeAttributes(thisOp.attribs.invert());
          }
        } else if(otherOp.opcode == OpComponent.KEEP) {
          // here, thisOp is also KEEP or INSERT, so just copy it over and compose with
          // otherOp
          thisOp.copyTo(opOut)
            .composeAttributes(otherOp.attribs);
        }

        thisOp.skip();
        otherOp.skip();
      }
    });

  return new Changeset(newOps, this._oldLen, this._authorId, otherCS._newLen);
};

Changeset.prototype.invert = function() {
  var newOps = this._ops.map(function(op) {
    return op.clone().invert();
  });

  return new Changeset(newOps, this._newLen, this._authorId, this._oldLen);
};

Changeset.prototype.applyTo = function(doc) {
  var mut = doc.mutate();
  this._ops.reorder();
  this._ops.map(function(op, index) {
    // if we reuse (don't pack) changeset object, we can end up with
    // empty operations sometimes, do not process them.
    if(op.chars == 0) {
      return;
    }

    if(op.opcode == OpComponent.INSERT) {
      mut.insert(op);
    } else if (op.opcode == OpComponent.REMOVE) {
      // Since we can have multiline remove ops, remove() can
      // return an array of components instead of single one.
      // But since they all should be mergeable, we can run a quick
      // reduce operation and compare the result
      var removed = mut.remove(op.chars, op.lines)
                      .reduce(function(prev, op) {
                        return prev.append(op);
                      }, new OpComponent());

      assert(removed.equals(op, true), 'actual does not match removed');
    } else if (op.opcode == OpComponent.KEEP) {
      if(op.attribs.isEmpty()) {
        mut.skip(op.chars, op.lines);
      } else {
        mut.applyFormat(op);
      }
    }
  });
  mut.finish();

  assert.equal(this._newLen, doc.length(), 'final document length does not match');
  return doc;
};

/*
 * Pack changeset into compact format that can be stored 
 * or transferred by network. 
 * @param? optPool – if specified, pack into this pool, overwise create new one
 */
Changeset.prototype.pack = function(optPool) {
  assert(this._oldLen != undefined, 'Changeset should know oldLen');

  var packed = this._ops.pack(optPool);
  var op = 'X:' + util.toString36(this._oldLen)
    + (packed.dLen >= 0 ? '>' : '<') + util.toString36(Math.abs(packed.dLen))
    + packed.a;
  assert.equal(this._newLen - this._oldLen, packed.dLen, 'something wrong with the changeset, internal state broken');

  if(packed.s) {
    op += '$' + packed.s;
  }

  var cs = { op: op, p: packed.pool };
  if(this._authorId) {
    cs.u = this._authorId;
  }
  return cs;
};
