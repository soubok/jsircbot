## Start script ##

```
#!/bin/sh
export LD_LIBRARY_PATH=$PWD/../jslibs/opt
export JSHOST_BIN=$PWD/../jslibs/opt/jshost
RESTART_CODE=3
rm nohup.out
while
  nice nohup authbind $JSHOST_BIN -u 1 -n 2 jsircbot.js & echo $! > jsircbot.pid
[ $? = 3 ]
do
  sleep 3
done
```

## Stop script ##

```
#!/bin/sh
kill `cat jsircbot.pid`
rm jsircbot.pid
```

## Memory usage monitor script ##

```
#!/bin/bash
for ((;;)); do
  date
  ps -p `cat jsircbot.pid` -o %mem,vsz,rss,cputime
  sleep 30
done
```