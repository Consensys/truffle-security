Update `version` in package.json
Check on armlet "respository" value too. Remove git if needed
In shell:

```
$ export TS_VERSION="v1.3.1"
$ make ChangeLog
```

Update `NEWS.md` from ChangeLog


```
$ git commit -m"Get ready for release $TS_VERSION" .
```

git push -u origin HEAD

Add release from https://github.com/ConsenSys/truffle-security/releases/

```
$ git pull
$ npm publish
```
