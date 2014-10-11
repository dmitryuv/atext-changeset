var assert = require('assert');
var Position = require('../lib/position');

describe('Positioin', function() {
  it('empty constructor', function() {
    assert.deepEqual(new Position(), { ch: 0, line: 0 });
  });

  it('add', function() {
    assert.deepEqual(new Position(1, 1).add(1, 0), { ch: 2, line: 1 });
    assert.deepEqual(new Position(1, 1).add(1, 1), { ch: 1, line: 2 });
  });

  it('advance', function() {
    assert.deepEqual(new Position(1, 1).advance(1, 1), { ch: 0, line: 2 });
  });

  it('subtract', function() {
    assert.deepEqual(new Position(5, 5).subtract(1, 0), { ch: 4, line: 5 });
    assert.deepEqual(new Position(5, 5).subtract(1, 1), { ch: 5, line: 4 });
  });

  it('compare', function() {
    assert.equal(new Position(1, 0).before(new Position(0, 1)), true);
  });
});