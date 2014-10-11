var OpComponent = require('../lib/opcomponent').OpComponent;
var ComponentList = require('../lib/componentlist').ComponentList;
var AttributeList = require('../lib/attributelist').AttributeList;
var AStringMutator = require('../lib/astringmutator').AStringMutator;
var ALinesMutator = require('../lib/alinesmutator').ALinesMutator;
var assert = require('assert');

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('ALinesMutator', function() {
  var pool = [['foo','bar'], ['author','x'], ['bold','true'], ['list', 1], ['italic', true]];
  var sample = [{a:'*0+1|1+3', s:'abc\n'}, {a:'*1+4|1+1', s:'defg\n'}];
  function clist(list) {
    var l = [];
    for(var i = 0; i < list.length; i++) {
      var item = list[i];
      l.push(new OpComponent(item[0], item[1], item[2], AttributeList.unpack(item[3], pool), item[4]));
    }
    return new ComponentList(l);
  }


  it('length calculation', function() {
    assert.equal(new ALinesMutator(sample, pool).length(), 9);
  });

  it('length calculation when mutate in progress', function() {
    var len = new ALinesMutator(clone(sample), pool)
      .insert(new OpComponent('+', 1, 0, null, 'a'))
      .length();
    assert.equal(len, 10);
  });

  it('can build document from scratch', function() {
    function test(lines) {
      var m = new ALinesMutator([], pool);
      lines.map(function(l) {
        new AStringMutator(l, pool).takeRemaining().map(function(c) {
          m.insert(c);
        });
      });
      assert.deepEqual(m.finish(), lines);
    }

    test(sample);
    test([{a:'|1+4', s:'abc\n'}, {a:'|1+5', s:'defg\n'}]);
    test([{a:'+3', s: 'abc'}]);
  });

  it('can decompose into subcomponents', function() {
    var m = new ALinesMutator(sample, pool);
    var res = new ComponentList().concat(m.skip(3).take(6, 2)).pack(pool, true);
    assert.deepEqual(res, {a:'|1+1*1+4|1+1', s:'\ndefg\n'});
  });

  it('can insert multiline ops mid-line', function() {
    var m = new ALinesMutator(clone(sample), pool);
    var res = m.skip(2).insert(new OpComponent('+', 4, 2, null, 'X\nY\n')).finish();

    assert.deepEqual(res, [{a:'*0+1|1+3', s:'abX\n'}, {a:'|1+2', s:'Y\n'}, {a:'|1+2', s:'c\n'}, {a:'*1+4|1+1', s:'defg\n'}]);
  });

  it('can remove multiline ops mid-line', function() {
    var m = new ALinesMutator(clone(sample).concat(sample), pool);
    var removed = m.skip(2).remove(7, 2);

    assert.deepEqual(removed, clist([['+', 2, 1, null, 'c\n'], ['+', 4, 0, '*1', 'defg'], ['+', 1, 1, '', '\n']]));
    assert.deepEqual(m.finish(), [{a:'*0+1+1*0+1|1+3', s:'ababc\n'},{a:'*1+4|1+1', s:'defg\n'}]);
  });

  it('removal between lines create at least 2 ops even if they\'re mergeable', function() {
    var lines = [{a:'|1+4', s:'abc\n'}, {a:'|1+5', s:'defg\n'}];
    var m = new ALinesMutator(lines, []);
    var removed = m.skip(2).remove(7, 2);
    assert.deepEqual(removed, clist([['+', 2, 1, null, 'c\n'], ['+', 5, 1, null, 'defg\n']]));
  });

  it('remove last line should not leave empty line', function() {
    var lines = [{a:'|1+4', s:'abc\n'}, {a:'|1+5', s:'defg\n'}];
    var m = new ALinesMutator(lines, []);
    m.skip(4, 1).remove(5, 1);
    assert.deepEqual(m.finish(), [{a:'|1+4', s:'abc\n'}]);
  });

  it('remove first line should not leave empty line', function() {
    var lines = [{a:'|1+4', s:'abc\n'}, {a:'|1+5', s:'defg\n'}];
    var m = new ALinesMutator(lines, []);
    m.remove(4, 1);
    assert.deepEqual(m.finish(), [{a:'|1+5', s:'defg\n'}]);
  });

  it('remove complete line from the middle', function() {
    var lines = [{a:'|1+4', s:'abc\n'}, {a:'|1+4', s:'def\n'}, {a:'|1+4', s:'ghi\n'}];
    var m = new ALinesMutator(lines, []);
    m.skip(4, 1).remove(4, 1);
    assert.deepEqual(m.finish(), [{a:'|1+4', s:'abc\n'}, {a:'|1+4', s:'ghi\n'}]);
  });

  it('insert newline when line position is 0 but string was mutated', function() {
    var lines = [{"a":"|1+2","s":"a\n"},{"a":"+1","s":"b"}];
    var m = new ALinesMutator(lines, []);
    m.skip(2, 1).remove(1, 0);
    m.insert(new OpComponent('+', 2, 1, null, 'X\n'));
    assert.deepEqual(m.finish(), [{"a":"|1+2","s":"a\n"},{"a":"|1+2","s":"X\n"}]);
  });

  it('remove from midline to the rest of the doc and insert', function() {
    var lines = [{"a":"|1+2","s":"a\n"},{"a":"|1+2","s":"b\n"}];
    var m = new ALinesMutator(lines, []);
    m.skip(1, 0).remove(3, 2);
    m.insert(new OpComponent('+', 1, 0, null, 'X'));
    assert.deepEqual(m.finish(), [{"a":"+2","s":"aX"}]);
  });

  it('joining lines on removal updates current iterator position', function() {
    var m = new ALinesMutator(clone(sample), pool);
    m.skip(3).remove(1, 1);

    assert.deepEqual(m.position(), { ch: 3, line: 0});
  });

  it('can do complex mutations', function() {
    var localSample = [{a:'|1+5', s:'abcd\n'}, {a:'|1+4', s:'efg\n'}];
    var m = new ALinesMutator(clone(localSample), pool);
    assert.deepEqual(m.remove(2), clist([['+', 2, 0, null, 'ab']]));
    m.skip(3, 1);
    m.insert(new OpComponent('+', 4, 2, null, 'X\nY\n'));
    m.skip(2);
    assert.deepEqual(m.remove(2, m.remaining()), clist([['+', 2, 1, null, 'g\n']]));
    m.insert(new OpComponent('+', 1, 1, null, '\n'));

    assert.deepEqual(m.finish(), [{a:'|1+3', s:'cd\n'},{a:'|1+2', s:'X\n'}, {a:'|1+2', s:'Y\n'}, {a:'|1+3', s:'ef\n'}]);
  });

  it('multiline format', function() {
    var localSample = [{a:'|1+5', s:'abcd\n'}, {a:'|1+4', s:'efg\n'}];
    var m = new ALinesMutator(clone(localSample), pool);
    var fop = new OpComponent('=', 8, 2, AttributeList.unpack('*0', pool));
    var res = m.skip(1, 0).applyFormat(fop).finish();

    assert.deepEqual(res, [{a:'+1*0|1+4', s:'abcd\n'}, {a:'*0|1+4', s:'efg\n'}]);
  });
});

