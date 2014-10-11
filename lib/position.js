module.exports = Position;

function Position(ch, line) {
  this.ch = ch || 0;
  this.line = line || 0;
}

Position.prototype.before = function(otherPos) {
  return (this.line < otherPos.line) || (this.line == otherPos.line && this.ch < otherPos.ch);
};

Position.prototype.equals = function(otherPos) {
  return (this.line == otherPos.line) && (this.ch == otherPos.ch);
};

Position.prototype.clone = function() {
  return new Position(this.ch, this.line);
};

/*
 * Adding lines does not alter char position in this line
 */
Position.prototype.add = function(chars, lines) {
  if(lines) {
    this.line += lines;
  } else {
    this.ch += chars;
  }
  return this;
};

/*
 * Unlike adding, advance uses changeset logic to advance between lines
 * i.e. moving to next line resets char position
 */
Position.prototype.advance = function(chars, lines) {
  this.add(chars, lines);
  if(lines) {
    this.ch = 0;
  }
  return this;
};
/*
 * Subtracts component chars or lines from position. Char position on this line should not be affected
 * if we're removing other linesэ
 */
Position.prototype.subtract = function(chars, lines) {
  if(lines) {
    this.line -= lines;
  } else {
    this.ch -= chars;
  }
  return this;
};