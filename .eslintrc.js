env:
  node: true
  amd: true
  es6: true
extends: 'eslint:recommended'
parser: 'babel-eslint'
parserOptions:
  ecmaVersion: 8
rules:
  indent:
    - error
    - 4
  linebreak-style:
    - error
    - unix
  quotes:
    - error
    - single
  semi:
    - error
    - always
  no-console: 0
