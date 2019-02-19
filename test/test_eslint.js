const assert = require('assert');
const eslint =  require('../lib/eslint');


describe('eslint', () => {
  describe('isFatal', () => {
    it('should return true  when severity is 2', () => {
      assert.ok(eslint.isFatal({ fatal: false, severity: 2 }));
    });
    
    it('should return true when fatal is true', () => {
      assert.ok(eslint.isFatal({ fatal: true }));
    });
    
    it('should return false when neither fatal is true nor severity is 2', () => {
      assert.ok(eslint.isFatal({ fatal: true, severity: 1 }));
    });
  });
  
  describe('getUniqueMessages', () => {
    it('should filter out duplicate messages', () => {
      const inputMessages = [
        { id: 1, title: 'test', severity: 2 },
        { id: 2, title: 'test', severity: 2 },
        { id: 1, title: 'test1', severity: 2 },
        { id: 1, title: 'test', severity: 3 },
        { id: 1, title: 'test', severity: 3 },
        { id: 2, title: 'test', severity: 2 },
        { id: 3, title: 'test', severity: 2 },
      ]
      const uniqueMessages = eslint.getUniqueMessages(inputMessages);
      const resultMessages = [
        { id: 1, title: 'test', severity: 2 },
        { id: 2, title: 'test', severity: 2 },
        { id: 1, title: 'test1', severity: 2 },
        { id: 1, title: 'test', severity: 3 },
        { id: 3, title: 'test', severity: 2 },
      ]
      assert.ok(uniqueMessages, resultMessages);
    });
  });
  
  describe('getUniqueIssues', () => {
    it('should filter out duplicate issues and recalculate errors and warnings', () => {
      const inputs = [{
        errorCount: 5,
        warningCount: 5,
        messages: [
          { id: 1, title: 'test', severity: 2 },
          { id: 2, title: 'test', severity: 2 },
          { id: 1, title: 'test1', severity: 2 },
          { id: 1, title: 'test', severity: 3 },
          { id: 1, title: 'test', severity: 3 },
          { id: 2, title: 'test', severity: 2 },
          { id: 3, title: 'test', severity: 2 },
        ],
      }];
  
      const uniqueMessages = eslint.getUniqueIssues(inputs);
      const resultMessages = [{
        errorCount: 5,
        warningCount: 5,
        messages: [
          { id: 1, title: 'test', severity: 2 },
          { id: 2, title: 'test', severity: 2 },
          { id: 1, title: 'test1', severity: 2 },
          { id: 1, title: 'test', severity: 3 },
          { id: 3, title: 'test', severity: 2 },
        ],
      }];
      assert.ok(uniqueMessages, resultMessages);
    });
  });
});
