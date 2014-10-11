var OpComponent = require('../lib/opcomponent').OpComponent;
var ComponentList = require('../lib/componentlist').ComponentList;
var AttributeList = require('../lib/attributelist').AttributeList;
var AStringMutator = require('../lib/astringmutator').AStringMutator;
var assert = require('assert');

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('AStringMutator', function() {
  var pool = [['foo','bar'], ['author','x'], ['bold','true'], ['list', 1], ['italic', true]];
  var sample = { a: '*0+2*1+4*2+6', s: 'abcdefghijkl' };
  var empty = { a: '', s: '' };
  function clist(list) {
    var l = [];
    for(var i = 0; i < list.length; i++) {
      var item = list[i];
      l.push(new OpComponent(item[0], item[1], item[2], AttributeList.unpack(item[3], pool), item[4]));
    }
    return new ComponentList(l);
  }

  it('does not fail on empty strings', function() {
    var m = new AStringMutator(clone(empty), pool);
    assert.deepEqual(m.takeRemaining(), clist([]));
    assert.equal(m.isMutated(), false);
  });

  it('can build line from scratch', function() {
    var m = new AStringMutator(clone(empty), pool);
    new AStringMutator(clone(sample), pool).takeRemaining().map(function(c) {
      m.insert(c);
    });
    assert.deepEqual(m.finish(), sample);
  });

  it('return injected component', function() {
    var m = new AStringMutator(clone(sample), pool);
    m.inject(new OpComponent(OpComponent.INSERT, 2, 0, null, 'XX'));
    assert.deepEqual(m.take(3), clist([['+',2,0,null,'XX'],['+',1,0,'*0','a']]));
  });

  it('supports newline at the end', function() {
    var m = new AStringMutator({ a: '*0+4|1+1', s: 'abcd\n' }, pool);
    assert.deepEqual(m.takeRemaining(), clist([['+',4,0,'*0','abcd'],['+',1,1,null,'\n']]));
  });

  it('can decompose into subcomponents', function() {
    var m = new AStringMutator(clone(sample), pool);
    var c = m.skip(1).take(2);
    assert.deepEqual(c, clist([['+',1,0,'*0','b'],['+',1,0,'*1','c']]));

    c = m.take(1);
    assert.deepEqual(c, clist([['+',1,0,'*1','d']]));

    c = m.takeRemaining();
    assert.deepEqual(c, clist([['+',2,0,'*1','ef'],['+',6,0,'*2','ghijkl']]));

    assert.equal(m.isMutated(), false);
  });

  it('can merge inserts', function() {
    var m = new AStringMutator(clone(sample), pool);
    m.skip(3).insert(new OpComponent('+', 2, 0, AttributeList.unpack('*1', pool), 'XX'));

    assert.equal(m.isMutated(), true);
    assert.deepEqual(m.finish(), { a: '*0+2*1+6*2+6', s: 'abcXXdefghijkl' });
  });

  it('can do removes', function() {
    var m = new AStringMutator(clone(sample), pool);
    var removed = m.skip(1).remove(2);

    assert.deepEqual(removed, clist([['+', 1, 0, '*0', 'b'], ['+', 1, 0, '*1', 'c']]));
    assert.deepEqual(m.finish(), { a: '*0+1*1+3*2+6', s: 'adefghijkl' });
  });

  it('accept single newline only at the end of the string', function() {
    var m = new AStringMutator({a:'+2', s:'ab'}, pool);
    var op = new OpComponent('+', 2, 1, null, 'X\n');

    assert.throws(function() {
      m.insert(op);
    }, new RegExp('end of the string'));

    m.skip(m.remaining());

    assert.throws(function() {
      m.insert(new OpComponent('+', 4, 2, null, 'a\nb\n'));
    }, new RegExp('end of the string'));

    assert.deepEqual(m.insert(op).finish(), {a:'|1+4', s:'abX\n'});

    assert.throws(function() {
      m.insert(op);
    }, new RegExp('already have newline'));
  });

  it('format string', function() {
    var m = new AStringMutator(clone(sample), pool);
    var fop = new OpComponent('=', 4, 0, AttributeList.unpack('*4', pool));
    var res = m.skip(3).applyFormat(fop).finish();

    assert.deepEqual(res, {a: '*0+2*1+1*1*4+3*2*4+1*2+5', s: 'abcdefghijkl'});
  });

  it('can do complex changes', function() {
    var m = new AStringMutator(clone(sample), pool);
    var removed = m.remove(3);
    assert.deepEqual(removed, clist([['+', 2, 0, '*0', 'ab'], ['+', 1, 0, '*1', 'c']]));

    m.insert(new OpComponent('+', 4, 0, AttributeList.unpack('*3', pool), 'XXXX'));
    m.skip(4);
    removed = m.remove(1);
    assert.deepEqual(removed, clist([['+', 1, 0, '*2', 'h']]));
    // skip to the end
    m.skip(m.remaining());
    m.insert(new OpComponent('+', 3, 0, AttributeList.unpack('*4', pool), 'YYY'));

    assert.deepEqual(m.finish(), {a: '*3+4*1+3*2+5*4+3', s: 'XXXXdefgijklYYY'});
  });

  it('throws on invalid operations', function() {
    assert.throws(function() {
      new AStringMutator(clone(sample), pool)
        .skip(100)
        .remove(1);
    }, new RegExp('unexpected end'));

    assert.throws(function() {
      new AStringMutator(clone(sample), pool)
        .insert(new OpComponent('-'));
    }, new RegExp('bad opcode'));

    assert.throws(function() {
      new AStringMutator({a: '-2', s: 'xx'}, pool)
        .take(1);
    }, new RegExp('non-astring'));

    assert.throws(function() {
      new AStringMutator({a: '*0|1+1*1+2|1+1', s: '\nab\n'}, pool)
        .takeRemaining();
    }, new RegExp('non-astring'));

  });
});