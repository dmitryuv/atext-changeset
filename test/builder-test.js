var assert = require('assert');
var ADocument = require('../lib/adocument').ADocument;
var AttributeList = require('../lib/attributelist').AttributeList;
var Changeset = require('../lib/changeset');

function alist(atts) {
  var list = new AttributeList();
  atts.map(function(l) {
    if(l[0] == '*') {
      list.addFormatOp(l[1], l[2]);
    } else {
      list.addRemoveOp(l[1], l[2]);
    }
  });
  return list;
}

describe('Builder', function() {
  var pool = [['foo','bar'], ['author','x'], ['bold','true'], ['list', 1], ['italic', true]];
  var sample = [{a:'*0+1|1+3', s:'abc\n'}, {a:'*1+4|1+1', s:'defg\n'}];
  var doc = new ADocument(sample, pool);

  describe('format', function() {
    function testFormat(name, funcName, posX, posY, lenX, lenY, list, author, expected, expectedAtts) {
      it(name, function() {
        var cs = Changeset.create(doc, author)
          .keep(posX, posY)
          [funcName](lenX, lenY, alist(list))
          .finish()
          .pack();

        assert.equal(cs.op, expected);
        if(expectedAtts) {
          assert.deepEqual(cs.p, expectedAtts);
        }
      });
    }
    testFormat('add attribute', 'format', 4, 1, 2, 0, [['*', 'bold', 'true']], null, 'X:9>0|1=4*0=2');
    testFormat('remove not existing attribute -> noop', 'format', 4, 1, 2, 0, [['^', 'bold', 'true']], null, 'X:9>0');
    testFormat('remove existing attribute', 'format', 4, 1, 2, 0, [['^', 'author', 'x']], null, 'X:9>0|1=4^0=2');
    testFormat('inject author, removing old one', 'format', 4, 1, 2, 0, [['*', 'italic', 'true']], 'tester', 'X:9>0|1=4^1*0*2=2');
    testFormat('ignore existing attributes', 'format', 4, 1, 2, 0, [['*', 'italic', 'true']], 'x', 'X:9>0|1=4*0=2');
    testFormat('format over different ops', 'format', 0, 0, 9, 2, [['*', 'italic', true]], null, 'X:9>0*0|2=9');
    testFormat('ignore attempt to push author via attribs', 'format', 4, 1, 2, 0, ['author', 'ignored'], 'tester', 'X:9>0|1=4^0*1=2', [['author', 'x'], ['author', 'tester']]);
    testFormat('remove all format', 'removeAllFormat', 4, 1, 2, 0, [], null, 'X:9>0|1=4^0=2');
    testFormat('remove all format but inject author', 'removeAllFormat', 4, 1, 2, 0, [], 'tester', 'X:9>0|1=4^0*1=2');
  });

  describe('insert', function() {
    function testInsert(name, posX, posY, text, atts, author, expected) {
      it(name, function() {
        var cs = Changeset.create(doc, author)
          .keep(posX, posY)
          .insert(text, alist(atts))
          .finish()
          .pack();

        assert.equal(cs.op, expected);
      });
    }

    testInsert('simple insert', 0, 0, 'hello', [], null, 'X:9>5+5$hello');
    testInsert('simple insert with author and attribs', 0, 0, 'hello', [['*', 'bold', 'true']], 'tester', 'X:9>5*0*1+5$hello');
    testInsert('insert multiline text mid line', 2, 0, 'hello\nworld\n', [], null, 'X:9>c=2|2+c$hello\nworld\n');
    testInsert('insert multiline with tail and author', 2, 0, 'hello\nworld', [], 'tester', 'X:9>b=2*0|1+6*0+5$hello\nworld');
  });

  describe('remove', function() {
    function testRemove(name, posX, posY, N, L, author, expected) {
      it(name, function() {
        var cs = Changeset.create(doc, author)
          .keep(posX, posY)
          .remove(N, L)
          .finish()
          .pack();

        assert.equal(cs.op, expected);
      });
    }

    testRemove('simple remove', 0, 0, 2, 0, null, 'X:9<2*0-1-1$ab');
    testRemove('remove all', 0, 0, 9, 2, null, 'X:9<9*0-1|1-3*1-4|1-1$abc\ndefg\n');
  });
});



