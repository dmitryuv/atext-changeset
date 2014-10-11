var ComponentList = require('./componentlist').ComponentList;
var OpComponent = require('./opcomponent').OpComponent;

exports.parseInt36 = function(str) {
  return parseInt(str, 36);
};

exports.toString36 = function(num) {
  return num.toString(36);
};

exports.zip = function(list1, list2, needSplitFunc, func) {
  var iter1 = list1.getIterator();
  var iter2 = list2.getIterator();
  var res = new ComponentList();
  var op1 = new OpComponent();
  var op1part = new OpComponent(null);
  var op2 = new OpComponent();
  var op2part = new OpComponent(null);
  var opOut = new OpComponent(null);

  while(op1.opcode || op1part.opcode || iter1.hasNext() || op2.opcode || op2part.opcode || iter2.hasNext()) {
    zipNext(op1, op1part, iter1);
    zipNext(op2, op2part, iter2);

    if(op1.opcode && op2.opcode) {
      // pre-splitting into equal slices greatly reduces
      // number of code branches and makes code easier to read
      var split = needSplitFunc(op1, op2);

      if(split && op1.chars > op2.chars) {
        op1.copyTo(op1part)
          .trimLeft(op2.chars, op2.lines);
        op1.trimRight(op2.chars, op2.lines);
      } else if(split && op1.chars < op2.chars) {
        op2.copyTo(op2part)
          .trimLeft(op1.chars, op1.lines);
        op2.trimRight(op1.chars, op1.lines);
      }
    }

    func(op1, op2, opOut);

    if(opOut.opcode) {
      res.push(opOut.clone());
      opOut.skip();
    }
  }

  return res;
};

function zipNext(op, part, iter) {
  if(!op.opcode) {
    if(part.opcode) {
      part.copyTo(op);
      part.skip();
    } else if(iter.hasNext()) {
      iter.next().copyTo(op);
    }
  }
}