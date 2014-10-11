exports.ADocument = ADocument;

var assert = require('assert');
var ALinesMutator = require('./alinesmutator').ALinesMutator;
var ComponentList = require('./componentlist').ComponentList;
var Changeset = require('./changeset');


function ADocument(alines, pool) {
  this.lines = alines || [];
  this.pool = pool || [];
}

ADocument.unpack = function(doc) {
  return new ADocument(doc.lines, doc.pool);
}

ADocument.fromText = function(text, optAuthor) {
  var doc = new ADocument();
  if(text == '') {
    return doc;
  } else {
    return Changeset.create(doc, optAuthor)
      .insert(text)
      .finish()
      .applyTo(doc);
  }
};

ADocument.prototype.mutate = function() {
  return new ALinesMutator(this.lines, this.pool);
};

ADocument.prototype.length = function() {
  var len = 0;
  for(var i = 0, l = this.lines.length; i < l; i++) {
    len += this.lines[i].s.length;
  }
  return len;
};

ADocument.prototype.range = function(start, end) {
  return this.lines.slice(start, end+1);
};

ADocument.prototype.clone = function() {
  var copy = (JSON.parse(JSON.stringify(this)));
  return new ADocument(copy.lines, copy.pool);
};

/*
 * Performs pool compact procedure when we repack all lines into
 * new empty pool purging unused attributes
 */
ADocument.prototype.compact = function() {
  var doc = new ADocument();

  for(var i = 0; i < this.lines.length; i++) {
    doc.lines.push(ComponentList.unpack(this.lines[i], this.pool).pack(doc.pool, true));
  }
  return doc;
};

ADocument.prototype.pack = function(compactPool) {
  // since documents are usually discarded after pack(), do not create
  // copy and return originals
  var packed = {
    lines: this.lines,
    pool: this.pool
  };

  if(packed.lines.length > 0 && packed.lines[packed.lines.length - 1].s.length == 0) {
    // we can get empty line at the end by removing chars on unfinished lines (w/o trailing \n)
    // technically empty line and no lines at all is the same thing, but comparing documents before change
    // and document after reverted change can fail. To make docs consistent, just drop trailing empty lines.
    packed.lines.pop();
  }
  if(packed.lines.length == 0) {
    // if we don't have anything, drop pool as well
    packed.pool = [];
  }
  return packed;
};