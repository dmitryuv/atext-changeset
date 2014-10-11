exports.OpAttribute = OpAttribute;

function OpAttribute(opcode, key, value) {
  this.opcode = opcode;
  this.key = key;
  this.value = value;
}

OpAttribute.FORMAT = '*';
OpAttribute.REMOVE = '^';

OpAttribute.format = function(key, value) {
  return new OpAttribute(OpAttribute.FORMAT, key, value);
};

OpAttribute.remove = function(key, value) {
  return new OpAttribute(OpAttribute.REMOVE, key, value);
}

OpAttribute.prototype.invert = function() {
  var opcode = (this.opcode == OpAttribute.FORMAT) ? OpAttribute.REMOVE : OpAttribute.FORMAT;
  return new OpAttribute(opcode, this.key, this.value);
};

OpAttribute.prototype.equals = function(other) {
  return this.opcode === other.opcode && this.key === other.key && this.value === other.value;
};
