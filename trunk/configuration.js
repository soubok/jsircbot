function(data) {
	
	//function DateString() let ( d = new Date ) d.getFullYear() + StringPad(d.getMonth()+1,2,'0') + StringPad(d.getDate(),2,'0');
	//var thisSession = 'jsircbot_'+(Now())+'.log'; // used to create ONE log file by session

	var sessionLogFileName = './jsircbot_'+(new Date).toLocaleFormat('%Y-%m-%d,%H.%M.%S')+'.log';

	setData( data.logFilter, [
		[ MakeLogFile(function() sessionLogFileName, false), LOG_ALL - LOG_NET ],
		[ MakeLogScreen(), LOG_FAILURE | LOG_ERROR | LOG_WARNING ]
	]);
	

	setData( data.moduleList, [
		'file:///./httpServer.jsmod',
/*
		'file:///./default.jsmod',
		'file:///./channel.jsmod',
		'file:///./dccChat.jsmod',
		'file:///./botCmd.jsmod',
		'file:///./Tremulous.jsmod',
		'file:///./operator.jsmod',
*/

//		'file:///./',
/*
//		'http://jsircbot.googlecode.com/svn/trunk/serverQuery.jsmod'

                'http://jsircbot.googlecode.com/svn/trunk/default.jsmod',
                'http://jsircbot.googlecode.com/svn/trunk/channel.jsmod',
                'http://jsircbot.googlecode.com/svn/trunk/ctcp.jsmod',
                'http://jsircbot.googlecode.com/svn/trunk/botCmd.jsmod',
                'http://jsircbot.googlecode.com/svn/trunk/dccChat.jsmod',
                'http://jsircbot.googlecode.com/svn/trunk/operator.jsmod',
                'http://jsircbot.googlecode.com/svn/trunk/commandEvent.jsmod',
                'http://jsircbot.googlecode.com/svn/trunk/freenode.jsmod',
//              'http://jsircbot.googlecode.com/svn/trunk/Tremulous.jsmod',
                'http://jsircbot.googlecode.com/svn/trunk/gather.jsmod',
                'http://jsircbot.googlecode.com/svn/trunk/miscellaneous.jsmod',
                'http://jsircbot.googlecode.com/svn/trunk/vipInvitations.jsmod'

*/
	]);

	setData( data.serverList, [
		'irc.freenode.net:6666-6667',
		'chat.eu.freenode.net:6666-6667',
		'204.11.244.21:6666-6667',
	]);
	setData( data.connectTimeout, 1*SECOND );
	setData( data.serverRetry, 2 );
	setData( data.serverRetryPause, 0.5*SECOND );


//	setData( data.server, 'irc.freenode.net' );
//	setData( data.port, 6667 );

	setData( data.hostname, '127.0.0.1' ); // try something else

// bot nick
	setData(data.wishNick, 'TremVipBot');

// ident
	setData(data.ident, true);
	setData(data.ident.opsys, 'UNIX');
	setData(data.ident.userid, 'USERID');
	setData(data.ident.username, 'user_jsircbot');
	setData(data.ident.realname, 'real_jsircbot');

// default module
	setData(data.moduleLoadRetry, 3);
	setData(data.moduleLoadRetryPause, 5*SECOND);

// default module
	setData(data.DefaultModule.lagProbeInterval, 2*MINUTE);
	setData(data.DefaultModule.wishNickRetryInterval, 5*MINUTE);

// configure chans
	setData(data.ChannelModule.joinList, ['#soubok']);

// Configure anti-flood system ( in 10 seconds, we can send 5 messages OR 1456 bytes )
//	setData(data.antiflood.maxMessage, 5 ); // 5
//	setData(data.antiflood.maxBytes, 1456 ); // 1456
//	setData(data.antiflood.interval, 5*SECOND ); // 5*SECOND
	setData(data.antiflood.maxLength, 2500 );
	setData(data.antiflood.monitorPeriod, 40*SECOND );
	setData(data.antiflood.messageOverload, 54 );  // TCP/IP packet overload

// configure DCC
	setData(data.DCC.maxDCCConnections, 32 );
	setData(data.DCC.portRange, '1024-2048' );
	setData(data.DCC.requestTimeout, 30*SECOND );

// configure DCCReceiver module
	setData(data.DCCReceiverModule.destinationPath, '.' );

// bot operator password
	setData(data.OperatorManagerModule.password, '******' );
	
// CommandEvent Module
	setData(data.CommandEventModule.maxServerReplyInterval, 10*SECOND );
	setData(data.CommandEventModule.maxUserReplyInterval, 30*SECOND );

// freenodeModule
	setData(data.freenodeModule.maxServiceBotReply, 15*SECOND );
	setData(data.freenodeModule.nickServ, 'NickServ!NickServ@services.' );
	setData(data.freenodeModule.chanServ, 'ChanServ!ChanServ@services.' );
	setData(data.freenodeModule.mainNick, 'jsircbot' );
	setData(data.freenodeModule.password, '********' );

// bot commands configuration
	setData(data.BotCmdModule.userFlood, [3, 10*SECOND]);
	setData(data.BotCmdModule.channelFlood, [10, 10*SECOND]);
	setData(data.BotCmdModule.config, {
		qc:[ /#cy|#trem-fr/, /.*/, 0, [3, 5*SECOND] ], // [allowed_channel_regexp, alowed_nick_regexp, 0:everyone 1:voice 2:operator, [how_many_messages, how_many_time]]
		hl:[ /#cy/, /.*/, 1, [10, 10*SECOND] ],
		gather:[ /#cy/, , 2 ]
	});

// web server
	setData(data.webServerModule.port, 80);
	setData(data.webServerModule.bind, '127.0.0.1');
	setData(data.webServerModule.socketBackLog, 2); // socketBackLog is the maximum length of the queue of pending connections.
	setData(data.webServerModule.maxConnections, 10);
	setData(data.webServerModule.maxConnectionsPerPeer, 2);
	setData(data.webServerModule.incomingConnectionRatePerPeer, [10, 3*SECOND]);
	setData(data.webServerModule.connectionKeepAliveTimeout, 100*SECOND);
	setData(data.webServerModule.connectionKeepAliveMax, 1000);
	setData(data.webServerModule.connectionDataRate, [10*KILOBYTE, 1*SECOND]);
	setData(data.webServerModule.maxRequestRate, [150, 2*SECOND]);

	setData(data.webServerModule.maxTerminal, 10);
//	setData(data.webServerModule.maxTerminalPerPeer, 2); // (TBD)

	setData(data.webServerModule.consoleSessionTimeout, 15*MINUTE);
	setData(data.webServerModule.consolePasword, '**********');

}
