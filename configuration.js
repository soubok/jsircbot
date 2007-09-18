function(data) {

	setData( data.server, 'irc.freenode.net' );
	setData( data.port, 6667 );
	setData( data.hostname, '127.0.0.1' ); // try something else

// bot nick
	setData(data.nick, 'TremVipBot');

// ident
	setData(data.ident.opsys, 'UNIX');
	setData(data.ident.userid, 'USERID');
	setData(data.ident.username, 'user_TremVipBot');
	setData(data.ident.realname, 'real_TremVipBot');

// default module
	setData(data.DefaultModule.lagProbeInterval, 1000*60*2);

// configure chans
	setData(data.ChannelModule.joinList, ['#soubok']);

// Configure anti-flood system ( in 10 seconds, we can send 5 messages OR 1456 bytes )
	setData(data.antiflood.maxMessage, 5 );
	setData(data.antiflood.maxBytes, 1456 );
	setData(data.antiflood.interval, 5000 );

// configure DCCReceiver module
	setData(data.DCCReceiverModule.destinationPath, '.' );

// bot operator password
	setData(data.OperatorManagerModule.password, 's6d5vf4qsd6f5vsqs8dv8q' );
}
