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
LoadModule('jsio');
LoadModule('jsobjex');

Exec('dataObject.js');
Exec('io.js');
Exec('ident.js');

const CRLF = '\r\n';

///////////////////////////////////////////////////////

function DPrint() {
	
	for ( var i = 0; i < arguments.length; i++ )
		Print( '{'+arguments[i]+'} ' );
	Print( '\n' );
}


///////////////////////////////////////////////////////

/*
function Listener(lowerCaseNames) {
	
	var _list = {};

	this.Add = function( name, func ) {
		
		lowerCaseNames && ( name = name.toLowerCase() );
		(_list[name] || (_list[name]=[])).push(func);
	}
	
	this.AddSet = function( set ) {
		
		for ( var [name, func] in Iterator(set) )
			this.Add(name, func);
	}
	
	this.Remove = function( name, func ) {
	
		lowerCaseNames && ( name = name.toLowerCase() );
		var l = _list[name];
		l.splice(l.indexOf(func), 1);
		l.length || delete _list[name];
	}

	this.RemoveSet = function( set ) {
	
		for ( var [name, func] in Iterator(set) )
			this.Remove(name, func);
	}
	
	this.Fire = function( name ) {
	
		lowerCaseNames && ( name = name.toLowerCase() );
		if ( name in _list )
			for each ( var func in _list[name] )
				func.apply(this, arguments);
	}
	
	this.Clear = function() {

		_list = {};
	}
}
*/

///////////////////////////////////////////////////////


///////////////////////////////////////////////////////

function Listener() {
	
	var _list;
	this.Clear = function() _list = [];
	this.AddSet = function( set ) _list.push(set);
	this.RemoveSet = function( set ) _list.splice(_list.indexOf(set), 1);
	this.Fire = function( name ) {
	
		for each ( var set in _list )
			name in set && set[name].apply(null, arguments);
	}
	this.Clear();
}

///////////////////////////////////////////////////////

var log = new function() {

	var _time0 = IntervalNow();

	var _file = new File('ircbot.log');
	
	this.Write = function( data ) {
		
		var t = IntervalNow() - _time0;
		_file.Open( File.CREATE_FILE + File.WRONLY + File.APPEND );
		_file.Write( '{' + t + '}' +data );
		_file.Close();
//		Print(data);
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

function Failed(text) { log.WriteLn(error); throw new Error(text) }

///////////////////////////////////////////////////////

function API() {

	return new ObjEx( undefined,undefined,undefined, function(name, value) this[name] ? Failed('API Already defined') : value );
}
///////////////////////////////////////////////////////

function ClientCore( server, port ) {

	var _this = this;
	var _socket;
	var _receiveBuffer = '';
	var _modules = [];
	var _data = newDataNode();
	var _messageListener = new Listener();
	var _api = new API();
	var _hasFinished;
	var _numericCommand = Exec('NumericCommand.js');
	
	var _sender = new FloodControlSender( 5, 10000, function(buffer) { // allow 10 message each 20 seconds
	
		log.WriteLn( '<-'+buffer );
		var unsentData = _socket.Write( buffer );
		if ( unsentData.length != 0 )
			Failed('Case not handled yet.');
		setData( _data.lastMessageTime, IntervalNow() );
	});

	this.Send = function( message, bypassAntiFlood ) _sender.Send( message+CRLF, bypassAntiFlood );
	this.AddMessageListenerSet = function( set ) _messageListener.AddSet(set);
	this.RemoveMessageListenerSet = function( set ) _messageListener.RemoveSet(set);
	this.FireMessageListener = function() _messageListener.Fire.apply(null, arguments);

	this.NotifyModules = function( event ) {
		
//		log.WriteLn( ' > ' + Array.join(arguments,' , ') );
		for each ( var m in _modules )
			m[event] && m[event].apply( null, arguments);
	}
	
	this.hasFinished = function() _hasFinished;
	
	this.Finish = function() {
	
		delete _socket.readable;
		delete _socket.writable;
		io.RemoveDescriptor(_socket); // no more read/write notifications are needed
		_socket.Close();
		_this.NotifyModules( 'OnDisconnected' );
		_this.NotifyModules( 'RemoveModuleListeners' );
		_this.NotifyModules( 'RemoveModuleAPI' );
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

				var buf = _socket.Read();
				if ( buf.length == 0 ) { // remotely closed

//					log.WriteLn( '-> Remotely disconnected' );
					_this.NotifyModules( 'OnDisconnecting' );
					_this.Finish();
					return;
				}

				_receiveBuffer += buf;

				for ( var eol; (eol=_receiveBuffer.indexOf(CRLF)) != -1; _receiveBuffer = _receiveBuffer.substring( eol+2 ) ) { // +2 for CRLF ('\r\n');

					var message = _receiveBuffer.substring( 0, eol );
					
					log.WriteLn('->'+message);
					
					var prefix = message.indexOf( ':' );
					var trailing = message.indexOf( ':', 1 );
					var args = message.substring( prefix ? 0 : 1, (trailing > 0) ? trailing-1 : message.length ).split(' ');
					if ( prefix )
						args.unshift( undefined );
					if ( trailing > 0 )
						args.push( message.substring( trailing + 1 ) );
					if ( !isNaN( args[1] ) )
						args[1] = _numericCommand[Number(args[1])];
//					log.WriteLn( '-> ' + args );

					args.splice(1, 0, args.shift());
					
//					DPrint( 'FireMessageListener:'+ args.toSource() );
					_this.FireMessageListener.apply( null, args );
				}
			}
			_this.NotifyModules( 'OnConnected' );
		}
	}
		
	this.AddModule = function( mod ) {
	
		mod.AddMessageListenerSet = this.AddMessageListenerSet;
		mod.RemoveMessageListenerSet = this.RemoveMessageListenerSet;
		mod.Send = this.Send;
		mod.data = _data;
		mod.api = _api;
		_modules.push(mod);
		mod.AddModuleAPI && mod.AddModuleAPI();
		mod.AddModuleListeners && mod.AddModuleListeners();
		mod.InitModule && mod.InitModule();
		return mod;
	}
	
	this.RemoveModule = function( mod ) {
		
		var pos = _modules.indexOf(mod);
		if ( pos != -1 ) {
		
			mod = _modules[pos];
			_modules.splice(pos, 1);

			mod.RemoveModuleAPI && mod.RemoveModuleAPI();
			mod.RemoveModuleListeners && mod.RemoveModuleListeners();
			mod.DestroyModule && mod.DestroyModule();
			delete mod.api;
			delete mod.data;
		}
	}

	this.ReloadModule = function( mod ) {
		
		this.RemoveModule(mod);
		mod.Make || Failed('Unable to reload the module.');
		this.RemoveModule(mod.Make());
	}
}


///////////////////////////////////////////////// MODULES /////////////////////////////////////////////


function DefaultModule( nick, username, realname ) {
	
	var _mod = this;
	
// [TBD] autodetect max message length ( with a self sent mesage )
// [TBD] autodetect flood limit

	var listenerSet = {

		RPL_WELCOME: function( command, from, to ) {

			setData( _mod.data.nick, to );
			_mod.Send( 'USERHOST ' + to );
		},

		RPL_USERHOST: function( command, from, to, host ) {
			
			var [,hostinfo] = host.split('=');
			setData( _mod.data.userhost, hostinfo.substr(1) ); // hostinfo[0] = '+' or '-' : AWAY message set
		},
		
/* same info in RPL_USERHOST
		function firstModeMessage( who, command, what, modes ) {
			
			var nick = who.substring( 0, who.indexOf('!') ); // [TBD] try to auto extract this

			if ( nick == getData(_mod.data.nick) ) { // self
				
				setData( _mod.data.fullnick, who );
				_mod.RemoveMessageListener( 'MODE', firstModeMessage );
			}
		}
		_mod.AddMessageListener( 'MODE', firstModeMessage );
*/

		ERR_NICKCOLLISION: function() {
			
			delData( _mod.data.nick );
		},
		
		ERR_ERRONEUSNICKNAME: function() { // Erroneous nickname
		  
			delData( _mod.data.nick );
		  // ...try to find server nick policy
		},

		ERR_NICKNAMEINUSE: function() {
		
			var tmpNick = 'tmp'+Math.random().toString(16).substr(2); // ...try a random nick, then, when ready, try a better nick
			_mod.Send( 'NICK '+tmpNick );
			setData( _mod.data.nick, tmpNick );
		},

		NICK:function( command, who, nick ) {
			setData( _mod.data.nick, nick );
		},
		
		PING: function( command, prefix, arg ) {

			_mod.Send( 'PONG '+arg );
			setData( _mod.data.lastPingTime, IntervalNow() );
		},

		NOTICE: function( command, from, to, message ) {

			// irc.clockworkorange.co.uk- on 1 ca 1(2) ft 10(10) tr
			// where:
			//  on = Number of globally connected clients including yourself from your IP-number.
			//  ca = Connect Attempts, You have tried once, after 2 sequential connects you get throttled.
			//  ft = Free Targets. This is how many different people you may contact at once, also see 3.10
			//  tr = Targets Restored. Your targets are kept for 2 minutes or until someone else from your IP logs on. 
			//       This stops you from  refilling  your free targets by reconnection.	
	
			// http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Guide:Writing_a_Regular_Expression_Pattern
			var oncafttrExpr = new RegExp('^on ([0-9]+) ca ([0-9]+)\\(([0-9]+)\\) ft ([0-9]+)\\(([0-9]+)\\) *(tr)?$');

			if ( message.substr(0,2) == 'on' ) {

				var res = oncafttrExpr(message);
				if ( res == null )
					return;
//				_mod.RemoveMessageListener( 'NOTICE', oncafttrNotice );
			}
		}
	};
	
	this.OnConnected = function() {
		
		var data = _mod.data;
		Ident( io, function(identRequest) identRequest + ' : '+getData(data.userid)+' : '+getData(data.opsys)+' : '+nick+CRLF, 2000 ); // let 2 seconds to the server to make the IDENT request
		_mod.Send( 'USER '+getData(data.username)+' '+getData(data.hostname)+' '+getData(data.server)+' :'+getData(data.realname) );
		_mod.Send( 'NICK '+nick );
	} 

	this.InitModule = function() {

		setData( _mod.data.hostname, '127.0.0.1' ); // try something else
		setData( _mod.data.username, username||('user_'+nick) );
		setData( _mod.data.realname, realname||('name_'+nick) );
		setData( _mod.data.opsys, 'UNIX' ); // for identd
		setData( _mod.data.userid, 'USERID' ); // for identd
	}

	this.AddModuleAPI = function() {
		
		_mod.api.Nick = function( nick ) {

			_mod.Send( 'NICK '+nick );
		}
		
		_mod.api.privmsg = function( to, message ) {
		
			var hostpos = to.indexOf('!');
			if ( hostpos != -1 )
				to = to.substr( 0, hostpos );
			_mod.Send( 'PRIVMSG '+to+' :'+message );
		}

		_mod.api.Quit = function(quitMessage) {

			_mod.Send( 'QUIT :'+quitMessage, true ); // true = force the message to be post ASAP
		}
	}

	this.RemoveModuleAPI = function() {
		
		delete _mod.api.privmsg;
		delete _mod.api.Quit;
	}

	this.AddModuleListeners = function() {

		_mod.AddMessageListenerSet( listenerSet ); // listeners table
	}
	
	this.RemoveModuleListeners = function() {

		_mod.RemoveMessageListenerSet( listenerSet ); // listeners table
	}
}


function ChannelModule( _channel ) {
	
	var _mod = this;

	function ParseModes( modes, args, chanData ) {

		var simpleMode = { i:'inviteOnly', t:'topicByOp', p:'private', s:'secret', m:'moderated', n:'noExternalMessages', r:'reop', C:'noCtcp', N:'noExternalNotice', c:'noColor' };
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
		
			_mod.Send( 'JOIN ' + _channel );
		},

		JOIN: function( command, who, channel ) { // :cdd_etf_bot!~cdd_etf_b@nost.net JOIN #soubok

			if ( channel != _channel )
				return;

			var nick = who.substring( 0, who.indexOf('!') ); // [TBD] try to auto extract this

			if ( nick == getData(_mod.data.nick) ) { // self

				setData( _mod.data.channel[channel], true );

				_mod.Send( 'MODE '+channel ); // request modes
				_mod.Send( 'MODE '+channel+' +b' ); // request banlist
			} else {

				setData( _mod.data.channel[channel].names[nick], true );
			}
		},
			
		RPL_BANLIST: function( command, from, to, channel, ban, banBy, time ) {

			setData( _mod.data.channel[channel].bans[ban], true );
		},

		PART: function( command, who, channel ) {

			if ( channel != _channel )
				return;

			var nick = who.substring( 0, who.indexOf('!') ); // [TBD] try to auto extract this
			if ( nick == getData(_mod.data.nick) )
				delData( _mod.data.channel[channel] );
			else
				delData( _mod.data.channel[channel].names[nick] );
		},

		QUIT: function( command, who ) {
			
			// (TBD) if multi-chan, remove this user an every chan
			var nick = who.substring( 0, who.indexOf('!') );
			delData( _mod.data.channel[_channel].names[nick] );
		},
		
		NICK: function( command, who, newNick ) {

			// (TBD) if multi-chan, rename this user an every chan
			var nick = who.substring( 0, who.indexOf('!') );
			if ( nick == getData( _mod.data.nick ) ) // do not manage bot nick change here!
				return;

	//		renameData( _mod.data.channel[_channel].names, nick,newNick );
			moveData( _mod.data.channel[_channel].names[nick], _mod.data.channel[_channel].names[newNick] );
		},

		RPL_NOTOPIC: function( command, channel ) {

			if ( channel != _channel )
				return;
			delData( _mod.data.channel[channel].topic );
		},

		TOPIC: function( command, from, channel, topic ) {

			if ( channel != _channel )
				return;
			setData( _mod.data.channel[channel].topic, topic );
		},

		RPL_TOPIC: function( command, from, to, channel, topic ) {

			if ( channel != _channel )
				return;
			setData( _mod.data.channel[channel].topic, topic );
		},

		RPL_CHANNELMODEIS: function( command, from, to, channel, modes /*, ...*/ ) {

			if ( channel != _channel ) // can be a user mode OR a mod for another channel
				return;

			var args = [];
			for ( var i = 5; i < arguments.length; i++)
				args[i-5] = arguments[i];
			ParseModes( modes, args, _mod.data.channel[channel] );
		},
		
		MODE: function( command, who, what, modes /*, ...*/ ) {

			if ( what != _channel ) // can be a user mode OR a mod for another channel
				return;

			var args = [];
			for ( var i = 4; i < arguments.length; i++)
				args[i-4] = arguments[i];
			ParseModes( modes, args, _mod.data.channel[_channel] );
		},

		RPL_NAMREPLY: function( command, from, to, type, channel, list ) {

			if ( channel != _channel ) // [TBD] use a kind of filter to avoid doing this (eg. register RPL_NAMREPLY with #chan as filter )
				return;
				
			var chanData = _mod.data.channel[channel];

			if (type == '@')
				setData( chanData.secret, true );

			if (type == '*')
				setData( chanData.priv, true );

			var names = list.split(' ');
			for each ( var name in names ) {
			
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

	this.AddModuleListeners = function() _mod.AddMessageListenerSet( listenerSet ); // listeners table , context (this)
	this.RemoveModuleListeners = function() _mod.RemoveMessageListenerSet( listenerSet ); // listeners table , context (this)
}


function CTCPModule() {

	var _mod = this;

	function lowLevelCtcpQuote(data) { // NUL, NL, CR, QUOTE -> QUOTE 0, QUOTE n, QUOTE r, QUOTE QUOTE
		
//		var tr={ '\0':'\0200', '\r':'\020r', '\n':'\020n', '\020':'\020\020' };
		var out='';
		for each ( var c in data )
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
		for each ( var c in data )
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
	

	var _ctclListenerList=[];

	function FireCtcpListener( from, to, tag, data ) {

		for each ( var l in _ctclListenerList )
			l.apply(null, arguments);
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

	_mod.CtcpPing = function( from, to, tag, data ) {

		var nick = from.substring( 0, from.indexOf('!') );
		if ( tag == 'PING' )
			_mod.api.CtcpResponse( nick, tag, data );
	}

	var messages = {

		PRIVMSG:function( command, from, to, msg ) { // ctcp responses

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
		}
	}

	this.AddModuleListeners = function() {
		
		_mod.AddMessageListenerSet( messages );
		_mod.api.AddCtcpListener( _mod.CtcpPing );
	}
	
	this.RemoveModuleListeners = function() {
		
		_mod.api.RemoveCtcpListener( _mod.CtcpPing ); // listeners table , context (this)
		_mod.RemoveMessageListenerSet( messages );
	}
	
	this.AddModuleAPI = function() {
	
		_mod.api.AddCtcpListener = function(func) {

			_ctclListenerList.push(func);
		}
		
		_mod.api.RemoveCtcpListener = function(func) {

			var pos = _ctclListenerList.indexOf(func)
			pos != -1 && _ctclListenerList.splice( pos, 1 );
		}

		_mod.api.CtcpQuery = function(who, tag, data) {
			
			_mod.Send( 'PRIVMSG '+who+' :'+lowLevelCtcpDequote( '\1'+ctcpLevelQuote(tag+' '+data)+'\1' ) );
		}
		
		_mod.api.CtcpResponse = function(who, tag, data) {
			
			_mod.Send( 'NOTICE '+who+' :'+lowLevelCtcpDequote( '\1'+ctcpLevelQuote(tag+' '+data)+'\1' ) );
		}
	}
	
	this.RemoveModuleAPI = function() {

		delete _mod.api.AddCtcpListener;
		delete _mod.api.RemoveCtcpListener;
		delete _mod.api.CtcpQuery;
		delete _mod.api.CtcpResponse;
	}
}


function DCCReceiverModule( destinationPath ) {
	
	var _mod = this;

	function IntegerToIp(number) (number>>24 & 255)+'.'+(number>>16 & 255)+'.'+(number>>8 & 255)+'.'+(number & 255);

	function NumberToUint32NetworkOrderString(number) String.fromCharCode(number>>24 & 255)+String.fromCharCode(number>>16 & 255)+String.fromCharCode(number>>8 & 255)+String.fromCharCode(number & 255);
	
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
			
			var buf = s.Read();
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

	this.AddModuleListeners = function() {

		_mod.api.AddCtcpListener( dccSendRequest );
	}

	this.RemoveModuleListeners = function() {
		
		_mod.api.RemoveCtcpListener( dccSendRequest );
	}
}


function BotCmdModule( destinationPath ) {
	
	var _mod = this;
	var _listener = new Listener();

	var messages = {
		PRIVMSG:function( command, from, to, msg ) {
						
			if ( msg[0] != '!' ) // not a bot command
				return;
				
			var cmdName, cmdData;
			var sp = msg.indexOf(' ');
			if ( sp == -1 ) {
			
				cmdName = msg.substr(1);
				cmdData = undefined;
			} else {
			
				cmdName = msg.substr(1, sp-1);
				cmdData = msg.substr(sp+1);
			}

			DPrint( '***', msg, cmdName, cmdData  );

			_listener.Fire( cmdName.toLowerCase(), cmdData, command, from, to, msg );
		}
	}
	
	this.AddModuleListeners = function() _mod.AddMessageListenerSet( messages );
	this.RemoveModuleListeners = function() _mod.RemoveMessageListenerSet( messages );
	this.AddModuleAPI = function() _mod.api.botCmd = _listener;
	this.RemoveModuleAPI = function() delete _mod.api.botCmd;
}



function HttpClientModule( destinationPath ) {
	
	var _mod = this;

	function parseUri(source) { // parseUri 1.2; MIT License By Steven Levithan. http://blog.stevenlevithan.com/archives/parseuri
		var o = parseUri.options, value = o.parser[o.strictMode ? "strict" : "loose"].exec(source);

		for (var i = 0, uri = {}; i < 14; i++) uri[o.key[i]] = value[i] || "";
		uri[o.q.name] = {};
		uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) { if ($1) uri[o.q.name][$1] = $2 });
		return uri;
	};

	parseUri.options = {
		strictMode: false,
		key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
		q: {
			name: "queryKey",
			parser: /(?:^|&)([^&=]*)=?([^&]*)/g
		},
		parser: {
			strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
			loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
		}
	};
	
	function MakeStatusLine( method, path, version ) {
		
		return method + ' ' + path + ' ' + (version||'HTTP/1.0');
	}
	
	function MakeHeaders( list ) {
		
		var headers = '';
		for ( var k in list )
			headers += k + ': ' + list[v] + CRLF;
		return headers;
	}
	
	function FormEncode( list ) {
		
		var data = '';
		for ( var k in list )
			data += ( data.length?'&':'') + encodeURIComponent(k) + '=' + encodeURIComponent(list[k]);
		return data;
	}
	
	function ERR() { throw ERR }
	function CHK( v ) v || ERR();

	function Switch(i) arguments[++i];

	this.AddModuleAPI = function() {
		
		_mod.api.HttpPost = function(url, data, timeout, responseCallback) {
			
			var ud = parseUri(url);
			var headers = { Host:ud.host, Connection:'Close' };
			var statusLine = MakeStatusLine( data ? 'POST' : 'GET', ud.path );
			var body = '';
			if ( data ) {
				
				body = FormEncode(data);
				headers['Content-Length'] = body.length;
				headers['Content-Type'] = 'application/x-www-form-urlencoded';
			}
			
			var httpSocket = new Socket();
			httpSocket.Connect( ud.host, ud.port || 80 );
			io.AddDescriptor( httpSocket );
			var timeoutId = io.AddTimeout( timeout, Finalize );

			function Finalize() {

				io.RemoveTimeout(timeoutId);
				httpSocket.Close();
				io.RemoveDescriptor( httpSocket );
			}

			httpSocket.writable = function(s) {
				
				s.Write(statusLine + CRLF + MakeHeaders(headers) + CRLF + body);
				delete s.writable;
			}

			var responseBuffer = new Buffer();

			httpSocket.readable = function(s) {
				
				var chunk = s.Read();

				DPrint( 'receiving', chunk );
				log.WriteLn(chunk)

				if ( chunk.length ) {

					responseBuffer.Write( chunk );
				} else {
					
					delete s.readable;
					Finalize();
					try {

						var [httpVersion,statusCode,reasonPhrase] = CHK(responseBuffer.ReadUntil(CRLF)).split(' ');
						var headers = {};
						for each ( var h in CHK(responseBuffer.ReadUntil(CRLF+CRLF)).split(CRLF) ) {

							var [k, v] = h.split(': '); 
							headers[k] = v;
						}
						responseCallback( { httpVersion:httpVersion, statusCode:statusCode, reasonPhrase:reasonPhrase, headers:headers, body:responseBuffer.Read() } );
					} catch(ex if ex == ERR) {
						
						log.WriteLn( 'Error while parsing HTTP response' );
					}
				}
			}
		}
	}
	
	this.RemoveModuleAPI = function() {
		
		delete _mod.api.HttpPost;
	}
}


function LoadModulesFromPath(core, path, ext) {

	function FileExtension(filename) {

		var pt = filename.lastIndexOf('.');
		return  pt == -1 ? undefined : filename.substr(++pt);
	}
	
	function ModuleMaker(path) function() new (Exec(path));
	
	var entry, dir = new Directory(path, Directory.SKIP_BOTH);
	for ( dir.Open(); (entry = dir.Read()); )
		if ( FileExtension(entry) == ext ) {
			
			Print( 'Loading module '+ path+'/'+entry +' ...' );

			try {
			
				var make = ModuleMaker( path + '/' +entry ); // returns a function that creates the module
				var mod = make(); // create the module
				mod.Make = make;
				core.AddModule(mod);
				Print( 'Done.\n' );
			} catch(ex) {

				Print( 'Failed. ('+ex+')\n' );
			}
		}
}


////////// Start //////////

try {

	Print( 'Press ctrl-c to exit...', '\n' );

	var core = new ClientCore( 'irc.freenode.net', 6667 );
	core.AddModule( new DefaultModule( 'TremVipBot' ) ); 
	core.AddModule( new CTCPModule() ); 
	core.AddModule( new DCCReceiverModule( '.' ) );
	core.AddModule( new ChannelModule( '#trem-vipsx' ) );
	core.AddModule( new HttpClientModule() );
	core.AddModule( new BotCmdModule() );
	
	LoadModulesFromPath( core, '.', 'jsmod' );

	core.Connect();
	io.Process( function() { return core.hasFinished() || endSignal } );
	io.Close();

	log.WriteLn(' ========================================================= END ========================================================= ');

	Print('\nGracefully end.\n');
	
} catch( ex if ex instanceof IoError ) {

	Print( 'Error:'+ ex.text + ' ('+ex.os+')' );
} catch(ex) {
	
	Print( ex, '\n' );
	Print( 'Stack:\n', ex.stack, '\n' );
}



/*

http://www.irchelp.org/irchelp/misc/ccosmos.html

DCC protocol (Direct Client Connection):
  http://www.irchelp.org/irchelp/rfc/dccspec.html
  
CTCP Protocol (Client-To-Client Protocol)
  http://www.irchelp.org/irchelp/rfc/ctcpspec.html
  http://mathieu-lemoine.developpez.com/tutoriels/irc/ctcp/


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

	modes infos/servers: http://www.alien.net.au/irc/chanmodes.html

	http://www.irchelp.org/irchelp/rfc/rfc2811.txt
	http://www.croczilla.com/~alex/reference/javascript_ref/object.html
	http://www.js-examples.com/javascript/core_js15/obj.php
	CTCP: http://www.irchelp.org/irchelp/rfc/ctcpspec.html

*/