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

Exec('tools.js');
Exec('dataObject.js');
Exec('io.js');
Exec('ident.js');

const CRLF = '\r\n';


///////////////////////////////////////////////// TOOLS /////////////////////////////////////////////


function LoadModulesFromPath(core, path, sufix) {

	function ModuleMaker(path) function Make() {
	
		var mod = new (Exec(path));
		mod.Make = Make;
		return mod;
	}
	
	var entry, dir = new Directory(path, Directory.SKIP_BOTH);
	for ( dir.Open(); (entry = dir.Read()); )
		if ( StringEnd( entry, sufix ) ) {
			
			Print( 'Loading module '+ path+'/'+entry +' ...' );

			try {
			
				core.AddModule(ModuleMaker( path + '/' +entry )());
				Print( 'Done.\n' );
			} catch(ex) {

				Print( 'Failed. ('+ex.toSource()+')\n' );
			}
		}
}


function MakeFloodSafeMessageSender( maxMessage, maxData, time, RawDataSender ) {

	var _count = maxMessage;
	var _bytes = maxData;
	var _messageQueue = [];
	var _timeoutId;
	
	function Process() {
	
		var buffer = '';
		while ( _count > 0 && _bytes > 0 && _messageQueue.length > 0 ) { // && (buffer + (_messageQueue[0]||'').length < maxData ???
			
			var msg = _messageQueue.shift();
			buffer += msg;
			_bytes -= msg.length;
			_count--;
		}
		
		buffer.length && RawDataSender(buffer);
		
		if ( !_timeoutId ) // do not reset the timeout
			_timeoutId = io.AddTimeout( time, Timeout );
	}
	
	function Timeout() {
	
		_timeoutId = undefined;
		_count = maxMessage;
		_bytes = maxData;
		_messageQueue.length && Process(); // process if needed. else no more timeout
	}
	
	return function( message, bypassAntiFlood ) {
		
		if ( bypassAntiFlood ) {
		
			_count--;
			_bytes -= message.length - 2;
			RawDataSender(message + CRLF);
		} else {
		
			message && _messageQueue.push(message + CRLF);
			Process();
		}
		return _messageQueue.length;
	}
}


///////////////////////////////////////////////// CORE /////////////////////////////////////////////


function ClientCore( Configurator ) {

	var _data = newDataNode();
	Configurator(_data);

	var _numericCommand = Exec('NumericCommand.js');
	var _connection = new SocketConnection();
	var _modules = [];
	var _messageListener = new Listener();
	var _moduleListener = new Listener();
	var _api = new SetOnceObject();
	var _hasFinished = false;
	
	function RawDataSender(buf) {

		log.WriteLn( '<-' + buf );
		_connection.Write(buf).length && Failed('Unable to send (more) data.');
		setData( _data.lastMessageTime, IntervalNow() );
	}	

	this.Send = MakeFloodSafeMessageSender( getData(data.antiflood.maxMessage), getData(data.antiflood.maxBytes), getData(data.antiflood.interval), RawDataSender );
	this.AddMessageListenerSet = _messageListener.AddSet;
	this.RemoveMessageListenerSet = _messageListener.RemoveSet;
	this.hasFinished = function() _hasFinished;
	this.Disconnect = function() _connection.Disconnect(); // make a Gracefully disconnect

	this.Connect = function() {
		
//		var _receiveBuffer = '';
		
		var _receiveBuffer = new Buffer();
		
		function OnConnected() {

			_moduleListener.Fire('OnConnected');
		}

		function OnDisconnected() {
			
			_moduleListener.Fire('OnDisconnected');
			_moduleListener.Fire('RemoveModuleListeners');
			_moduleListener.Fire('RemoveModuleAPI');
			_hasFinished = true;
		}
		
		var OnFailed = OnDisconnected; // (TBD) try another server

		function OnData(buf) {

			_receiveBuffer.Write(buf);
			var message;
			while ( (message = _receiveBuffer.ReadUntil(CRLF)) ) {
			
				log.WriteLn('->'+message);
				var prefix = message.indexOf( ':' );
				var trailing = message.indexOf( ':', 1 );
				var args = message.substring( prefix ? 0 : 1, (trailing > 0) ? trailing-1 : message.length ).split(' ');
				if ( prefix )
					args.unshift( undefined );
				if ( trailing > 0 )
					args.push( message.substring( trailing + 1 ) );
				if ( !isNaN(args[1]) )
					args[1] = _numericCommand[parseInt(args[1])];
				args.splice(1, 0, args.shift()); // move the command name to the first place.
				_messageListener.Fire.apply( null, args );
			}

/*
		function OnData(buf) {

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

				args.splice(1, 0, args.shift());
				_core.FireMessageListener.apply( null, args );
			}
		}
*/		
		setData( _data.server, server );
		setData( _data.port, port );
		setData( _data.connectTime, IntervalNow() );

		_connection.Connect( server, port, OnConnected, OnData, OnDisconnected, OnFailed );
		_moduleListener.Fire('OnConnecting');
	}
		
	this.AddModule = function( mod ) {
	
		mod.name = mod.constructor.name;
		_moduleListener.AddSet(mod);
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
		if ( pos == -1 )
			return;
		_modules.splice(pos, 1);
		mod.RemoveModuleAPI && mod.RemoveModuleAPI();
		mod.RemoveModuleListeners && mod.RemoveModuleListeners();
		mod.DestroyModule && mod.DestroyModule();
		_moduleListener.RemoveSet(mod);
		delete mod.data;
		delete mod.api;
	}

	this.ReloadModule = function( mod ) {

		mod.Make || Failed('Unable to reload the module.');
		this.RemoveModule(mod);
		this.AddModule(mod.Make());
	}
	
	this.ReloadModuleByName = function( name ) {
		
		for each ( mod in _modules.slice() ) // slice() to prevent dead-loop
			if ( mod.name == name )
				this.ReloadModule( mod );
	}
	
	this.ModuleList = function() [ m.name for each ( m in _modules ) ]

	Seal(this);
}


///////////////////////////////////////////////// MAIN /////////////////////////////////////////////


try {

	Print( 'Press ctrl-c to exit...', '\n' );

	function Configurator(data) {

		setData( data.server, 'irc.freenode.net' );
		setData( data.port, 6667 );

	// configure chans
		setData(data.defaultChannelList, ['#jsircbot']);

	// Configure anti-flood system ( in 10 seconds, we can send 5 messages OR 1456 bytes )
		setData(data.antiflood.maxMessage, 5 );
		setData(data.antiflood.maxBytes, 1456 );
		setData(data.antiflood.interval, 10000 );

	// configure nick, user, ...
		setData(data.defaultModule.nick, 'TremVipBot' );
		setData(data.defaultModule.username, 'user_TremVipBot' );
		setData(data.defaultModule.realname, 'real_TremVipBot' );

	// configure DCCReceiver module
		setData(data.DCCReceiverModule.destinationPath, '.' );
	}

	var core = new ClientCore(Configurator);
	LoadModulesFromPath( core, '.', '.jsmod' );
	core.Connect();
	
	io.Process( function() core.hasFinished() || endSignal );
	if ( endSignal )
		core.Disconnect();
		
	io.Close();

	log.WriteLn(' ========================================================= END ========================================================= ');

	Print('\nGracefully end.\n');
	
} catch( ex if ex instanceof IoError ) {

	Print( 'IoError: '+ ex.text + ' ('+ex.os+')' );
} catch(ex) {
	
	Print( ex );
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
	This is the same as saying that - and the characters 0 to 9 and A to } in the ASCII table are allowed.
	The first character in a nick cannot be a - or a number.

	The characters { } | ^ are considered the lower case equivalents of [ ] \ ~ respectively. This is said to be because of IRCs scandinavian origin, 
	but while scandinavians will notice that Æ,Ø,Å is forced lowercase in channelnames, Å and Ä is not equivalent with each other or 
	with any of { } | ^. This bear the mark of a backward-compatible ircu feature, and how non-american letters are treated on IRC may vary between nets.

	A weird side-effect happens when trying to ban people with these characters in the name.
	Trying to ban the nick ac\dc, *|*!*@* will work where *\*!*@* fails. *ac\dc*!*@* works just fine too.

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