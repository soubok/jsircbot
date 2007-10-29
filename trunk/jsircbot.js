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


///////////////////////////////////////////////// CONST /////////////////////////////////////////////

// Default state names
const STATE_SEND_OVERFLOW = 'sendOverflow';
const STATE_INTERACTIVE = 'interactive';
const STATE_CONNECTED = 'connected';
const STATE_CONNECTING = 'connecting';
const STATE_HAS_GOOD_NICK = 'hasGoodNick';


///////////////////////////////////////////////// TOOLS /////////////////////////////////////////////

function MakeModuleFromHttp( url, retry, retryPause, callback ) {

	var CreationFunction = let ( args = arguments ) function() args.callee.apply(null, args);

	StartAsyncProc( new function() {

		for (;;) {
	
			DBG && ReportNotice( 'Loading module from: '+url );
	
			var [status, statusCode, reasonPhrase, headers, body] = yield function(cb) HttpRequest(url, '', 10*SECOND, cb);
			if ( status == OK && statusCode == 200 )
				break;

			DBG && ReportError('Failed to load the module from '+url+' (status:'+String(status)+', reason:'+reasonPhrase+') ... '+(retry-1)+' tries left');

			if ( --retry <= 0 || Match(status, BADREQUEST, BADRESPONSE, NOTFOUND, ERROR) || status == OK && statusCode > 500 ) {

				DBG && ReportError('Failed to load the module from '+url+' (status:'+String(status)+', reason:'+reasonPhrase+').');
				return; // cannot retry in this case
			}
			DBG && ReportError('Failed to load the module from '+url+' (status:'+String(status)+', reason:'+reasonPhrase+') ... '+retry+' tries left');
			yield function(cb) io.AddTimeout( retryPause, cb ); // async pause
		}
		
		var relativeLineNumber;
		try {
			
			try { throw new Error() } catch(ex) { relativeLineNumber = ex.lineNumber }
			var modConstructor = eval(body);
		} catch(ex) {
		
			ex.lineNumber -= relativeLineNumber;
			ex.fileName = url;
			DBG && ReportError('Failed to make the module: '+ExToText(ex));
			return;
		}

		callback(modConstructor, CreationFunction, url);
		DBG && ReportNotice( 'Module '+url+ ' loaded.' );
	});
}


function MakeModuleFromPath( path, callback ) {
	
	var CreationFunction = let ( args = arguments ) function() args.callee.apply(null, args);

	DBG && ReportNotice( 'Loading module from: '+path );

	try {
		
		var modConstructor = Exec(path, false); // do not save compiled version of the script
	} catch(ex) {

		DBG && ReportError('Failed to make the module from '+path+' ('+ExToText(ex)+')');
		return;
	}
	callback(modConstructor, CreationFunction, path);
	DBG && ReportNotice( 'Module '+path+ ' loaded.' );
}


function LoadModuleFromURL( core, url ) {

	const defaultSufix = '.jsmod';
	var ud = ParseUri(url);
	
	switch (ud.protocol.toLowerCase()) {
		case 'file':
			var path = ud.path.substr(1);
			if ( path.substr(-1) == '/' ) {
				
				var entry, dir = new Directory(path, Directory.SKIP_BOTH);
				for ( dir.Open(); (entry = dir.Read()); )
					if ( StringEnd( entry, defaultSufix ) )
						MakeModuleFromPath( path+entry, core.AddModule );
			} else
				MakeModuleFromPath( path, core.AddModule );
			break;
		case 'http':
			MakeModuleFromHttp( url, getData(core.data.moduleLoadRetry), getData(core.data.moduleLoadRetryPause), core.AddModule );
			break;
		default:
			DBG && ReportError('Invalid module source: URL not supported ('+url+')');
	}	
}



function MakeFloodSafeMessageSender( maxMessage, maxData, time, RawDataSender, state ) {

	var _count = maxMessage;
	var _bytes = maxData;
	var _instantMessageQueue = [];
	var _messageQueue = [];
	var _timeoutId;

	function Process() {

		DBG && DebugTrace( 'MakeFloodSafeMessageSender', _count, _bytes, _messageQueue.length );

		var buffer = '';
		function PrepMessage([messages, OnSent]) {

			OnSent && void OnSent();
			_count -= messages.length;
			var messageString = messages.join(CRLF)+CRLF;
			_bytes -= messageString.length;
			buffer += messageString;
		}

		while ( _instantMessageQueue.length )
			PrepMessage(_instantMessageQueue.shift());

		while ( _messageQueue.length && _count > 0 && _bytes > 0 ) // && (buffer + (_messageQueue[0]||'').length < maxData ???
			PrepMessage(_messageQueue.shift());

		buffer.length && RawDataSender(buffer);

		state.Toggle(STATE_SEND_OVERFLOW, _messageQueue.length > 0);

		if ( !_timeoutId ) // do not reset the timeout
			_timeoutId = io.AddTimeout(time, AntiFloodTimeout);
	}

	function AntiFloodTimeout() {

		_timeoutId = undefined;
		_count = maxMessage;
		_bytes = maxData;
		_messageQueue.length && Process(); // process if needed. else no more timeout
	}

	return function(message, bypassAntiFlood, OnSent) {

		(bypassAntiFlood ? _instantMessageQueue : _messageQueue).push([message instanceof Array ? message : [message], OnSent]);
		Process();
	}
}



///////////////////////////////////////////////// CORE /////////////////////////////////////////////


function ClientCore( Configurator ) {

	var _core = this;
	var _data = this.data = newDataNode();
	Configurator(_data);
	var _numericCommand = Exec('NumericCommand.js');
	var _connection;
	var _modules = [];
	
	function ListenerException(ex) ReportError( ExToText(ex) );
	
	var _messageListener = new Listener( ListenerException );
	var _moduleListener = new Listener( ListenerException );
	var _state = new StateKeeper( ListenerException );
	
//	var _api = NewDataObj(); // or new SetOnceObject();
	var _api = {}; // or new SetOnceObject();
	
	_api.__noSuchMethod__ = function(methodName) {
		
		ReportError( 'API method '+methodName+' is not defined' );
		return NOSUCHMETHOD;
	}
	
	_state.Enter('running');
	
	function RawDataSender(buf) {

		log.Write( LOG_IRCMSG, 'out', buf );
		_connection.Write(buf).length && Failed('Unable to send (more) data.');
		setData( _data.lastMessageTime, IntervalNow() );
	}

	this.Send = MakeFloodSafeMessageSender( getData(_data.antiflood.maxMessage), getData(_data.antiflood.maxBytes), getData(_data.antiflood.interval), RawDataSender, _state );

	this.hasFinished = function() !_connection;
	this.Disconnect = function() _connection.Disconnect(); // make a Gracefully disconnect ( disconnect != close )
	
	this.Connect = function() {
		
		var _receiveBuffer = new Buffer();

		function OnData(buf) {

			_receiveBuffer.Write(buf);
			var message;
			while ( (message = _receiveBuffer.ReadUntil(CRLF)) ) {
				
				log.Write( LOG_IRCMSG, 'in', message);
				try {

//    message    =  [ ":" prefix SPACE ] command [ params ] crlf
//    prefix     =  servername / ( nickname [ [ "!" user ] "@" host ] )
//    command    =  1*letter / 3digit
//    params     =  *14( SPACE middle ) [ SPACE ":" trailing ]
//               =/ 14( SPACE middle ) [ SPACE [ ":" ] trailing ]
//    nospcrlfcl =  %x01-09 / %x0B-0C / %x0E-1F / %x21-39 / %x3B-FF
//                    ; any octet except NUL, CR, LF, " " and ":"
//    middle     =  nospcrlfcl *( ":" / nospcrlfcl )
//    trailing   =  *( ":" / " " / nospcrlfcl )					

					// The prefix is used by servers to indicate the true origin of the message.
					var prefix = message.indexOf( ':' );
					var trailing = message.indexOf( ':', 1 );
					var args = message.substring( prefix ? 0 : 1, (trailing > 0) ? trailing-1 : message.length ).split(' ');
					if ( prefix != 0 ) // If the prefix is missing from the message, it is assumed to have originated from the connection from which it was received from.
						args.unshift( undefined );
					if ( trailing != 0 )
						args.push( message.substring( trailing + 1 ) );
					if ( !isNaN(args[1]) )
						args[1] = _numericCommand[parseInt(args[1])] || parseInt(args[1]);
					args.splice(1, 0, args.shift()); // move the command name to the first place.
					
					_messageListener.Fire.apply( null, args );

					if ( args[0] == 'RPL_WELCOME' )
						_state.Enter(STATE_INTERACTIVE);

				} catch (ex if ex == ERR) {
				
					DBG && ReportError('Invalid IRC server message', message);
				}
			}
		}

		function OnDisconnected( remotelyDisconnected ) {
			
			DBG && remotelyDisconnected && ReportWarning( 'Remotely disconnected' );
			DBG && !remotelyDisconnected && ReportNotice( 'Locally disconnected' );

			_state.Leave(STATE_INTERACTIVE);
			_state.Leave(STATE_CONNECTED);

			for each ( mod in _core.ModuleList() )
				_core.RemoveModule( mod );

			_connection.Close();
			_connection = undefined; // this is the end
			// (TBD) retry if remotelyDisconnected ?
		}
		
		function OnConnected() {
			
			setData( _data.sockName, _connection.sockName );
			setData( _data.sockPort, _connection.sockPort );
			setData( _data.peerPort, _connection.peerPort );
			setData( _data.peerName, _connection.peerName );
			_connection.OnData = OnData;
			_connection.OnDisconnected = OnDisconnected;
			_state.Leave(STATE_CONNECTING);
			_state.Enter(STATE_CONNECTED);
			getData(_data.ident) && Ident( io, function(identRequest) identRequest + ' : '+getData(_data.ident.userid)+' : '+getData(_data.ident.opsys)+' : '+getData(_data.nick)+CRLF, 2*SECOND ); // let 2 seconds to the server to make the IDENT request
		}

		var getServer = new function() {
			
			for ( var j = 0; j < getData(_data.serverRetry); j++ )
				for each ( let serverInfo in getData(_data.serverList) ) {
					
					var [server, ports] = serverInfo.split(':', 2);
					for each ( let port in ExpandStringRanges(ports) )
						for ( var i = 0; i < getData(_data.serverRetry); i++ )
							yield [server, port];
				}
		}
		
		function TryNextServer() {
			
			try {
			
				var [host, port] = getServer.next();
			} catch(ex if ex == StopIteration) {
			
				Failed('Unable to connect to any server.');
			}
			
			DBG && ReportNotice( 'Trying to connect to ' + host + ':' + port );
			_connection = new TCPConnection(host, port);
			_connection.OnFailed = function() {

				DBG && ReportError('Failed to connect to ' + host + ':' + port );
				io.AddTimeout( getData(_data.serverRetryPause), TryNextServer );
			}
			_connection.OnConnected = OnConnected;
			_connection.Connect();
			setData( _data.connectTime, IntervalNow() );
		}
		TryNextServer();
		_state.Enter(STATE_CONNECTING);
	}
	
	_api.Send = _core.Send;
	_api.AddMessageListener = _messageListener.Add;
	_api.RemoveMessageListener = _messageListener.Remove;
	_api.ToggleMessageListener = _messageListener.Toggle;
	_api.AddModuleListener = _moduleListener.Add;
	_api.RemoveModuleListener = _moduleListener.Remove;
	_api.ToggleModuleListener = _moduleListener.Toggle;
	_api.FireModuleListener = _moduleListener.Fire;

	this.AddModule = function( moduleConstructor, creationFunction, source ) {
	
		var module = new moduleConstructor(_data, _api, _state);

		if ( module.disabled ) {
		
			ReportWarning( 'Module '+source+' is disabled.' );
			return;
		}
		
		if ( module.moduleApi )
			for ( let f in module.moduleApi )
				if ( f in _api ) { // avoid module API do be overwritten
					
					ReportError( f+' function already defined in module API. Module '+source+' cannot be loaded.' );
					RemoveModule(module);
					return;
				} else {
				
					_api[f] = module.moduleApi[f];
				}
			
		if ( module.stateListener )
			for each ( let {set:set, reset:reset, trigger:trigger} in module.stateListener )
				_state.AddStateListener(set, reset, trigger);

		
		if ( module.moduleListener )
			_moduleListener.Add( module.moduleListener );
		
		if ( module.messageListener )
			_messageListener.Add( module.messageListener );
		
		module.Reload = creationFunction; // this function allows the module to completly reload itself from the same source
		module.name = module.name || moduleConstructor.name || IdOf(source).toString(36); // modules MUST have a name.
		module.source = source; // not mendatory for the moment
		_modules.push(module);
		_state.Enter(module.name); // don't move this line
	}
	
	
	this.RemoveModule = function( module ) {
		
		if ( !DeleteArrayElement(_modules, module) ) // remove the module from the module list
			return;

		_state.Leave(module.name);

		if ( module.messageListener )
			_messageListener.Remove( module.messageListener );

		if ( module.moduleListener )
			_moduleListener.Remove( module.moduleListener );
		
		if ( module.moduleApi )
			for ( var f in module.moduleApi )
				delete _api[f];
				
		if ( module.stateListener )
			for each ( let {set:set, reset:reset, trigger:trigger} in module.stateListener )
				_state.RemoveStateListener(set, reset, trigger);

		Clear(module); // jsstd
	}
	
	this.ReloadModule = function( module ) {
		
		var ReloadFct = module.Reload;
		for each ( let m in _core.ModulesByName(module.name) )
			_core.RemoveModule(m); // remove existing module with the same name
		ReloadFct();
	}
	
	this.ModulesByName = function( name ) { // note: this.HasModuleName = function( name ) _modules.some(function(mod) mod.name == name);

		return [ mod for each ( mod in _modules ) if ( mod.name == name ) ];
	}

	this.ModuleList = function() _modules.slice(); // slice() to prevent dead-loop

	for each ( let moduleURL in getData(_data.moduleList) )
		LoadModuleFromURL( _core, moduleURL );

	Seal(this); // jsstd
}


///////////////////////////////////////////////// MAIN /////////////////////////////////////////////


function DateString() let ( d = new Date ) d.getFullYear() + StringPad(d.getMonth()+1,2,'0') + StringPad(d.getDate(),2,'0');

log.AddFilter( MakeLogFile(function() 'jsircbot_'+DateString()+'.log', false), LOG_ALL - LOG_NET );
log.AddFilter( MakeLogScreen(), LOG_FAILURE | LOG_ERROR | LOG_WARNING );

ReportNotice('Start at '+(new Date()));
// starting
var core = new ClientCore(Exec('configuration.js'));

try {

	core.Connect();
	// running	
	io.Process( function() core.hasFinished() || endSignal );
	// ending
	if ( endSignal ) {

		core.Disconnect();
		io.Process( function() core.hasFinished() );
	}
} catch( ex if ex instanceof IoError ) {

	DBG && ReportFailure( 'IoError: '+ ex.text + ' ('+ex.os+')' );
}

DBG && ReportNotice('**************************** Gracefully end.');
log.Close();


var remainingOpenDescriptors = io.Close(); // this must be done at the very end
Print( 'remaining open descriptors: '+remainingOpenDescriptors );

GetExitValue(); // this must be the last evaluated expression

/*

http://www.irchelp.org/irchelp/misc/ccosmos.html

DCC protocol (Direct Client Connection):
  http://www.irchelp.org/irchelp/rfc/dccspec.html
  
CTCP Protocol (Client-To-Client Protocol)
  http://www.irchelp.org/irchelp/rfc/ctcpspec.html
  http://mathieu-lemoine.developpez.com/tutoriels/irc/ctcp/

misc links:
	modes infos/servers: http://www.alien.net.au/irc/chanmodes.html
	http://www.irchelp.org/irchelp/rfc/rfc2811.txt
	http://www.croczilla.com/~alex/reference/javascript_ref/object.html
	http://www.js-examples.com/javascript/core_js15/obj.php
	CTCP: http://www.irchelp.org/irchelp/rfc/ctcpspec.html

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
*/


/* Character codes
   
   ...
   Because of IRC's Scandinavian origin, the characters {}|^ are
   considered to be the lower case equivalents of the characters []\~,
   respectively. This is a critical issue when determining the
   equivalence of two nicknames or channel names.

*/


/* IRC Messages

   Each IRC message may consist of up to three main parts: the prefix
   (OPTIONAL), the command, and the command parameters (maximum of
   fifteen (15)).  The prefix, command, and all parameters are separated
   by one ASCII space character (0x20) each.

   The presence of a prefix is indicated with a single leading ASCII
   colon character (':', 0x3b), which MUST be the first character of the
   message itself.  There MUST be NO gap (whitespace) between the colon
   and the prefix.  The prefix is used by servers to indicate the true
   origin of the message.  If the prefix is missing from the message, it
   is assumed to have originated from the connection from which it was
   received from.  Clients SHOULD NOT use a prefix when sending a
   message; if they use one, the only valid prefix is the registered
   nickname associated with the client.

   The command MUST either be a valid IRC command or a three (3) digit
   number represented in ASCII text.

   IRC messages are always lines of characters terminated with a CR-LF
   (Carriage Return - Line Feed) pair, and these messages SHALL NOT
   exceed 512 characters in length, counting all characters including
   the trailing CR-LF. Thus, there are 510 characters maximum allowed
   for the command and its parameters.  There is no provision for
   continuation of message lines.  See section 6 for more details about
   current implementations.
*/
