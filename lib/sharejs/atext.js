/*
 * ShareJS ottype API spec support
 */

var Changeset = require('../../lib/changeset');
var ADocument = require('../../lib/adocument').ADocument;

var atext = module.exports = {
  name: 'atext',
  uri: 'https://github.com/dmitryuv/atext-changeset',
  create: function(initial) {
    if ((initial != null) && typeof initial !== 'string') {
      throw new Error('Initial data must be a string');
    }
    return ADocument.fromText(initial || '');
  }
};

atext.apply = function(adoc, op) {
  if(!(op instanceof Changeset)) {
    op = Changeset.unpack(op);
  }
  if(!(adoc instanceof ADocument)) {
    adoc = ADocument.unpack(adoc);
  }
  return op.applyTo(adoc);
}

atext.compose = function(op1, op2) {
  var pack = false;
  if(!(op1 instanceof Changeset)) {
    op1 = Changeset.unpack(op1);
    pack = true;
  }
  if(!(op2 instanceof Changeset)) {
    op2 = Changeset.unpack(op2);
    pack = true;
  }
  var res = op1.compose(op2);
  if(pack) {
    return res.pack();
  } else {
    return res;
  }
}

atext.transform = function(op, otherOp, side) {
  var pack = false;
  if(!(op instanceof Changeset)) {
    op = Changeset.unpack(op);
    pack = true;
  }
  if(!(otherOp instanceof Changeset)) {
    otherOp = Changeset.unpack(otherOp);
    pack = true;
  }
  var res = op.transform(otherOp, side);
  if(pack) {
    return res.pack();
  } else {
    return res;
  }
}

atext.invert = function(op) {
  if(!(op instanceof Changeset)) {
    return Changeset.unpack(op).invert().pack();
  } else {
    return op.invert();
  }
}
