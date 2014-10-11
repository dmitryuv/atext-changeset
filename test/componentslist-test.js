var ComponentList = require('../lib/componentlist').ComponentList;
var OpComponent = require('../lib/opcomponent').OpComponent;
var AttributeList = require('../lib/attributelist').AttributeList;
var OpAttribute = require('../lib/opattribute').OpAttribute;
var assert = require('assert');

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('ComponentList', function(){
  var unpacked = {
    a: '-c*3*4+6|3=a^1^3*2*5+1=1-1+1*0+1=1-1+1|c=c=2*0|2=2-1=3+1',
    s: '12345678901212345611111111'
  };
  var unpackedPool = [
    ['bold','true'],
    ['author', '1'],
    ['underline','true'],
    ['foo', 'bar'],
    ['list', '1'],
    ['color', '#333']
    ];


  it('test unpack & repack with old pool', function() {
    var ops = ComponentList.unpack(unpacked, unpackedPool);
    var res = ops.pack(clone(unpackedPool));

    assert.equal(res.a, unpacked.a);
    assert.equal(res.s, unpacked.s);
    assert.equal(res.dLen, -4);
    assert.deepEqual(res.pool, unpackedPool);
  });

  it('test unpack & repack with new pool', function() {
    var ops = ComponentList.unpack(unpacked, unpackedPool);
    var res = ops.pack();

    // pool will be rebuilt with new indexes
    assert.equal(res.a, '-c*0*1+6|3=a^0^2*3*4+1=1-1+1*5+1=1-1+1|c=c=2*5|2=2-1=3+1');
    assert.equal(res.s, unpacked.s);
    assert.equal(res.dLen, -4);
    assert.deepEqual(res.pool, [
      ['foo', 'bar'],
      ['list', '1'],
      ['author', '1'],
      ['underline', 'true'],
      ['color', '#333'],
      ['bold','true']
      ]);
  });

  it('throws on incomplete charBank', function() {
    var test = {
      a: unpacked.a,
      s: '1234'
    };
    assert.throws(function() {
      ComponentList.unpack(test, unpackedPool);
    }, new RegExp('charBank length should match'));
  });

  function testPack(name, ops, res, lenChange) {
    var pool = [['foo','bar'], ['zoo','moo']];
    it(name, function() {
      ops = ops.map(function(o) { 
        var a = AttributeList.unpack(o[3], pool);
        return new OpComponent(o[0], o[1], o[2], a, o[4]);
      });
      var list = new ComponentList(ops);

      var parts = res.split('$');
      assert.deepEqual(list.pack(pool), { a: parts[0], s: parts.slice(1).join('$'), dLen: lenChange, pool: pool });
    });
  }

  testPack('can merge inline ops', [['+', 1, 0, '*0', 'a'], ['+', 2, 0, '*0', 'bc']], '*0+3$abc', 3);
  testPack('don\'t merge on different attribs', [['+', 1, 0, '*1', 'a'], ['+', 2, 0, '*0', 'bc']], '*1+1*0+2$abc', 3);
  testPack('don\'t merge on different opcodes', [['-', 1, 0, '*0', 'a'], ['+', 2, 0, '*0', 'bc']], '*0-1*0+2$abc', 1);
  testPack('merge multiline and inline ops', [['+', 1, 0, '*0', 'a'], ['+', 2, 1, '*0', 'b\n'], ['+', 2, 1, '*0', 'c\n'], ['+', 2, 0, '*0', 'de']], '*0|2+5*0+2$ab\nc\nde', 7);
  testPack('drop trailing pure "keep"', [['+', 1, 0, '*0', 'a'], ['=', 2, 0, '', '']], '*0+1$a', 1);
  testPack('keep formatting trailing "keep"', [['+', 1, 0, '*0', 'a'], ['=', 2, 0, '*1', '']], '*0+1*1=2$a', 1);

  testPack('smart: put removes before inserts', [['+', 2, 0, '', 'ab'],['-', 2, 0, '', 'cd']], '-2+2$cdab', 0);
  testPack('smart: split by keep operation', [['+', 2, 0, '', 'ab'],['=', 2, 0],['-', 2, 0, '', 'cd']], '+2=2-2$abcd', 0);
  testPack('smart: remove final pure keeps', [['+', 2, 0, '', 'ab'],['=', 2, 0]], '+2$ab', 2);

  it('invert components', function() {
    var res = ComponentList.unpack(unpacked, unpackedPool).invert().pack(unpackedPool);
    assert.equal(res.a, '*3*4-6+c|3=a^1^3*2*5-1=1-1*0-1+1=1-1+1|c=c=2^0|2=2+1=3-1');
    assert.equal(res.s, '12345612345678901211111111');
  });

  it('test reorder', function() {
    function test(ops, res) {
      ops = ops.map(function(o) {
        return new OpComponent(o, 1, 0, null, 'x');
      });
      var list = [];
      new ComponentList(ops).reorder().map(function(c) {
        list.push(c.opcode);
      });
      assert.deepEqual(list, res);
    }
    test(['+','-','='], ['-','+','=']);
    test(['+','=','-','+','-','+','-'],['+','=','-','-','-','+','+']);
  });
});
