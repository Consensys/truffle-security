.PHONY: test check lint lint-fix


#: Run lint and then tests
check: lint
	npx mocha test/test*.js

#: same thing as "make check"
test: check

#: Look for nodejs lint violations
lint:
	npx eslint --rulesdir=tools/eslint-rules lib

#: Look and fix nodejs lint violations
lint-fix:
	npx eslint --fix --rulesdir=tools/eslint-rules lib
