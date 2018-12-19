const assert = require('assert');
const rewire = require('rewire');

const mythrilRewired = rewire('../lib/mythril');

describe('mythril', function() {
    describe('messageMessage', function() {
        const massageMessage = mythrilRewired.__get__('massageMessage');

        it('should display empty message', () => {
            const mess = massageMessage('');
            assert.equal(mess, '');
        });

        it('should display "no message"', () => {
            const mess = massageMessage();
            assert.equal(mess, 'no message');
        });

        it('should display first sentence', () => {
            const testMessage = 'Test string. This will not be shown.';
            const mess = massageMessage(testMessage);
            assert.equal(mess, 'Test string.');
        });

        it('should remove illegal characters', () => {
            const testMessage = '`Test`\n`string`.';
            const mess = massageMessage(testMessage);
            assert.equal(mess, '\'Test\' \'string\'.');
        });
    });
});
