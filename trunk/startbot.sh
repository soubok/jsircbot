export LD_LIBRARY_PATH=$PWD
export JSHOST_BIN=$PWD
RESTART_CODE=3

rm nohup.out
while
  nice -n 1 nohup authbind $JSHOST_BIN -u 1 -m 30 -n 5 jsircbot.js & echo $! > jsircbot.pid
[ $? = 3 ]
do
  sleep 3
done
