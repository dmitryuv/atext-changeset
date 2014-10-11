exports.OpComponent = OpComponent;

var assert = require('assert');
var AttributeList = require('./attributelist').AttributeList;
var util = require('./csutil');



/*
 * Base operation component class, incapsulates most common functions
 * over component data. Describes operation on the text block.
 *
 * @param? opcode - initialize component with specified opcode (+,-,=)
 *    have internal meaning for NULL value - does not perform object initialization
 */
function OpComponent(opcode, N, L, attribs, charBank) {
  if(opcode !== null) {
    this.set(opcode, N, L, attribs, charBank);
  }
}

OpComponent.INSERT = '+';
OpComponent.REMOVE = '-';
OpComponent.KEEP = '=';

OpComponent.prototype.set = function(opcode, N, L, attribs, charBank) {
  this.opcode = opcode || '';
  this.chars = N || 0;
  this.lines = L || 0;
  this.attribs = attribs || new AttributeList();
  this.charBank = charBank || '';

  if(opcode == OpComponent.INSERT || opcode == OpComponent.REMOVE) {
    assert(this.lines == 0 || (this.lines > 0 && this.charBank.charAt(this.charBank.length - 1) == '\n'), 'for multiline components charbank should end up with newline');
    assert(this.chars == this.charBank.length, 'charBank length should match chars in operation');
  } else {
    // make sure charbank for KEEPs is erased
    this.charBank = '';
  }
  return this;
};

OpComponent.prototype.clear = function() {
  this.set();
  return this;
};

OpComponent.prototype.invert = function() {
  if(this.opcode == OpComponent.INSERT) {
    this.opcode = OpComponent.REMOVE;
  } else if (this.opcode == OpComponent.REMOVE) {
    this.opcode = OpComponent.INSERT;
  } else {
    this.attribs = this.attribs.invert();
  }
  return this;
};

OpComponent.prototype.clone = function(optNewOpcode) {
  return this.copyTo(new OpComponent(null), optNewOpcode);
};

OpComponent.prototype.copyTo = function(otherOp, optNewOpcode) {
  return otherOp.set(optNewOpcode || this.opcode, this.chars, this.lines, this.attribs, this.charBank);
};

/*
 * Removes N chars and L lines from the start of this component
 */
OpComponent.prototype.trimLeft = function(N, L) {
  assert(this.chars >= N && this.lines >= L, 'op is too short for trimLeft: ', this.chars, '<', N);

  this.chars -= N;
  this.lines -= L;
  this.charBank = this.charBank.substring(N);
  return this;
};

/*
 * Keeps N chars and L lines and trim end of this component
 */
OpComponent.prototype.trimRight = function(N, L) {
  assert(this.chars >= N && this.lines >= L, 'op is too short for trimRight: ', this.chars, '<', N);

  this.chars = N;
  this.lines = L;
  this.charBank = this.charBank.substring(0, N);
  return this;
};


OpComponent.prototype.composeAttributes = function(otherAtt) {
  this.attribs = this.attribs.compose(otherAtt, this.opcode == OpComponent.KEEP);
  return this;
};

OpComponent.prototype.transformAttributes = function(otherAtt) {
  this.attribs = this.attribs.transform(otherAtt);
  return this;
};

OpComponent.prototype.formatAttributes = function(formatAtt) {
  this.attribs = this.attribs.format(formatAtt);
  return this;
};

OpComponent.prototype.invertAttributes = function(exceptAtt) {
  this.attribs = this.attribs.invert(exceptAtt);
  return this;
};

/*
 * Appends another component to this one
 */
OpComponent.prototype.append = function(otherCmp) {
  if(otherCmp.chars == 0) {
    // skip no-ops
    return this;
  }
  // allow appending to empty component
  if(this.chars == 0) {
    this.opcode = otherCmp.opcode;
    this.attribs = otherCmp.attribs.clone();
  } else {
    assert(this.attribs.equals(otherCmp.attribs) && this.opcode == otherCmp.opcode, 'cannot append op with different attribs or opcodes');
  }

  this.chars += otherCmp.chars;
  this.lines += otherCmp.lines;
  this.charBank += otherCmp.charBank;
  return this;
};

OpComponent.prototype.skipIfEmpty = function() {
  if(this.chars == 0) {
    this.opcode = '';
  }
};

OpComponent.prototype.skip = function() {
  this.opcode = '';
};

OpComponent.prototype.equals = function(otherCmp, optDoNotCheckOpcode) {
  return (optDoNotCheckOpcode || (this.opcode == otherCmp.opcode))
    && this.chars == otherCmp.chars
    && this.lines == otherCmp.lines
    // if one of the ops are KEEP and we don't check opcode, do not check charBanks as well
    && ((optDoNotCheckOpcode && (this.opcode == OpComponent.KEEP || otherCmp.opcode == OpComponent.KEEP)) || (this.charBank == otherCmp.charBank))
    && this.attribs.equals(otherCmp.attribs);
};

/*
 * For multiline components, return new component with single line and trimLeft current
 */
OpComponent.prototype.takeLine = function() {
  var lineComp = this.clone();
  if(this.lines) {
    var i = this.charBank.indexOf('\n');
    if(i >= 0) {
      lineComp.trimRight(i + 1, 1);
      this.trimLeft(i + 1, 1)
        .skipIfEmpty();
    } else {
      this.skip();
    }
  } else {
    this.skip();
  }
  return lineComp;
};

OpComponent.prototype.deltaLen = function() {
  return this.opcode == OpComponent.INSERT ? this.chars : (this.opcode == OpComponent.REMOVE ? -this.chars : 0);
};

/*
 * Return attributes string for the component
 */
OpComponent.prototype.pack = function(pool) {
  assert(pool, 'pool is required');
  if(!this.opcode) {
    return { a: '', s: '', dLen: 0 };
  }
  
  return {
    a: this.attribs.pack(pool) + (this.lines ? ('|' + util.toString36(this.lines)) : '') 
    + this.opcode + util.toString36(this.chars),
    s: this.charBank,
    dLen: this.deltaLen()
  };
};
