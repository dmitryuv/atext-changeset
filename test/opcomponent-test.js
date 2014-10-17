var OpComponent = require('../lib/opcomponent').OpComponent;
var AttributeList = require('../lib/attributelist').AttributeList;
var OpAttribute = require('../lib/opattribute').OpAttribute;
var assert = require('assert');

describe('OpComponent', function() {
  it('test constructor', function() {
    var pool = [['foo','bar']];
    assert.deepEqual(new OpComponent(), {opcode: '', chars: 0, lines: 0, attribs: new AttributeList(), charBank: ''});
    assert.deepEqual(new OpComponent('+', 2, 1, AttributeList.unpack('*0', pool), 'a\n'), {opcode: '+', chars: 2, lines: 1, attribs: AttributeList.unpack('*0', pool), charBank: 'a\n'});
    assert.deepEqual(new OpComponent('=').opcode, '=');
    assert.strictEqual(new OpComponent(null).opcode, undefined);
    assert.throws(function() {
      new OpComponent('+', 2, 1, null, '\na')
    }, new RegExp('should end up with newline'));
  });

  it('clear', function() {
    assert.deepEqual(new OpComponent().clear(), new OpComponent());
  });

  it('clone', function() {
    var pool = [['foo','bar']];
    var orig = new OpComponent('+', 2, 1, AttributeList.unpack('*0',pool), 'a\n');
    assert.deepEqual(orig.clone(), orig);
    assert.deepEqual(orig.copyTo(new OpComponent()), orig);
    // clear charbank on opcode override to '='
    assert.deepEqual(orig.copyTo(new OpComponent(), '='), new OpComponent('=', 2, 1, AttributeList.unpack('*0',pool), ''));
  });

  it('equal', function() {
    var pool = [['foo', 'bar']];
    function test(c1, c2, ignoreOpcode, res) {
      c1 = new OpComponent(c1[0], c1[1], c1[2], AttributeList.unpack(c1[3], pool), c1[4]);
      c2 = new OpComponent(c2[0], c2[1], c2[2], AttributeList.unpack(c2[3], pool), c2[4]);
      assert.equal(c1.equals(c2, ignoreOpcode), res);
    }
    test(['+', 1, 0, null, 'a'], ['+', 2, 0, null, 'ab'], false, false);
    test(['+', 1, 0, '*0', 'a'], ['+', 1, 0, '*0', 'a'], false, true);
    test(['-', 1, 0, '*0', 'a'], ['+', 1, 0, '*0', 'a'], true, true);
    test(['=', 1, 0, '*0', 'b'], ['+', 1, 0, '*0', 'a'], true, true);
    test(['+', 1, 0, '*0', 'a'], ['=', 1, 0, '*0', ''], true, true);
  });

  it('trim', function() {
    var c = new OpComponent('+', 5, 2, null, 'ab\nc\n');
    assert.deepEqual(c.clone().trimLeft(3, 1), new OpComponent('+', 2, 1, null, 'c\n'));
    assert.deepEqual(c.clone().trimRight(3, 1), new OpComponent('+', 3, 1, null, 'ab\n'));
  });

  describe('invert', function() {
    function testInvert(name, opcode, atts, expectedOpcode, expectedAtts) {
      it(name, function() {
        atts = AttributeList.unpack(atts, [['foo','bar']]);
        expectedAtts = AttributeList.unpack(expectedAtts, [['foo','bar']]);
        var c = new OpComponent(opcode, 1, 0, atts, 'a').invert();
        assert.deepEqual(c, new OpComponent(expectedOpcode, 1, 0, expectedAtts, 'a'));
      });
    }

    testInvert('insert invertion', '+', '*0', '-', '*0');
    testInvert('remove invertion', '-', '^0', '+', '^0');
    testInvert('format invertion', '=', '*0', '=', '^0');
  });

  describe('append', function() {
    var alist = AttributeList.unpack('*0', [['foo','bar']]);
    var c = new OpComponent('+', 3, 1, alist, 'ab\n');
    it('same type', function() {
      assert.deepEqual(c.clone().append(c), new OpComponent('+', 6, 2, alist, 'ab\nab\n'));
    });
    it('to empty', function() {
      assert.deepEqual(new OpComponent().append(c), c);
    });
    it('throw if not compatible', function() {
      assert.throws(function() {
          var c2 = c.clone();
          c2.opcode = '=';
          c.clone().append(c2);
        }, new RegExp('cannot append'));
      assert.throws(function() {
          var c2 = c.clone();
          c2.attribs = AttributeList.unpack('*0', [['x', 'y']]);
          c.clone().append(c2);
        }, new RegExp('cannot append'));
    });
    it('skip no-ops', function() {
      assert.deepEqual(c.clone().append(new OpComponent()), c);
    });
  });

  it('takeLine', function() {
    var c = new OpComponent('+', 4, 2, null, 'a\nb\n');
    assert.deepEqual(c.takeLine(), new OpComponent('+', 2, 1, null, 'a\n'));
    assert.deepEqual(c.takeLine(), new OpComponent('+', 2, 1, null, 'b\n'));
    assert.deepEqual(c, new OpComponent('', 0, 0, null, ''));
  });

  it('pack', function() {
    var pool = [['foo','bar'], ['x','y']];
    var c = new OpComponent('+', 10, 2, AttributeList.unpack('*0*1', pool), '1234\n6789\n');
    assert.deepEqual(c.pack(pool), { a: '*0*1|2+a', s: '1234\n6789\n', dLen: 10 });
    assert.throws(function() {
      new OpComponent().pack();
    }, new RegExp('pool is required'));
  });

  it('skip', function() {
    var c = new OpComponent('+', 4, 2, null, 'a\nb\n');
    var c2 = new OpComponent();
    c.copyTo(c2).skip();
    assert.deepEqual(c2, {opcode: '', chars: 4, lines: 2, attribs: new AttributeList(), charBank: 'a\nb\n' });
    
    c.copyTo(c2).skipIfEmpty();
    assert.deepEqual(c2, c);

    c.copyTo(c2).trimRight(0, 0).skipIfEmpty();
    assert.deepEqual(c2, new OpComponent('', 0, 0, null, ''));
  });
});