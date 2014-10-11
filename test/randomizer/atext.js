var randomInt = require('ot-fuzzer').randomInt;
var randomWord = require('ot-fuzzer').randomWord;
var OT = require('../../');
var ComponentList = require('../../lib/componentlist').ComponentList;
var OpComponent = require('../../lib/opcomponent').OpComponent;

var atext = require('../../lib/sharejs/atext');

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function randomAuthor() {
  // increase chance of submitting a change on behalf of the same author
  var a = ['1','2','1','3','2','4','3','5','4'];
  return a[randomInt(a.length)];
}

function randomFormat(allowRemove) {
  // return new AttributeList();
  if(randomInt(10) > 7) {
    return new OT.AttributeList();
  } else {
    if(allowRemove && randomInt(10) > 8) {
      return null;
    } else {
      var f = [['bold', 'true'], ['italic', 'true'], ['list', '1'], ['list', '2'], ['underline', 'true'], ['foo', 'bar']];
      var x = f[randomInt(f.length)];
      var m = ['addFormatOp', 'addRemoveOp'][randomInt(allowRemove ? 2 : 1)];
      return new OT.AttributeList()[m](x[0], x[1]);
    }
  }
}

atext.generateRandomOp = function(doc) {
  doc = OT.ADocument.unpack(doc);
  var expected = doc.clone();

  var len = doc.length();
  var pos = 0;
  var author = randomAuthor();
  var authorAtt = new OT.AttributeList().addFormatOp('author', author);
  var cs = OT.Changeset.create(doc, author);
  // since I don't have peek() function, i'll need another copy to iterate over by taking parts
  var iter = doc.mutate();
  var mut = expected.mutate();

  function randomTextRange() {
    var n = randomInt(len - pos + 1);
    var list;

    while(n > 0) {
      var lr = iter.lineRemaining();
      var ops = null;
      if(lr > n) {
        ops = iter.take(n, 0);
        n = 0;
      } else {
        ops = iter.take(lr, 1);
        n -= lr;
      }
      list = (list && list.concat(ops)) || ops;
    }
    return list || [];
  }

  function keep() {
    randomTextRange().map(function(op) { 
      // console.log('keep ', op);
      cs.keep(op.chars, op.lines);
      mut.skip(op.chars, op.lines);
      pos += op.chars;
    });
  };

  function format() {
    var fmt = randomFormat();
    randomTextRange().map(function(op) {
      var targetAtts;
      if(fmt === null) {
        cs.removeAllFormat(op.chars, op.lines);
        targetAtts = op.attribs.invert().compose(authorAtt, true);
      } else {
        cs.format(op.chars, op.lines, fmt);
        targetAtts = op.attribs.format(fmt.merge(authorAtt));
        require('assert').deepEqual(targetAtts, cs._ops._list[cs._ops._list.length - 1].attribs);
      }
      mut.applyFormat(new OpComponent(OpComponent.KEEP, op.chars, op.lines, targetAtts));
      pos += op.chars;
    });
  }

  function insert() {
    var w = randomWord();
    // console.log('inserting ', w);
    var newLine = 0;
    var fmt = randomFormat();
    if(randomInt(10) > 6) {
      w += '\n';
      newLine = 1;
    }
    cs.insert(w, fmt);

    var cmp = new OpComponent(OpComponent.INSERT, w.length, newLine, fmt.merge(authorAtt), w);
    mut.insert(cmp);
    len += w.length;
    pos += w.length;
  }

  function remove() {
    randomTextRange().map(function(op) {
      // console.log('remove ', op);
      cs.remove(op.chars, op.lines);
      mut.remove(op.chars, op.lines);
      len -= op.chars;
    });
  }

  if(len == 0) {
    insert();
  }

  var operations = 5;
  while((len - pos) > 0 && operations > 0) {
    // if document is long, bias it towards deletion
    var chance = (len > 300) ? 5 : 4;
    switch(randomInt(chance)) {
      case 0: 
        keep();
        break;
      case 1:
        insert();
        break;
      case 2:
        format();
        break;
      case 3:
      case 4:
        remove();
        break;
    }
    operations--;
  }
  mut.finish();

  return [cs.finish(), expected];
};

atext.generateRandomDoc = function() {
  return OT.ADocument.fromText(randomWord());
}

// used in randomizer to compare snapshots
// cleanup them before comparing
atext.serialize = function(doc) {
  return new OT.ADocument(doc).compact().pack();
}