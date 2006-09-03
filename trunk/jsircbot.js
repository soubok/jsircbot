/*
rfc: rfc2812.txt
rfc: rfc2813.txt
*/

exec('deflib.js');
LoadModule('jsnspr');

exec('dataObject.js');
exec('io.js');
exec('ident.js');


var log = new function() {

	var _time0 = IntervalNow();
	var _file = new File('ircbot.log');
	_file.Open( File.CREATE_FILE + File.WRONLY + File.APPEND );
	
	this.Write = function( data ) {
		
		var t = IntervalNow() - _time0;
		_file.Write( t + ' : ' +data );
	}
	
	this.WriteLn = function( data ) {
		
		this.Write( data + '\n' );
	}

	this.Close = function() {
		
		_file.Close();
	}
}


///////////////////////////////////////////////////////


var NumericCommand = exec('NumericCommand.js');

function Time() {

	return IntervalNow(); //return (new Date()).getTime(); // in ms
}


function FloodControlSender( max, time, rawSender ) {

	var _count = max;
	var _time = Time();
	var _queue = [];
	
	function Process() {
	
		var buffer = '';
		for ( ; _count > 0 && _queue.length > 0 ; _count-- )
			buffer += _queue.shift();
		if ( buffer.length )
			rawSender(buffer);
	}
	
	function timeout() {

		_count = max;
		Process(); // process unsent datas
		io.AddTimeout( time, timeout );
	}
	
	io.AddTimeout( time, timeout );
		
	this.Send = function( line, bypassAntiFlood ) {
		
		if ( bypassAntiFlood ) {
		
			_count--;
			rawSender(line);
		} else {
		
			line != undefined && _queue.push(line);
			Process();
		}
	}
}


function IRCClient( server, port ) {

	var _this = this;
	var _socket;
	var _receiveBuffer = '';
	var _listeners = {};
	var _modules = [];
	var _data = newDataNode();
	var _api = {};
	
	setData( _data.hostname, '127.0.0.1' );
	setData( _data.username, 'no_user_name' );
	setData( _data.realname, 'no real name' );
	setData( _data.opsys, 'UNIX' ); // identd
	setData( _data.userid, 'USERID' ); // identd
	
	
	var _sender = new FloodControlSender( 10, 20000, function(buffer) {
	
		_socket.Send( buffer );
		setData( _data.lastMessageTime, Time() );
	});


	this.Send = function( message, bypassAntiFlood ) {

		log.WriteLn( '-> '+message );
		_sender.Send( message+'\r\n', bypassAntiFlood );
	}

	this.AddMessageListener = function( command, func ) {
		
		(_listeners[command] || (_listeners[command]=[])).push(func);
	}
	
	this.RemoveMessageListener = function( command, func ) {
	
		var list = (_listeners[command] || (_listeners[command]=[]));
		var pos = list.indexOf(func)
		pos != -1 && list.splice( pos, 1 );
	}

	this.FireMessageListener = function( command, arg ) {

		for ( var [,l] in _listeners[command] || (_listeners[command]=[]) )
			l.apply(this,arg);
	}

	this.NotifyModule = function( event ) {
		
		log.WriteLn( '== '+event );
		for ( var [i,m] in _modules )
			m[event] && m[event]();
	}
	

	this.DispatchMessage = function( message ) {
		
		var prefix = message.indexOf( ':' );
		var trailing = message.indexOf( ':', 1 );
		var args = message.substring( prefix?0:1, trailing>0?trailing-1:message.length ).split(' ');
		if (prefix)
			args.unshift( undefined );
		if ( trailing>0 )
			args.push( message.substring( trailing+1 ) );
		if ( !isNaN( args[1] ) )
			args[1] = NumericCommand[Number(args[1])];

		log.WriteLn( '<- ' + args );
		this.FireMessageListener( args[1], args );
//		log.WriteLn( dumpData( _data ) );
		
	}
	

	function onSocketReadable(s) {

		var buf = _socket.Recv();
		if ( buf.length == 0 ) {
	
			_this.NotifyModule( 'OnDisconnect' );
			delete s.readable;
			s.Close();
			io.RemoveDescriptor(s);
			return;
		}

		_receiveBuffer += buf;

		var eol;
		while ( (eol=_receiveBuffer.indexOf('\r\n')) != -1 ) {

			_this.DispatchMessage( _receiveBuffer.substring( 0, eol ) )
			_receiveBuffer = _receiveBuffer.substring( eol+2 ); // +2 for '\r\n';
		}
	}

	this.Connect = function() {

		setData( _data.server, server );
		setData( _data.port, port );
		setData( _data.connectTime, Time() );

		_socket = new Socket();
		io.AddDescriptor(_socket);
		_socket.Connect( server, port );
		_socket.writable = function() {
		
			delete _socket.writable;
			_socket.readable = onSocketReadable;
			_this.NotifyModule( 'OnConnect' );
		}
	}
	
	this.AddModule = function( mod ) {
		
		mod.AddMessageListener = this.AddMessageListener;
		mod.RemoveMessageListener = this.RemoveMessageListener;
		mod.Send = this.Send;
		mod.data = _data;
		mod.api = _api;		
		mod.InitModule(mod);
		_modules.push( mod );
	}
	
	
	this.Close = function() {
		
		this.NotifyModule( 'OnClose' );
		_socket.linger = 1000;
		_socket.Close();
		io.RemoveDescriptor(_socket);
	}
}


///////////////////////////////////////////////// MODULES /////////////////////////////////////////////


function DefaultModule( nick ) {
	
// [TBD] autodetect max message length ( with a self sent mesage )
// [TBD] autodetect flood limit

	this.OnConnect = function() {
		
		var data = this.data;
		Ident( io, function(identRequest) { return( identRequest + ' : '+getData(data.userid)+' : '+getData(data.opsys)+' : '+nick+'\r\n' ) }, 2000 );
		this.Send( 'USER '+getData(data.username)+' '+getData(data.hostname)+' '+getData(data.server)+' :'+getData(data.realname) );
		this.Send( 'NICK '+nick );
	} 
	
	this.OnClose = function() {
	
		this.Send( 'QUIT :', true );
	}

	this.InitModule = function(module) {
	
		module.api.privmsg = function( to, message ) {
			
			module.Send( 'PRIVMSG '+to+' :'+message );
		}



		this.AddMessageListener( 'RPL_WELCOME', function( from, command, to ) {

			setData( module.data.nick, to );
			module.Send( 'USERHOST ' + to );
		});

		this.AddMessageListener( 'RPL_USERHOST', function( from, command, to, host ) {
			
			var [,hostinfo] = host.split('=');
			setData( module.data.userhost, hostinfo.substr(1) ); // hostinfo[0] = '+' or '-' : AWAY message set
		});
		

/* same info in RPL_USERHOST
		function firstModeMessage( who, command, what, modes ) {
			
			var nick = who.substring( 0, who.indexOf('!') ); // [TBD] try to auto extract this

			if ( nick == getData(module.data.nick) ) { // self
				
				setData( module.data.fullnick, who );
				this.RemoveMessageListener( 'MODE', firstModeMessage );
			}
		}
		this.AddMessageListener( 'MODE', firstModeMessage );
*/

		this.AddMessageListener( 'ERR_ERRONEUSNICKNAME', function() {
		  
		  //.Close();
		  // ...try to find server nick policy
		});

		this.AddMessageListener( 'ERR_NICKNAMEINUSE', function() {
		
			var tmpNick = 'tmp'+Math.random().toString(16).substr(2);
			this.Send( 'NICK '+tmpNick );

		  // ...try a random nick, then, when ready, try a better nick
		});

		this.AddMessageListener( 'PING', function( prefix, command, arg ) {

			module.Send( 'PONG '+arg );
		});


		// irc.clockworkorange.co.uk- on 1 ca 1(2) ft 10(10) tr
		// where:
		//  on = Number of globally connected clients including yourself from your IP-number.
		//  ca = Connect Attempts, You have tried once, after 2 sequential connects you get throttled.
		//  ft = Free Targets. This is how many different people you may contact at once, also see 3.10
		//  tr = Targets Restored. Your targets are kept for 2 minutes or until someone else from your IP logs on. 
		//       This stops you from “refilling” your free targets by reconnection.	
		var oncafttrExpr = new RegExp('^on ([0-9]+) ca ([0-9]+)\\(([0-9]+)\\) ft ([0-9]+)\\(([0-9]+)\\) *(tr)?$'); // http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Guide:Writing_a_Regular_Expression_Pattern
		
		function oncafttrNotice( from, command, to, message ) {

			if ( message.substr(0,2) == 'on' ) {

				var res = oncafttrExpr(message);
				if ( res == null )
					return;
				//print( res );
				this.RemoveMessageListener( 'NOTICE', oncafttrNotice );
			}
		}

		this.AddMessageListener( 'NOTICE', oncafttrNotice );
		
	}
}


/////////////

function ChanModule( _channel ) {

	this.InitModule = function(module) {

		this.AddMessageListener( 'RPL_WELCOME', function() {

			module.Send( 'JOIN ' + _channel );
		});

		this.AddMessageListener( 'JOIN', function( who, command, channel ) { // :cdd_etf_bot!~cdd_etf_b@nost.net JOIN #soubok

			if ( channel != _channel )
				return;
				
			var nick = who.substring( 0, who.indexOf('!') ); // [TBD] try to auto extract this

			if ( nick == getData(module.data.nick) ) { // self

				setData( module.data.channel[channel], true );

				module.Send( 'MODE '+_channel ); // request modes
				module.Send( 'MODE '+_channel+' +b' ); // request banlist
			} else {

				setData( module.data.channel[channel].names[nick], true );
			}
		});

		this.AddMessageListener( 'RPL_BANLIST', function( from, command, to, channel, ban, banBy, time ) {

			setData( module.data.channel[_channel].bans[ban], true );
		});

		this.AddMessageListener( 'PART', function( who, command, channel ) {

			if ( channel != _channel )
				return;

			var nick = who.substring( 0, who.indexOf('!') ); // [TBD] try to auto extract this
			if ( nick == getData(module.data.nick) )
				delData( module.data.channel[_channel] );
			else
				delData( module.data.channel[_channel].names[nick] );
		});

		this.AddMessageListener( 'QUIT', function( who, command ) {

			var nick = who.substring( 0, who.indexOf('!') );
			delData( module.data.channel[_channel].names[nick] );
		});

		this.AddMessageListener( 'NICK', function( who, command, newNick ) {

			var nick = who.substring( 0, who.indexOf('!') );

	//		renameData( this.data.channel[_channel].names, nick,newNick );
			moveData( module.data.channel[_channel].names[nick], module.data.channel[_channel].names[newNick] );
		});

		this.AddMessageListener( 'RPL_NOTOPIC', function( channel ) {

			if ( channel != _channel )
				return;
			delData( module.data.channel[_channel].topic );
		});

		this.AddMessageListener( 'TOPIC', function( from, command, channel, topic ) {

			if ( channel != _channel )
				return;
			setData( module.data.channel[_channel].topic, topic );
		});

		this.AddMessageListener( 'RPL_TOPIC', function( from, command, to, channel, topic ) {

			if ( channel != _channel )
				return;
			setData( module.data.channel[_channel].topic, topic );
		});

		this.AddMessageListener( 'RPL_CHANNELMODEIS', function( from, command, to, channel, modes /*, ...*/ ) {

			if ( channel != _channel ) // can be a user mode OR a mod for another channel
				return;

			var args = [];
			for ( var i = 5; i < arguments.length; i++)
				args[i-5] = arguments[i];
			module._ParseModes( modes, args, module.data.channel[_channel] );
		});

		this.AddMessageListener( 'MODE', function( who, command, what, modes /*, ...*/ ) {

			if ( what != _channel ) // can be a user mode OR a mod for another channel
				return;

			var args = [];
			for ( var i = 4; i < arguments.length; i++)
				args[i-4] = arguments[i];
			module._ParseModes( modes, args, module.data.channel[_channel] );
		});

		this._ParseModes = function( modes, args, chanData ) {
		
			var simpleMode = { i:'inviteOnly', t:'topicByOp', p:'priv', s:'secret', m:'moderated', n:'noExternalMessages', r:'reop', C:'noCtcp', N:'noExternalNotice'  };
			var argPos = 0;
			var pos = 0;
			var set;
			var c;
			while ( (c = modes.charAt(pos)) != '' ) {

				switch(c) {
					case '+' :
						set = true;
						break;
					case '-' :
						set = false;
						break;
					case 'k' :
						setData( chanData.key, args[argPos++] );
						break;
					case 'o' :
						setData( chanData.names[args[argPos++]].operator, set );
						break;
					case 'v' :
						setData( chanData.names[args[argPos++]].voice, set );
						break;
					case 'l' :
						if ( set )
							setData( chanData.userLimit, args[argPos++] );
						else
							delData( chanData.userLimit );
						break;
					case 'b' :
							setData( chanData.bans[args[argPos++]], set );
						break;
					default:
						setData( chanData[simpleMode[c]], set );
				}
				pos++;
			}		
		}

		this.AddMessageListener( 'RPL_NAMREPLY', function( from, command, to, type, channel, list ) {

			if ( channel != _channel ) // [TBD] use a kind of filter to avoid doing this (eg. register RPL_NAMREPLY with #chan as filter )
				return;
				
			var chanData = module.data.channel[_channel];

			if (type == '@')
				setData( chanData.secret, true );

			if (type == '*')
				setData( chanData.priv, true );

			var names = list.split(' ');
			for ( var [,name] in names ) {
			
				var nameOnly;
				switch( name[0] ) {

					case '+':
						nameOnly = name.substring(1);
						setData( chanData.names[nameOnly].voice, true );
						break;
					case '@':
						nameOnly = name.substring(1);
						setData( chanData.names[nameOnly].operator, true );
						break;
					default:
						nameOnly = name;
				}
				setData( chanData.names[nameOnly], true );
			}
		});
	} // InitModule
}

////////// CTCP module //////////

function CTCPModule() {

	function lowLevelCtcpQuote(data) { // NUL, NL, CR, QUOTE -> QUOTE 0, QUOTE n, QUOTE r, QUOTE QUOTE
		
//		var tr={ '\0':'\0200', '\r':'\020r', '\n':'\020n', '\020':'\020\020' };
		var out='';
		for ( var [,c] in data )
			switch (c) {
				case '\0':
					out+='\0200';
					break;
				case '\r':
					out+='\020r';
					break;
				case '\n':
					out+='\020n';
					break;
				case '\020':
					out+='\020\020';
					break;
				default:
					out+=c;
			}
		return out;		
	}

	function lowLevelCtcpDequote(data) {

		var out='';
		var len=data.length;
		for ( var i=0; i<len; i++ )
			if ( data[i]=='\020' )
				switch (data[++i]) {
				case '0':
					out+='\0';
					break;
				case 'r':
					out+='\r';
					break;
				case 'n':
					out+='\n';
					break;
				case '\020':
					out+='\020';
					break;
				}
			else
				out+=data[i];
		return out;		
	}

	function ctcpLevelQuote(data) {

		var out='';
		for ( var [,c] in data )
			switch (c) {
			case '\1':
				out+='\\a';
				break;
			case '\\':
				out+='\\\\';
				break;
			default:
				out+=c;
			}
		return out;
	}

	function ctcpLevelDequote(data) {

		var out='';
		var len=data.length;
		for ( var i=0; i<len; i++ )
			if ( data[i]=='\\' )
				switch (data[++i]) {
				case '\\':
					out+='\\';
					break;
				case 'a':
					out+='\1';
					break;
				}
			else
				out+=data[i];
		return out;		
	}
	

	this.InitModule = function(module) {

		var _ctclListenerList=[];
		
		module.api.AddCtcpListener = function(func) {

			_ctclListenerList.push(func);
		}
		
		module.api.RemoveCtcpListener = function(func) {

			var pos = _ctclListenerList.indexOf(func)
			pos != -1 && list.splice( pos, 1 );
		}

		function FireCtcpListener( from, to, tag, data ) {

			for ( var [,l] in _ctclListenerList )
				l.apply(this,arguments);
		}
		
		function DispatchCtcpMessage( from, to, ctcpMessage ) {
		
			var pos = ctcpMessage.indexOf(' ');
			var tag, data;
			if ( pos == -1 )
				tag = ctcpMessage;
			else {
				tag = ctcpMessage.substring( 0, pos );
				data = ctcpMessage.substring( pos+1 );
			}
			FireCtcpListener( from, to, tag, data );
		}
		
		module.api.CtcpQuery = function(who, tag, data) {
			
			module.Send( 'PRIVMSG '+who+' :'+lowLevelCtcpDequote( '\1'+ctcpLevelQuote(tag+' '+data)+'\1' ) );
		}
		
		module.api.CtcpResponse = function(who, tag, data) {
			
			module.Send( 'NOTICE '+who+' :'+lowLevelCtcpDequote( '\1'+ctcpLevelQuote(tag+' '+data)+'\1' ) );
		}

		module.AddMessageListener( 'PRIVMSG', function( from, command, to, msg ) { // ctcp responses

			var even = 0;
			while (true) {
				var odd = msg.indexOf('\1',even);
				if ( odd != -1 ) {
					odd++;
					var even = msg.indexOf('\1',odd);
					if ( even != -1 ) { // ok, we've got a first ctcp message

						DispatchCtcpMessage( from, to, msg.substring( odd, even ) );
						even++;
					} else break;
				} else break;
			}
		});
		
// CTCP PING
		function CtcPing(from,to,tag,data) {
			
			var nick = from.substring( 0, from.indexOf('!') );

			if ( tag=='PING' )
				module.api.CtcpResponse( nick, tag, data );
		}
		module.api.AddCtcpListener( CtcPing );
	}
	
	
}

////////// test module //////////


function Test() {

	this.InitModule = function(module) {

		this.AddMessageListener( 'PRIVMSG', function( from, command, to, msg ) {

			var nick = from.substring( from.indexOf('!')+1 );

			if ( msg == '!!dump' ) {

				//module.Send( 'PRIVMSG '+nick+' :'+dumpData(module.data) );
				print(dumpData(module.data), '\n');
			}

			if ( msg == '!!flood' ) {

				for ( var i = 0; i<100; i++ )
				  module.Send( 'PRIVMSG '+nick+' :XxxxxxxxXxxxxxxxXxxxxxxxXxxxx '+i );
			}
		});

		addDataListener( module.data.channel['#soubok'].names['soubok'], function(info) {
		
			module.Send( 'PRIVMSG soubok :hi soubok! ('+info+')' );
//			module.Send( 'PRIVMSG soubok :'+module.api.Ctcp('VERSION') );
			
		});
	}
}

////////// DCCReceiver //////////


function DCCReceiver( destinationPath ) {

	function IntegerToIp(number) {
	
		return (number>>24 & 255)+'.'+(number>>16 & 255)+'.'+(number>>8 & 255)+'.'+(number & 255);
	}
	
	function Uint32ToNetworkOrderString(number) {
		
		return String.fromCharCode(number>>24 & 255)+String.fromCharCode(number>>16 & 255)+String.fromCharCode(number>>8 & 255)+String.fromCharCode(number & 255);
	}
	
	function DCCReceive( ip, port, fileName, timeout ) { // receiver is a client socket / sender is the server
		
		var dccSocket = new Socket();
		var file = new File(fileName);
		file.Open( File.CREATE_FILE + File.WRONLY );
		
		dccSocket.Connect( ip, port );
		io.AddDescriptor( dccSocket );

		var totalReceived = 0;
		var timeoutId;
		
		function Finalize() {
			
			io.RemoveTimeout(timeoutId);
			dccSocket.Close();
			io.RemoveDescriptor( dccSocket );
			file.Close();
		}

		timeoutId = io.AddTimeout( timeout, Finalize );

		dccSocket.readable = function(s) {
			
			var buf = s.Recv();
			var len = buf.length;
			if ( len == 0 ) {
				Finalize();
				return;
			}
			totalReceived += len;
			s.Send( Uint32ToNetworkOrderString(totalReceived) ); // ack.
			file.Write( buf );
			io.RemoveTimeout(timeoutId);
			timeoutId = io.AddTimeout( timeout, Finalize );
		}
	}

	this.InitModule = function(module) {

		module.api.AddCtcpListener( function(from,to,tag,data) {
			
			if ( tag != 'DCC' )
				return;
			var [type,argument,address,port,size] = data.split(' ');
			if ( type != 'SEND' )
				return;
			DCCReceive( IntegerToIp(address), port, argument, 2000 );
			
//			var nick = from.substring( 0, from.indexOf('!') );
		});
	}
}

////////// Start //////////

var client = new IRCClient( 'euroserv.fr.quakenet.org', 6667 );

client.AddModule( new DefaultModule( 'cdd_etf_bot' ) ); 
client.AddModule( new CTCPModule() ); 
client.AddModule( new ChanModule( '#soubok' ) );
client.AddModule( new DCCReceiver( 'c:\\tmp' ) );
//client.AddModule( new ChanModule( '#soubok2' ) );
client.AddModule( new Test() );


client.Connect();
io.Process( function() { return endSignal } );
client.Close(); // clean QUIT
io.Close(); // from now, Client has 1000ms to QUIT ...

log.WriteLn(' ========================================================= END ========================================================= ');
log.Close();


print('\nEnd.\n');
/*

links:
=====

http://www.irchelp.org/irchelp/misc/ccosmos.html

DCC protocol (Direct Client Connection):
  http://www.irchelp.org/irchelp/rfc/dccspec.html
  
CTCP Protocol (Client-To-Client Protocol)
  http://www.irchelp.org/irchelp/rfc/ctcpspec.html
  http://mathieu-lemoine.developpez.com/tutoriels/irc/ctcp/
  

infos:
=====

6.9 Characters on IRC
	For chatting in channels, anything that can be translated to ASCII gets through. (ASCII is a standard way to express characters) Note however, that since the parts of the ASCII table may be country-specific, your ASCII-art may not turn out as well for others. Fancy fonts will only show up on your own computer. You can use character map (charmap.exe) in windows to view the ASCII table.

	Channelnames: After the initial #, & or +, all characters except NUL (\0), BELL (\007), CR (\r), LF (\n) a space or a comma
	Colons in channelnames are valid for ircu but may be reserved for other purposes on other nets.

	Nicks: The allowed characters are a to z, A to Z, 0 to 9 and [ ] { } [ ] { } \ | ^ ` - _
	This is the same as saying that ’-’ and the characters ’0’ to ’9’ and ’A’ to ’}’ in the ASCII table are allowed.
	The first character in a nick cannot be a ’-’ or a number.

	The characters { } | ^ are considered the lower case equivalents of [ ] \ ~ respectively. This is said to be because of IRCs scandinavian origin, but while scandinavians will notice that Æ,Ø,Å is forced lowercase in channelnames, Å and Ä is not equivalent with each other or with any of { } | ^. This bear the mark of a backward-compatible ircu feature, and how non-american letters are treated on IRC may vary between nets.

	A weird side-effect happens when trying to ban people with these characters in the name.
	Trying to ban the nick “ac\dc”, *|*!*@* will work where *\*!*@* fails. *ac\dc*!*@* works just fine too.




notes:
=====

// user mode message: <nickname> *( ( "+" / "-" ) *( "i" / "w" / "o" / "O" / "r" ) )
// channel mode message: <channel> *( ( "-" / "+" ) *<modes> *<modeparams> )

:cdd_etf_bot!~cdd_etf_b@host.com MODE cdd_etf_bot +i
:soubok!~chatzilla@host.com MODE #soubok +vo soubok cdd_etf_bot
:soubok!~chatzilla@host.com MODE #soubok -v soubok
:soubok!~chatzilla@host.com MODE #soubok -o+v cdd_etf_bot soubok
:soubok!~chatzilla@host.com MODE #soubok +k pass
:soubok!~chatzilla@host.com MODE #soubok -k pass
:soubok!~chatzilla@host.com MODE #soubok +tk pass
:soubok!~chatzilla@host.com MODE #soubok +u
:soubok!~chatzilla@host.com MODE #soubok -v soubok
:soubok!~chatzilla@host.com MODE #soubok -v cdd_etf_bot
:soubok!~chatzilla@host.com MODE #soubok +v soubok
:soubok!~chatzilla@host.com MODE #soubok +tv soubok
:soubok!~chatzilla@host.com MODE #soubok +kv password soubok

:soubok!~chatzilla@host.com MODE #soubok +b aa!bb@cc
:soubok!~chatzilla@host.com MODE #soubok +l 1337
:soubok!~chatzilla@host.com MODE #soubok -l


quakenet +r flag: you must be authed to join (+r)

  353    RPL_NAMREPLY "( "=" / "*" / "@" ) <channel> :[ "@" / "+" ] <nick> *( " " [ "@" / "+" ] <nick> )
        - "@" is used for secret channels, "*" for private channels, and "=" for others (public channels).

:soubok!soubok@soubok.users.quakenet.org PART #soubok

modes infos/servers: http://www.alien.net.au/irc/chanmodes.html

this.test getter = function() { echo('getter') }
this.test setter = function() { echo('setter') }

http://www.irchelp.org/irchelp/rfc/rfc2811.txt
http://www.croczilla.com/~alex/reference/javascript_ref/object.html
http://www.js-examples.com/javascript/core_js15/obj.php
CTCP: http://www.irchelp.org/irchelp/rfc/ctcpspec.html




MODE soubok :+i
PING :LAGTIMER
:euroserv.fr.quakenet.org PONG euroserv.fr.quakenet.org :LAGTIMER
JOIN #soubok 
:soubok!~chatzilla@host.com JOIN #soubok
:euroserv.fr.quakenet.org 353 soubok = #soubok :@soubok
:euroserv.fr.quakenet.org 366 soubok #soubok :End of /NAMES list.
USERHOST soubok
:euroserv.fr.quakenet.org 302 soubok :soubok=+~chatzilla@host.com
MODE #soubok
:euroserv.fr.quakenet.org 324 soubok #soubok +tnCN 
:euroserv.fr.quakenet.org 329 soubok #soubok 1108995458
MODE #soubok +b
:euroserv.fr.quakenet.org 368 soubok #soubok :End of Channel Ban List

WATCH:

o = {p:1}
o.watch("p",
   function (id,oldval,newval) {
      document.writeln("o." + id + " changed from "
         + oldval + " to " + newval)
      return newval
   })

o.p = 2
o.p = 3
delete o.p
o.p = 4

o.unwatch('p')
o.p = 5 

*/
