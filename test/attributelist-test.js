var AttributeList = require('../lib/attributelist').AttributeList;
var OpAttribute = require('../lib/opattribute').OpAttribute;
var assert = require('assert');

describe('AttributeList', function() {
  it('unpack attributes', function() {
    var pool = {};
    pool[0] = ['moo', 'zoo'];
    pool[parseInt('asdf0', 36)] = ['foo', 'bar'];

    assert.deepEqual(AttributeList.unpack('^0*asdf0', pool), new AttributeList([{opcode: '^', key: 'moo', value: 'zoo'}, {opcode: '*', key: 'foo', value: 'bar'}]));
  });

  it('attribute lists equals', function() {
    var list = [['1','2'],['3','4'],['5','6']]
      .map(function(a) {
        return OpAttribute.format(a[0], a[1]);
      });

    assert.equal(new AttributeList(list).equals(new AttributeList(list.slice().reverse())), true);
    assert.notEqual(new AttributeList(list).equals(new AttributeList(list.slice(1))), true);
  });

  it('clone', function() {
    var copy = new AttributeList([OpAttribute.format('foo', 'bar')]).clone();
    assert.deepEqual(copy, new AttributeList([OpAttribute.format('foo', 'bar')]));
  });

  describe('pack', function() {
    var pool = [['foo','true'], ['bar','false'], ['foo', '1']];
    function testPack(name, atts, res, err) {
      it(name, function() {
        var unpacked = AttributeList.unpack(atts, pool);
        if(err) {
          assert.throws(function() {
            unpacked.pack(pool);
          }, new RegExp(err));
        } else {
          assert.equal(unpacked.pack(pool), res || atts);
        }
      });
    }
    testPack('sort Ns', '*1*0', '*0*1');
    testPack('reorder removes before formats','*0^2', '^2*0'); // reorder deletes before insersts
    testPack('throws if multiple ops on the same N', '*0^0', null, 'on the same attrib key');
    testPack('throws if multiple formats or removes ont he same key', '*0*2', null, 'multiple insertions');
  });

  describe('attribute operations', function() {
    var pool = [['foo','true'], ['bar','false'], ['foo', '1'], ['author','x'], ['author','y'], ['author','z']];
    function alist(atts) {
      return AttributeList.unpack(atts, pool);
    }
    
    function testFunc(name, func, att1, att2, res, isCompose, err) {
      it(name, function() {
        if(err) {
          assert.throws(function() {
            alist(att1)[func](alist(att2), isCompose).pack(pool);  
          }, new RegExp(err));
        } else {
          assert.equal(alist(att1)[func](alist(att2), isCompose).pack(pool), res);
        }
      });
    }

    describe('merge', function() {
      function testMerge(name, att1, att2, res, err) {
        testFunc(name, 'merge', att1, att2, res, null, err);
      }

      testMerge('replace key with same opcode', '*0*1', '*2', '*1*2');
      testMerge('do not replace if different opcode', '*0*1', '^2', '^2*0*1');
      testMerge('add new attrib', '*0*1', '*3', '*0*1*3');
      testMerge('throws for mutual ops', '*0*1', '^0', null, 'mutual ops');
    });

    describe('compose', function() {
      function testCompose(name, att1, att2, res, isCompose, err) {
        testFunc(name, 'compose', att1, att2, res, isCompose, err);
      }
     
      testCompose('insert over empty', '', '*0', '*0', true);
      testCompose('remove over empty', '', '^0', '^0', true);
      testCompose('combine insertions', '*0', '*1', '*0*1', true);
      testCompose('combine insert+remove diff keys', '*0', '^1', '^1*0', true);
      testCompose('collapse insert+remove same key', '*0*1', '^0', '*1', true);
      testCompose('collapse remove+insert same key', '^0', '*0', '', true);
      testCompose('sort output', '*0^2', '*1', '^2*0*1', true);

      testCompose('should throw on duplicate num insert', '*0', '*0', null, true, 'identical');
      testCompose('should throw on duplicate num remove', '^0', '^0', null, true, 'identical');
      testCompose('should throw on duplicate key insert', '*0', '*2', null, true, 'multiple');
      testCompose('should throw on duplicate key remove', '^0', '^2', null, true, 'multiple');
      testCompose('should throw on applying remove to non-existing att', '*0', '^1', null, false, 'non-existing');
    });

    describe('transform', function() {
      function testTransform(name, att1, att2, res, err) {
        testFunc(name, 'transform', att1, att2, res, null, err);
      }

      testTransform('do nothing after empty atts', '*0*1', '', '*0*1');
      testTransform('do nothing for empty atts', '', '*0*1', '');
      testTransform('ignore second insertion', '*0', '*0', '');
      testTransform('ignore second deletion', '^0', '^0', '');
      testTransform('replace insertion with same key', '*2', '*0', '^0*2');
      testTransform('replace replaced insertion with same key', '^3*4', '^3*5', '^5*4');
      testTransform('take lexically earlier value left', '*2', '*0', '^0*2');
      testTransform('take lexically earlier value right', '*0', '*2', '');

      testTransform('throw on removal of the same key but different value', '^0', '^2', null, 'invalid');
      testTransform('throw on opposite removal on N', '^0', '*0', null, 'invalid');
      testTransform('throw on opposite insertion on N', '*0', '^0', null, 'invalid');
      testTransform('throw on removal of inserted key with different value', '^2', '*0', null, 'invalid');
      testTransform('throw on removal of removed key with different value', '^2', '^0', null, 'invalid');
    });
    
    describe('format', function() {
      function testFormat(name, att1, att2, res, err) {
        testFunc(name, 'format', att1, att2, res, null, err);
      }

      testFormat('drop format if exists', '*0*1', '*0*3', '*3');
      testFormat('format empty attributes', '', '*0', '*0');
      testFormat('keep removes if exists', '*0*1', '^0*3', '^0*3');
      testFormat('drop removes if not exists', '*0', '^1*3', '*3');
      testFormat('replace same key with new value', '*0*1', '*2*3', '^0*2*3');
    });

    describe('invert', function() {
      function testInvert(name, att, except, res, err) {
        testFunc(name, 'invert', att, except, res, null, err);
      }
      testInvert('simple', '^1^3*0', null, '^0*1*3');
      testInvert('with exceptions', '^1^3*0', '*0*3', '*0*1*3');
    });
  });
});
