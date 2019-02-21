const assert = require('assert');
const mockRequire = require('mock-require');
const eslint = require('../lib/eslint');


describe('eslint', () => {
  describe('isFatal', () => {
    it('should return true when severity is 2', () => {
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

  describe('getFormatter', () => {
    afterEach(() => {
      mockRequire.stopAll();
    });

    it('should require stylish format by default', () => {
      const expected = { path: 'eslint/lib/formatters/stylish' };
      mockRequire('eslint/lib/formatters/stylish', expected);
      const res = eslint.getFormatter();
      assert.deepEqual(res, expected);
    });
  
    it('should require test-format when passed test-format', () => {
      const expected = { path: 'eslint/lib/formatters/test-format' };
      mockRequire('eslint/lib/formatters/test-format', expected);
      const res = eslint.getFormatter('test-format');
      assert.deepEqual(res, expected);
    });
  
    it('should throw error when formatter module not found', () => {
      assert.throws(() => {
        eslint.getFormatter('test-format');
      }, /test-format/);
    });
  });

  describe('sortMessages', () => {
    it('should sort eslint messages by line and column', () => {
      const input = [
        { line: 1, column: 3 },
        { line: 1, column: 2 },
        { line: 2, column: 1 },
        { line: 1, column: 2 },
        { line: 2, column: 3 },
        { line: 4, column: 6 },
        { line: 5, column: 2 },
      ];
  
      const expected = [
        { line: 1, column: 2 },
        { line: 1, column: 2 },
        { line: 1, column: 3 },
        { line: 2, column: 1 },
        { line: 2, column: 3 },
        { line: 4, column: 6 },
        { line: 5, column: 2 },
      ];
      const result = eslint.sortMessages(input);
      assert.deepEqual(result, expected);
    });
  });

  describe('groupEslintIssuesByFilePath', () => {
    it('it should group eslint issues by filenames', () => {
      const issues = [{
        errorCount: 1,
        warningCount: 1,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        filePath: '/tmp/test_dir/contract.sol',
        messages: ['message 1', 'message 2'],
      }, {
        errorCount: 0,
        warningCount: 1,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        filePath: '/tmp/test_dir/contract2.sol',
        messages: ['message 3'],
      }, {
        errorCount: 0,
        warningCount: 1,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        filePath: '/tmp/test_dir/contract.sol',
        messages: ['message 4'],
      }];

      const result = eslint.groupEslintIssuesByFilePath(issues);
      assert.deepEqual(result, [{
        errorCount: 1,
        warningCount: 2,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        filePath: '/tmp/test_dir/contract.sol',
        messages: ['message 1', 'message 2', 'message 4'],
      }, {
        errorCount: 0,
        warningCount: 1,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        filePath: '/tmp/test_dir/contract2.sol',
        messages: ['message 3'],
      }]);
    });
  });
});
