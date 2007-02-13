/* ***** BEGIN LICENSE BLOCK *****
 * Version: GNU GPL 2.0
 *
 * The contents of this file are subject to the
 * GNU General Public License Version 2.0; you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 * http://www.gnu.org/licenses/gpl.html
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 * ***** END LICENSE BLOCK ***** */

LoadModule('jsstd'); 
LoadModule('jsnspr');

Exec('dataObject.js');
Exec('io.js');
Exec('ident.js');

const CRLF = '\r\n';

///////////////////////////////////////////////////////

var log = new function() {

	var _time0 = IntervalNow();

	var _file = new File('ircbot.log');
	
	this.Write = function( data ) {
		
		var t = IntervalNow() - _time0;
		_file.Open( File.CREATE_FILE + File.WRONLY + File.APPEND );
		_file.Write( t + ' : ' +data );
		_file.Close();
		Print(data);
	}
	
	this.WriteLn = function( data ) {
		
		this.Write( data + '\n' );
	}
}

///////////////////////////////////////////////////////

function FloodControlSender( max, time, rawSender ) {

	var _count = max;
	var _time = IntervalNow();
	var _queue = [];
	
	function Process() {
	
		var buffer = '';
		for ( ; _count > 0 && _queue.length > 0 ; _count-- )
			buffer += _queue.shift();
		if ( buffer.length > 0 )
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

function DirectSender( rawSender ) {
	
	this.Send = rawSender;
}

///////////////////////////////////////////////////////

function ClientCore( server, port ) {

	var _this = this;
	var _socket;
	var _receiveBuffer = '';
	var _listeners = {};
	var _modules = [];
	var _data = newDataNode();
	var _api = {};
	var _hasFinished;
	var _numericCommand = Exec('NumericCommand.js');
	
	var _sender = new FloodControlSender( 10, 20000, function(buffer) { // allow 10 message each 20 seconds
	
		log.WriteLn( '<- '+buffer );
		var unsentData = _socket.Send( buffer );
		if ( unsentData.length != 0 )
			throw "Case not handled yet.";
		setData( _data.lastMessageTime, IntervalNow() );
	});

	this.Send = function( message, bypassAntiFlood ) {

		_sender.Send( message+CRLF, bypassAntiFlood );
	}

	this.AddMessageListener = function( command, func ) {
		
		(_listeners[command] || (_listeners[command]=[])).push([func,this]);
	}
	
	this.AddMessageListenerSet = function( funcSet ) {
		
		for ( var [command,func] in funcSet )
			_this.AddMessageListener.call( this, command, func );
	}
	
	this.RemoveMessageListener = function( command, func ) {
	
		var list = _listeners[command];
		for ( var [i,item] in list ) // var [f,c]=item;
			if ( item[0] == func )
				list.splice( i, 1 );
	}

	this.RemoveMessageListenerSet = function( funcSet ) {
	
		for ( var [command,func] in funcSet )
			_this.RemoveMessageListener( command, func );
	}

	this.FireMessageListener = function( command, arg ) {

		if ( command in _listeners )
			for each ( var item in _listeners[command] ) // var [func,context]=item;
				item[0].apply(item[1],arg);
	}

	this.NotifyModules = function( event ) {
		
		log.WriteLn( ' > ' + Array.join(arguments,' , ') );
		for each ( var m in _modules )
			m[event] && m[event].apply(m, arguments);
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
			args[1] = _numericCommand[Number(args[1])];
		log.WriteLn( '-> ' + args );
		_this.FireMessageListener( args[1], args );
	}

	this.hasFinished = function() {

		return _hasFinished;
	}
	
	this.Finish = function() {
	
		delete _socket.readable;
		delete _socket.writable;
		io.RemoveDescriptor(_socket); // no more read/write notifications are needed
		_socket.Close();
		_this.NotifyModules( 'OnDisconnected' );
		_this.NotifyModules( 'FinalizeModuleListeners' );
		_this.NotifyModules( 'FinalizeModuleAPI' );
		_hasFinished = true;
	}

	this.Disconnect = function() { // make a Gracefully disconnect

		_this.NotifyModules( 'OnDisconnecting' );
		delete _socket.writable;
		_socket.Shutdown(); // both
		var timeoutId;
		function Close() {

			io.RemoveTimeout(timeoutId); // cancel the timeout
			_this.Finish();
		}
		_socket.readable = Close;
		timeoutId = io.AddTimeout( 1000, Close ); // force disconnect after the timeout
	}

	this.Connect = function() {

		_hasFinished = false;

		setData( _data.server, server );
		setData( _data.port, port );
		setData( _data.connectTime, IntervalNow() );

		_socket = new Socket();
		io.AddDescriptor(_socket);

		var _connectionTimeoutId = io.AddTimeout( 5000, function() {
			
			io.RemoveDescriptor(_socket);
			_socket.Close();
			_this.NotifyModules( 'OnConnectionTimeout' );
			_hasFinished = true;
		} );
		
		_this.NotifyModules( 'OnConnecting', server, port );
		try {		
			
			_socket.Connect( server, port );
		} catch(ex) {
			
			io.RemoveDescriptor(_socket);
			io.RemoveTimeout(_connectionTimeoutId); // cancel the timeout
			_this.NotifyModules( 'OnConnectionFailed' );
			_hasFinished = true;
		}
		
		_socket.writable = function() { // connection accepted
			
			io.RemoveTimeout(_connectionTimeoutId); // cancel the timeout

			setData( _data.sockName, _socket.sockName );
			setData( _data.peerName, _socket.peerName );
			delete _socket.writable; // cancel writable notification
			_socket.readable = function() {

				var buf = _socket.Recv();
				if ( buf.length == 0 ) { // remotely closed

					log.WriteLn( '-> Remotely disconnected' );
					_this.NotifyModules( 'OnDisconnecting' );
					_this.Finish();
					return;
				}

				_receiveBuffer += buf;

				for ( var eol; (eol=_receiveBuffer.indexOf(CRLF)) != -1; _receiveBuffer = _receiveBuffer.substring( eol+2 ) ) { // +2 for CRLF ('\r\n');

					var message = _receiveBuffer.substring( 0, eol );
					var prefix = message.indexOf( ':' );
					var trailing = message.indexOf( ':', 1 );
					var args = message.substring( prefix?0:1, trailing>0?trailing-1:message.length ).split(' ');
					if (prefix)
						args.unshift( undefined );
					if ( trailing>0 )
						args.push( message.substring( trailing+1 ) );
					if ( !isNaN( args[1] ) )
						args[1] = _numericCommand[Number(args[1])];
					log.WriteLn( '-> ' + args );
					_this.FireMessageListener( args[1], args );
				}
			}
			_this.NotifyModules( 'OnConnected' );
		}
	}
		
	this.AddModule = function( mod ) {
	
		mod.AddMessageListener = this.AddMessageListener;
		mod.RemoveMessageListener = this.RemoveMessageListener;
		mod.AddMessageListenerSet = this.AddMessageListenerSet;
		mod.RemoveMessageListenerSet = this.RemoveMessageListenerSet;
		mod.Send = this.Send;
		mod.data = _data;
		mod.api = _api;
		_modules.push(mod);
		mod.InitModule();
		return mod;
	}
}


///////////////////////////////////////////////// MODULES /////////////////////////////////////////////


function DefaultModule( nick, username, realname ) {
	
// [TBD] autodetect max message length ( with a self sent mesage )
// [TBD] autodetect flood limit

	var listenerSet = {

		RPL_WELCOME: function( from, command, to ) {

			setData( this.data.nick, to );
			this.Send( 'USERHOST ' + to );
		},

		RPL_USERHOST: function( from, command, to, host ) {
			
			var [,hostinfo] = host.split('=');
			setData( this.data.userhost, hostinfo.substr(1) ); // hostinfo[0] = '+' or '-' : AWAY message set
		},
		
/* same info in RPL_USERHOST
		function firstModeMessage( who, command, what, modes ) {
			
			var nick = who.substring( 0, who.indexOf('!') ); // [TBD] try to auto extract this

			if ( nick == getData(this.data.nick) ) { // self
				
				setData( this.data.fullnick, who );
				this.RemoveMessageListener( 'MODE', firstModeMessage );
			}
		}
		this.AddMessageListener( 'MODE', firstModeMessage );
*/

		ERR_ERRONEUSNICKNAME: function() { // Erroneous nickname
		  
		  // ...try to find server nick policy
		},

		ERR_NICKNAMEINUSE: function() {
		
			var tmpNick = 'tmp'+Math.random().toString(16).substr(2); // ...try a random nick, then, when ready, try a better nick
			this.Send( 'NICK '+tmpNick );
		},
		
		PING: function( prefix, command, arg ) {

			this.Send( 'PONG '+arg );
		},

		NOTICE: function( from, command, to, message ) {

			// irc.clockworkorange.co.uk- on 1 ca 1(2) ft 10(10) tr
			// where:
			//  on = Number of globally connected clients including yourself from your IP-number.
			//  ca = Connect Attempts, You have tried once, after 2 sequential connects you get throttled.
			//  ft = Free Targets. This is how many different people you may contact at once, also see 3.10
			//  tr = Targets Restored. Your targets are kept for 2 minutes or until someone else from your IP logs on. 
			//       This stops you from  refilling  your free targets by reconnection.	
	
			var oncafttrExpr = new RegExp('^on ([0-9]+) ca ([0-9]+)\\(([0-9]+)\\) ft ([0-9]+)\\(([0-9]+)\\) *(tr)?$'); // http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Guide:Writing_a_Regular_Expression_Pattern

			if ( message.substr(0,2) == 'on' ) {

				var res = oncafttrExpr(message);
				if ( res == null )
					return;
				//Print( res );
//				this.RemoveMessageListener( 'NOTICE', oncafttrNotice );
			}
		}
	};
	
	this.OnConnected = function() {
		
		var data = this.data;
		Ident( io, function(identRequest) { return( identRequest + ' : '+getData(data.userid)+' : '+getData(data.opsys)+' : '+nick+CRLF ) }, 2000 ); // let 2 seconds to the server to make the IDENT request
		this.Send( 'USER '+getData(data.username)+' '+getData(data.hostname)+' '+getData(data.server)+' :'+getData(data.realname) );
		this.Send( 'NICK '+nick );
	} 

	this.InitModule = function() {
		
		var _module = this;

		setData( this.data.hostname, '127.0.0.1' ); // try something else
		setData( this.data.username, username||'no_user_name' );
		setData( this.data.realname, realname||'no real name' );
		setData( this.data.opsys, 'UNIX' ); // for identd
		setData( this.data.userid, 'USERID' ); // for identd

		this.api.privmsg = function( to, message ) {
			
			_module.Send( 'PRIVMSG '+to+' :'+message );
		}

		this.api.Quit = function(quitMessage) {

			_module.Send( 'QUIT :'+quitMessage, true ); // true = force the message to be post ASAP
		}
		
		this.AddMessageListenerSet( listenerSet ); // listeners table
	}

	this.FinalizeModuleListeners = function() {

		this.RemoveMessageListenerSet( listenerSet ); // listeners table
	}
}


/////////////

function ChanModule( _channel ) {

	function ParseModes( modes, args, chanData ) {

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
	
	var listenerSet = {

		RPL_WELCOME: function () {

			this.Send( 'JOIN ' + _channel );
		},

		JOIN: function( who, command, channel ) { // :cdd_etf_bot!~cdd_etf_b@nost.net JOIN #soubok

			if ( channel != _channel )
				return;

			var nick = who.substring( 0, who.indexOf('!') ); // [TBD] try to auto extract this

			if ( nick == getData(this.data.nick) ) { // self

				setData( this.data.channel[channel], true );

				this.Send( 'MODE '+_channel ); // request modes
				this.Send( 'MODE '+_channel+' +b' ); // request banlist
			} else {

				setData( this.data.channel[channel].names[nick], true );
			}
		},
			
		RPL_BANLIST: function( from, command, to, channel, ban, banBy, time ) {

			setData( this.data.channel[_channel].bans[ban], true );
		},

		PART: function( who, command, channel ) {

			if ( channel != _channel )
				return;

			var nick = who.substring( 0, who.indexOf('!') ); // [TBD] try to auto extract this
			if ( nick == getData(this.data.nick) )
				delData( this.data.channel[_channel] );
			else
				delData( this.data.channel[_channel].names[nick] );
		},

		QUIT: function( who, command ) {

			var nick = who.substring( 0, who.indexOf('!') );
			delData( this.data.channel[_channel].names[nick] );
		},
		
		NICK: function( who, command, newNick ) {

			var nick = who.substring( 0, who.indexOf('!') );
			if ( nick == getData( this.data.nick ) ) // do not manage bot nick change here!
				return;

	//		renameData( this.data.channel[_channel].names, nick,newNick );
			moveData( this.data.channel[_channel].names[nick], this.data.channel[_channel].names[newNick] );
		},

		RPL_NOTOPIC: function( channel ) {

			if ( channel != _channel )
				return;
			delData( this.data.channel[_channel].topic );
		},

		TOPIC: function( from, command, channel, topic ) {

			if ( channel != _channel )
				return;
			setData( this.data.channel[_channel].topic, topic );
		},

		RPL_TOPIC: function( from, command, to, channel, topic ) {

			if ( channel != _channel )
				return;
			setData( this.data.channel[_channel].topic, topic );
		},

		RPL_CHANNELMODEIS: function( from, command, to, channel, modes /*, ...*/ ) {

			if ( channel != _channel ) // can be a user mode OR a mod for another channel
				return;

			var args = [];
			for ( var i = 5; i < arguments.length; i++)
				args[i-5] = arguments[i];
			ParseModes( modes, args, this.data.channel[_channel] );
		},
		
		MODE: function( who, command, what, modes /*, ...*/ ) {

			if ( what != _channel ) // can be a user mode OR a mod for another channel
				return;

			var args = [];
			for ( var i = 4; i < arguments.length; i++)
				args[i-4] = arguments[i];
			ParseModes( modes, args, this.data.channel[_channel] );
		},

		RPL_NAMREPLY: function( from, command, to, type, channel, list ) {

			if ( channel != _channel ) // [TBD] use a kind of filter to avoid doing this (eg. register RPL_NAMREPLY with #chan as filter )
				return;
				
			var chanData = this.data.channel[_channel];

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
		}
	};

	this.InitModule = function() {

		this.AddMessageListenerSet( listenerSet ); // listeners table , context (this)
	}

	this.FinalizeModuleListeners = function() {

		this.RemoveMessageListenerSet( listenerSet ); // listeners table , context (this)
	}
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

	function ctcpLevelQuote(data) { // \\, \1 -> \\\\, \\a

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
	

	this.InitModule = function() {
		
		var _module = this;

		var _ctclListenerList=[];
		
		this.api.AddCtcpListener = function(func) {

			_ctclListenerList.push(func);
		}
		
		this.api.RemoveCtcpListener = function(func) {

			var pos = _ctclListenerList.indexOf(func)
			pos != -1 && _ctclListenerList.splice( pos, 1 );
		}

		function FireCtcpListener( from, to, tag, data ) {

			for ( var [,l] in _ctclListenerList )
				l.apply(this,arguments);
		}

		this.api.CtcpQuery = function(who, tag, data) {
			
			_module.Send( 'PRIVMSG '+who+' :'+lowLevelCtcpDequote( '\1'+ctcpLevelQuote(tag+' '+data)+'\1' ) );
		}
		
		this.api.CtcpResponse = function(who, tag, data) {
			
			_module.Send( 'NOTICE '+who+' :'+lowLevelCtcpDequote( '\1'+ctcpLevelQuote(tag+' '+data)+'\1' ) );
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
		
		this.AddMessageListener( 'PRIVMSG', function( from, command, to, msg ) { // ctcp responses

			var even = 0;
			while (true) {
				var odd = msg.indexOf('\1',even);
				if ( odd != -1 ) {
					odd++;
					var even = msg.indexOf('\1',odd);
					if ( even != -1 ) { // ok, we've got a first ctcp message

						DispatchCtcpMessage( from, to, msg.substring( odd, even ) );
						even++;
					} else 
						break;
				} else 
					break;
			}
		});
		
// CTCP PING
		this.CtcpPing = function( from, to, tag, data ) {
			
			var nick = from.substring( 0, from.indexOf('!') );
			if ( tag == 'PING' )
				_module.api.CtcpResponse( nick, tag, data );
		}
		
		this.api.AddCtcpListener( this.CtcpPing );
	}


	this.FinalizeModuleListeners = function() {

		this.api.RemoveCtcpListener( this.CtcpPing ); // listeners table , context (this)
	}

	this.FinalizeModuleAPI = function() {
	
		delete this.api.AddCtcpListener;
		delete this.api.RemoveCtcpListener;
		delete this.api.CtcpQuery;
		delete this.api.CtcpResponse;
	}
}

////////// DCCReceiver //////////


function DCCReceiver( destinationPath ) {

	function IntegerToIp(number) {
	
		return (number>>24 & 255)+'.'+(number>>16 & 255)+'.'+(number>>8 & 255)+'.'+(number & 255);
	}
	
	function NumberToUint32NetworkOrderString(number) {
		
		return String.fromCharCode(number>>24 & 255)+String.fromCharCode(number>>16 & 255)+String.fromCharCode(number>>8 & 255)+String.fromCharCode(number & 255);
	}
	
	function DCCReceive( ip, port, fileName, timeout ) { // receiver is a client socket / sender is the server
		
		var dccSocket = new Socket();
		var file = new File( destinationPath +'/' + fileName);
		
		try {
			
			file.Open( File.CREATE_FILE + File.WRONLY );
		} catch ( ex if ex instanceof NSPRError ) {
			
			Print('Unable to create '+fileName+' in '+destinationPath, '\n'); // non-fatal error
			return; // abort
		}
		
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
			s.Send( NumberToUint32NetworkOrderString(totalReceived) ); // ack.
			file.Write( buf );
			io.RemoveTimeout(timeoutId);
			timeoutId = io.AddTimeout( timeout, Finalize );
		}
	}
	
	function dccSendRequest(from,to,tag,data) {
			
		if ( tag != 'DCC' )
			return;
		var [type,argument,address,port,size] = data.split(' ');
		if ( type != 'SEND' )
			return;
		DCCReceive( IntegerToIp(address), port, argument, 2000 );
	}	

	this.InitModule = function() {

		this.api.AddCtcpListener( dccSendRequest );
	}

	this.FinalizeModuleListeners = function() {
		
		this.api.RemoveCtcpListener( dccSendRequest );
	}
}



function LoadModulesFromPath(bot, path) {

	function FileExtension(filename) {

		var pt = filename.lastIndexOf('.');
		return  pt == -1 ? undefined : filename.substr(++pt);
	}

	var entry, dir = new Directory(path, Directory.SKIP_BOTH);
	for ( dir.Open(); ( entry = dir.Read() ); )
		if ( FileExtension(entry) == 'jsmod' )
			bot.AddModule( new (Exec(path+'/'+entry)) );
}


////////// Start //////////

Print( 'Press ctrl-c to exit...', '\n' );

var bot = new ClientCore( 'localhost', 80 );
bot.AddModule( new DefaultModule( 'jsircbot' ) ); 
bot.AddModule( new CTCPModule() ); 
bot.AddModule( new DCCReceiver( '.' ) );
bot.AddModule( new ChanModule( '#jslibs' ) );
LoadModulesFromPath( bot, '.' );

bot.Connect();
io.Process( function() { return bot.hasFinished() || endSignal } );
io.Close();

log.WriteLn(' ========================================================= END ========================================================= ');

Print('\nGracefully end.\n');








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

rfc: rfc2812.txt
rfc: rfc2813.txt

6.9 Characters on IRC
	For chatting in channels, anything that can be translated to ASCII gets through. (ASCII is a standard way to express characters) Note however, 
	that since the parts of the ASCII table may be country-specific, 
	your ASCII-art may not turn out as well for others. Fancy fonts will only show up on your own computer. 
	You can use character map (charmap.exe) in windows to view the ASCII table.

	Channelnames: After the initial #, & or +, all characters except NUL (\0), BELL (\007), CR (\r), LF (\n) a space or a comma
	Colons in channelnames are valid for ircu but may be reserved for other purposes on other nets.

	Nicks: The allowed characters are a to z, A to Z, 0 to 9 and [ ] { } [ ] { } \ | ^ ` - _
	This is the same as saying that ’-’ and the characters ’0’ to ’9’ and ’A’ to ’}’ in the ASCII table are allowed.
	The first character in a nick cannot be a ’-’ or a number.

	The characters { } | ^ are considered the lower case equivalents of [ ] \ ~ respectively. This is said to be because of IRCs scandinavian origin, 
	but while scandinavians will notice that Æ,Ø,Å is forced lowercase in channelnames, Å and Ä is not equivalent with each other or 
	with any of { } | ^. This bear the mark of a backward-compatible ircu feature, and how non-american letters are treated on IRC may vary between nets.

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
