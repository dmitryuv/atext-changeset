exports.Builder = Builder;

var assert = require('assert');
var OpAttribute = require('./opattribute').OpAttribute;
var AttributeList = require('./attributelist').AttributeList;
var ComponentList = require('./componentlist').ComponentList;
var OpComponent = require('./opcomponent').OpComponent;
var Changeset = require('./changeset');
var util = require('./csutil');



/**
 * Creates a Changeset builder for the document.
 * @param {AttributedDocument} doc
 * @param? {String} optAuthor - optional author of all changes
 */
function Builder(doc, optAuthor) {
  this._ops = new ComponentList();
  this._doc = doc;
  this._len = doc.length();
  this._mut = doc.mutate();
  this._author = new AttributeList();
  this._authorId = optAuthor;
  if(optAuthor) {
    this._author.addFormatOp('author', optAuthor);
  }  
}

Builder.prototype.keep = function(N, L) {
  this._ops.addKeep(N, L);
  // mutator does the check that N and L match actual skipped chars
  this._mut.skip(N, L);
  return this;
};

Builder.prototype.format = function(N, L, attribs) {
  return this._format(N, L, attribs);
};

Builder.prototype.removeAllFormat = function(N, L) {
  return this._format(N, L, new AttributeList(), true);
};

Builder.prototype._format = function(N, L, attribs, removeAll) {
  // someone could send us author by mistake, we strictly prohibit that and replace with our author
  attribs = attribs.merge(this._author);

  var res = this._mut.take(N, L).map(function(c) {
    c = c.clone(OpComponent.KEEP);
    if(removeAll) {
      c.invertAttributes()
        .composeAttributes(attribs);
    } else {
      c.formatAttributes(attribs);
    }
    return c;
  });

  this._ops.concat(res);
  return this;
};

Builder.prototype.insert = function(text, optAttribs) {
  var attribs = optAttribs ? optAttribs.merge(this._author) : this._author;

  var lastNewline = text.lastIndexOf('\n');
  if(lastNewline < 0) {
    // single line text
    this._ops.addInsert(text.length, 0, attribs, text);
  } else {
    var l = lastNewline + 1;
    // multiline text, insert everything before last newline as multiline op
    this._ops.addInsert(l, text.match(/\n/g).length, attribs, text.substring(0, l));
    if(l < text.length) {
      // insert remainder as single-line op
      this._ops.addInsert(text.length - l, 0, attribs.clone(), text.substring(l));
    }
  }
  return this;
};

Builder.prototype.remove = function(N, L) {
  this._ops.concat(this._mut.take(N, L).invert());
  return this;
};

Builder.prototype.finish = function() {
  return new Changeset(this._ops, this._len, this._authorId);
};