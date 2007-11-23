export LD_LIBRARY_PATH=`pwd`
RESTART_CODE=3

rm nohup.out
while
  nohup authbind ./jshost -u 1 -m 8 jsircbot.js &
  echo $! > jsircbot.pid
[ $? = 3 ]
do
  sleep 3
done
