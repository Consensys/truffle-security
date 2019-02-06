.PHONY: test check lint lint-fix


#: Run lint and then tests
check: lint-fix
	npx mocha test/test*.js

#: same thing as "make check"
test: check

#: Rebuild all
rebuild:
	rm -fr node_modules && npm install --no-progress

#: Rebuild all
distcheck: rebuild check

#: Look for nodejs lint violations
lint:
	npx eslint --rulesdir=tools/eslint-rules lib

#: Look and fix nodejs lint violations
lint-fix:
	npx eslint --fix --rulesdir=tools/eslint-rules lib

RM      ?= rm
GIT2CL ?= git2cl

rmChangeLog:
	rm ChangeLog || true

#: Create a ChangeLog from git via git log and git2cl
ChangeLog: rmChangeLog
	git log --pretty --numstat --summary | $(GIT2CL) >$@
