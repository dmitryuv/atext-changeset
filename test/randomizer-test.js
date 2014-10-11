var atext = require('../lib/sharejs/atext');
var atext_test = require('./randomizer/atext');
var randomizer = require('ot-fuzzer');

describe('randomizer', function() {
  it('passes', function() {
    this.timeout(20000);
    randomizer(atext, atext.generateRandomOp);
  });
});

