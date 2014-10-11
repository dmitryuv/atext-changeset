var assert = require('assert');
var ADocument = require('../lib/adocument').ADocument;
var AttributeList = require('../lib/attributelist').AttributeList;
var Changeset = require('../lib/changeset');
var OpComponent = require('../lib/opcomponent').OpComponent;
var ComponentList = require('../lib/componentlist').ComponentList;
var Position = require('../lib/position');

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('Changeset', function() {
  var sampleLines = [{a: '*0+2|1+2', s: 'abc\n'}, { a: '+4*1|1+2', s: 'defgh\n'} ];
  var samplePool = [['author', 'x'], ['bold', true], ['italic', true], ['author','y']];
  function clist(list) {
    var l = [];
    for(var i = 0; i < list.length; i++) {
      var item = list[i];
      l.push(new OpComponent(item[0], item[1], item[2], AttributeList.unpack(item[3], samplePool), item[4]));
    }
    return new ComponentList(l);
  }

  function getDoc() {
    return new ADocument(clone(sampleLines), clone(samplePool));
  }

  describe('applyTo', function() {
    function apply(name, cs, expected, err, optDoc) {
      it(name, function() {
        if(err) {
          assert.throws(function() {
            Changeset.unpack(cs).applyTo(optDoc || getDoc());
          }, new RegExp(err));
        }
        else {
          var doc = Changeset.unpack(cs).applyTo(optDoc || getDoc());
          assert.deepEqual(doc.lines, expected);
        }
      });
    }

    // we test most of the mutation procedures in the ALinesMutator-tests
    apply('complex mutation with formatting', 
      {op: 'X:a>1=1^3*0=1*0|1=2*1=4*2|1-2*1|1+3$h\nij\n', p: [['italic', true], ['author', 'y'], ['bold', true], ['author', 'x']], u: 'y'},
      [{a: '*0+1*2|1+3', s: 'abc\n'}, {a: '*3|1+7', s: 'defgij\n'}]
      );

    apply('throws if removed does not match actual', 
      {op: 'X:a<1=1-1$b', p: [], u: 'y'},
      null,
      'not match removed'
      );
  });

  describe('invert', function() {
    it('can invert complex mutation', function() {
      var cs = Changeset.unpack({op: 'X:a>1=1^3*0=1*0|1=2*1=4*2|1-2*1|1+3$h\nij\n', p: [['italic', true], ['author', 'y'], ['bold', true], ['author', 'x']], u: 'y'});
      var newDoc = cs.applyTo(getDoc());
      var inv = cs.invert();

      assert.deepEqual(inv.pack(), { op: 'X:b<1=1^1*0=1^1|1=2^2=4*2|1-3*3|1+2$ij\nh\n',  p: [[ 'author', 'x' ], [ 'italic', true ], [ 'author', 'y' ], [ 'bold', true ] ], u: 'y' });

      var oldDoc = inv.applyTo(newDoc);
      assert.deepEqual(oldDoc, getDoc());
    });
  });

  describe('compose', function() {
    function compose(name, cs1, cs2, res, err) {
      it(name, function() {
        cs1 = Changeset.unpack({op: cs1, p: samplePool});
        cs2 = Changeset.unpack({op: cs2, p: samplePool});
        if(err) {
          assert.throws(function() {
            cs1.compose(cs2);
          }, new RegExp(err));
        } else {
          assert.equal(cs1.compose(cs2).pack(samplePool).op, res);
        }
      });
    }

    compose('simple', 'X:0>3+3$abc', 'X:3>3=3+3$def', 'X:0>6+6$abcdef');
    compose('with newline', 'X:0>2+2$ab', 'X:2>1|1+1$\n', 'X:0>3|1+1+2$\nab');
    compose('delete inserted', 'X:0>3+3$abc', 'X:3<1=1-1$b', 'X:0>2+2$ac');
    compose('delete from format', 'X:3>0*0=3', 'X:3<1=1*0-1$b', 'X:3<1*0=1-1*0=1$b');
    compose('delete from unformat', 'X:3>0^0=3', 'X:3<1=1-1$b', 'X:3<1^0=1*0-1^0=1$b');
    compose('delete inserted and insert new', 'X:0>3+3$abc', 'X:3<1-2+1$abd', 'X:0>2+2$dc');
    // test zip slicer
    compose('delete big + delete small with lines', 'X:8<4-4$abcd', 'X:4<2|2-2$\n\n', 'X:8<6|2-6$abcd\n\n');
    compose('reformat string', 'X:0>4*0+2*1+2$abcd', 'X:4>0*1=1*2=2*0=1', 'X:0>4*0*1+1*0*2+1*1*2+1*0*1+1$abcd');
    compose('throw on removal not match', 'X:0>3+3$abc', 'X:3<1=1-1$c', null, 'not match');
    compose('throw on versions not match', 'X:0>3+3$abc', 'X:4>1+1$c', null, 'not composable');

    compose('format and then remove chars', 'X:4>0*0=2', 'X:4<2*0*1-2$ab', 'X:4<2*1-2$ab');
    compose('remove format and then remove chars', 'X:4>0^0=2', 'X:4<2*1-2$ab', 'X:4<2*0*1-2$ab');
    compose('complete remove & insert, tests split components', 'X:3<3|1-3$12\n', 'X:0>2+2$XY', 'X:3<1|1-3+2$12\nXY');
  });

  describe('transform', function() {
    function transform(name, cs1, cs2, side, res, err) {
      it(name, function() {
        cs1 = Changeset.unpack({op: cs1, p: samplePool});
        cs2 = Changeset.unpack({op: cs2, p: samplePool});
        if(err) {
          assert.throws(function() {
            cs1.transform(cs2);
          }, new RegExp(err));
        } else {
          if(typeof res == 'string') {
            assert.equal(cs1.transform(cs2, side).pack(samplePool).op, res);
          } else {
            assert.deepEqual(cs1.transform(cs2, side)._ops, res);
          }
        }
      });
    }

    transform('insert tie break left', 'X:0>2+2$ab', 'X:0>2+2$cd', 'left', 'X:2>2=2+2$ab');
    transform('insert tie break right', 'X:0>2+2$cd', 'X:0>2+2$ab', 'right', 'X:2>2+2$cd');
    transform('insert tie break by newline', 'X:0>2+2$ab', 'X:0>1|1+1$\n', 'left', 'X:1>2+2$ab');
    transform('insert tie break by newline (no affect of side=right)', 'X:0>2+2$ab', 'X:0>1|1+1$\n', 'right', 'X:1>2+2$ab');
    transform('insert tie break left when both newlines', 'X:0>2|1+1+1$\na', 'X:0>2|1+1+1$\nb', 'left', 'X:2>2|1=1=1|1+1+1$\na');
    transform('insert tie break right when both newlines', 'X:0>2|1+1+1$\nb', 'X:0>2|1+1+1$\na', 'right', 'X:2>2|1+1+1$\nb');
    transform('tie break when one of the ops is insert', 'X:2>1+1$a', 'X:2<1-1$b', 'left', 'X:1>1+1$a');
    transform('tie break when one of the ops is insert (no affect of side=right)', 'X:2>1+1$a', 'X:2<1-1$b', 'right', 'X:1>1+1$a');

    transform('remove when part was removed', 'X:8<4-4$abcd', 'X:8<2-2$ab', 'left', 'X:6<2-2$cd');
    transform('remove part when all was removed', 'X:8<2-2$ab', 'X:8<4-4$abcd', 'left', 'X:4>0');
    transform('remove from other keep', 'X:8<2-2$ab', 'X:8>0*0=4', 'left', 'X:8<2*0-2$ab');
    transform('keep affected by remove', 'X:8>2=8+2$ab', 'X:8<4-4$abcd', 'left', 'X:4>2=4+2$ab');
    transform('keep collapsed by remove', 'X:8>2=4+2$ab', 'X:8<6-6$abcdef', 'left', 'X:2>2+2$ab');
    transform('keep moved by bigger insert', 'X:4>1|1=4+1$a', 'X:4>5+5$bcdef', 'left', 'X:9>1|1=9+1$a');
    transform('longer op should not inject bad keeps into transformed op', 'X:4>1=1-2+3$abcde', 'X:4>4=4|1+4$qwe\n', 'left', clist([['=',1,0,null,''],['-',2,0,null,'ab'],['+',3,0,null,'cde']]));

    transform('both keeps', 'X:4>0*0*1=4', 'X:4>0=2*2*3=2', 'left', 'X:4>0*0*1=2^3*0*1=2');
    transform('push formatting op by insert', 'X:2>0^0*3=2+1$a', 'X:2>4*0+4$abcd', 'left', 'X:6>1=4^0*3=2+1$a');

    transform('remove what was reformatted', 'X:2<2*0*1-2$ab', 'X:2>0^0*2*3=2', 'left', 'X:2<2*1*2*3-2$ab');
  });

  describe('transformRange', function() {
    function range(name, cs, pos, side, res) {
      it(name, function() {
        cs = Changeset.unpack({op: cs, p: samplePool});
        assert.deepEqual(cs.transformPosition(new Position(pos[0], pos[1]), side), new Position(res[0], res[1]));
      });
    }

    range('push by char insert', 'X:4>2=2+2$ab', [3, 0], 'left', [5, 0]);
    range('push by newline insert near pos', 'X:4>2=2|1+2$b\n', [3, 0], 'left', [1, 1]);  //abb\nc_d
    range('push by line insert far away from pos', 'X:4>4|2+2$\n\n', [1, 2], 'left', [1, 4]);
    range('tie break insert left', 'X:4>2=2+2$ab', [2, 0], 'left', [2, 0]);
    range('tie break insert right', 'X:4>2=2+2$ab', [2, 0], 'right', [4, 0]);
    range('remove chars before pos', 'X:8<4-4$abcd', [6, 0], 'left', [2, 0]);
    range('collapse remove range', 'X:8<4=2-4$abcd', [4, 0], 'left', [2, 0]);
    range('collapse remove multiline range', 'X:a<4|1=2=1|2-3$\nb\n', [2, 1], 'left', [1, 1]);
    range('remove multiline range joins pos with cursor', 'X:8<4=2|1-4$abc\n', [1, 1], 'left', [3, 0]);      // 12abc\nd_e
    range('remove multiline range reduces pos lines', 'X:a<4|2-4$a\nb\n', [1, 3], 'left', [1, 1]);
    range('keep does not alter pos', 'X:8>2=8+2$ab', [7, 0], 'left', [7, 0]);
  });
});