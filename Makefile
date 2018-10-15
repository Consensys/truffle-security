.PHONY: test check lint lint-fix


#: Run lint and then tests
check: lint
	npx tap test

#: same thing as "make check"
test: check

#: Look for nodejs lint violations
lint:
	npx eslint --rulesdir=tools/eslint-rules lib test

#: Look and fix nodejs lint violations
lint-fix:
	npx eslint --fix --rulesdir=tools/eslint-rules lib test
