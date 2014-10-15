exports.ADocument = ADocument;

var assert = require('assert');
var ALinesMutator = require('./alinesmutator').ALinesMutator;
var ComponentList = require('./componentlist').ComponentList;
var Changeset = require('./changeset');


function ADocument(alines, pool) {
  this.lines = alines || [];
  this.pool = pool || [];
}

/*
 * Static methdo to unpack document from storage format to ADocument object. ADocument consists
 * of lines and attribute pool. Each line is an object containing attributes string and text itself.
 *
 * @param doc - { lines: Array, pool: Array } where lines is a collection of { a: string, s: string }
 */
ADocument.unpack = function(doc) {
  return new ADocument(doc.lines, doc.pool);
}

/*
 * Create a document from plain text (can be any) and optionally supply an author
 *
 * @param {String} text
 * @param? {String} optAuthor
 */
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

/*
 * Start document mutation. A mutation is a series of changes that are applied in the document (insertions, deletions).
 * For example, it is used by Changeset.applyTo() method.
 * Mutator will update in place, so you should have no more than 1 active mutator that writes to the document. You 
 * can have as many read mutators (for iterating the document) as you want though.
 *
 * @returns ALinesMutator
 */
ADocument.prototype.mutate = function() {
  return new ALinesMutator(this.lines, this.pool);
};

/*
 * Return document length in chars, newlines are also counted.
 */
ADocument.prototype.length = function() {
  var len = 0;
  for(var i = 0, l = this.lines.length; i < l; i++) {
    len += this.lines[i].s.length;
  }
  return len;
};

/*
 * Returns range of Attributed Lines ({a: string, s: string}) from the document
 *
 * @returns {Array} {a: string, s: string}
 */
ADocument.prototype.range = function(start, end) {
  return this.lines.slice(start, end+1);
};

/*
 * Creates a full copy of the document.
 */
ADocument.prototype.clone = function() {
  var copy = (JSON.parse(JSON.stringify(this)));
  return new ADocument(copy.lines, copy.pool);
};

/*
 * Performs pool compact procedure when we repack all lines into
 * new empty pool purging unused attributes
 *
 * @returns {ADocument} - new compacted document object
 */
ADocument.prototype.compact = function() {
  var doc = new ADocument();

  for(var i = 0; i < this.lines.length; i++) {
    doc.lines.push(ComponentList.unpack(this.lines[i], this.pool).pack(doc.pool, true));
  }
  return doc;
};

/*
 * Pack the document into format that can be stored or transferred by network.
 *
 * @returns {Object}
 */
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