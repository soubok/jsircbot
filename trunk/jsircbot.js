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


///////////////////////////////////////////////// TOOLS /////////////////////////////////////////////


function MakeModuleFromUrl( url, callback ) {

	ReportNotice( 'Loading module from: '+url );
	
	var args = arguments;
	HttpRequest( url, '', 2000, function(status, statusCode, reasonPhrase, headers, body ) {

		if ( status != OK || statusCode != 200 ) {

			ReportError('Failed to load the module from '+url+' (reason:'+reasonPhrase+')');
			return;
		}
		try {
			
			var relativeLineNumber;
			try { throw new Error() } catch(ex) { relativeLineNumber = ex.lineNumber }		
			var mod = new (eval(body));
			mod.Reload = function() args.callee.apply(null, args);
			callback(mod);
		} catch(ex) {

			ReportError('Failed to make the module '+url+' ('+ExToText(ex)+')');
		}
	});
}


function MakeModuleFromPath( path, callback ) {

	ReportNotice( 'Loading module from: '+path );

	var args = arguments;
	try {
		
		var mod = new (Exec(path, false)); // do not save compiled version of the script
		mod.Reload = function() args.callee.apply(null, args);
		callback(mod);
	} catch(ex) {

		ReportError('Failed to make the module from '+path+' ('+ExToText(ex)+')');
	}
}


function LoadModuleFromURL( core, url ) {
	
	function InstallLoadedModule( mod ) {
		
		var module = core.ModuleByName(mod.name);
		if ( module )
			core.RemoveModule(module); // remove existing module with the same name
		core.AddModule(mod);
	}

	const defaultSufix = '.jsmod';
	var ud = ParseUri(url);
	
	switch (ud.protocol) {
		case 'file':
			var path = ud.path.substr(1);
			if ( path.substr(-1) == '/' ) {
				
				var entry, dir = new Directory(path, Directory.SKIP_BOTH);
				for ( dir.Open(); (entry = dir.Read()); )
					if ( StringEnd( entry, defaultSufix ) )
						MakeModuleFromPath( path+entry, InstallLoadedModule );
			} else
				MakeModuleFromPath( path, InstallLoadedModule );
			break;
		case 'http':
			MakeModuleFromUrl( url, InstallLoadedModule );
			break;
		default:
			ReportError('Invalid module source: '+url);
	}	
}



function MakeFloodSafeMessageSender( maxMessage, maxData, time, RawDataSender ) {

	var _count = maxMessage;
	var _bytes = maxData;
	var _instantMessageQueue = [];
	var _messageQueue = [];
	var _timeoutId;

	function Process() {
		
		ReportNotice( 'MakeFloodSafeMessageSender:: COUNT:'+ _count + ' BYTES:'+ _bytes+' QUEUE_LENGTH:'+_messageQueue.length );
	
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
		
		if ( !_timeoutId ) // do not reset the timeout
			_timeoutId = io.AddTimeout( time, Timeout );
	}
	
	function Timeout() {

		_timeoutId = undefined;
		_count = maxMessage;
		_bytes = maxData;
		_messageQueue.length && Process(); // process if needed. else no more timeout
	}
	
	return function( message, bypassAntiFlood, OnSent ) {
		
		if ( message ) { 
		
			(bypassAntiFlood ? _instantMessageQueue : _messageQueue).push([message instanceof Array ? message : [message], OnSent]);
			Process();
		}
		return _messageQueue.length / maxMessage; // <1 : ok, messages are send; >1: beware, queue is full.
	}
}


///////////////////////////////////////////////// CORE /////////////////////////////////////////////


function ClientCore( Configurator ) {

	var _core = this;
	var _data = newDataNode();
	Configurator(_data);
	var _numericCommand = Exec('NumericCommand.js');
	var _connection;
	var _modules = [];
	var _messageListener = new Listener();
	var _moduleListener = new Listener();
	var _coreListener = new Listener();
	var _api = new SetOnceObject();
	var _hasFinished = false;
	
	function RawDataSender(buf) {

		log.WriteLn( 'irc', '<-' + buf );
		_connection.Write(buf).length && Failed('Unable to send (more) data.');
		setData( _data.lastMessageTime, IntervalNow() );
	}	

	this.Send = MakeFloodSafeMessageSender( getData(_data.antiflood.maxMessage), getData(_data.antiflood.maxBytes), getData(_data.antiflood.interval), RawDataSender );

	this.hasFinished = function() _hasFinished;
	this.Disconnect = function() _connection.Disconnect(); // make a Gracefully disconnect ( disconnect != close )
	
	this.Connect = function() {
		
		var _receiveBuffer = new Buffer();

		function OnData(buf) {

			_receiveBuffer.Write(buf);
			var message;
			while ( (message = _receiveBuffer.ReadUntil(CRLF)) ) {
				
				log.WriteLn( 'irc', '->'+message);
				try {
/*
    message    =  [ ":" prefix SPACE ] command [ params ] crlf
    prefix     =  servername / ( nickname [ [ "!" user ] "@" host ] )
    command    =  1*letter / 3digit
    params     =  *14( SPACE middle ) [ SPACE ":" trailing ]
               =/ 14( SPACE middle ) [ SPACE [ ":" ] trailing ]

    nospcrlfcl =  %x01-09 / %x0B-0C / %x0E-1F / %x21-39 / %x3B-FF
                    ; any octet except NUL, CR, LF, " " and ":"
    middle     =  nospcrlfcl *( ":" / nospcrlfcl )
    trailing   =  *( ":" / " " / nospcrlfcl )					
*/
					// The prefix is used by servers to indicate the true origin of the message.
					var prefix = message.indexOf( ':' );
					var trailing = message.indexOf( ':', 1 );
					var args = message.substring( prefix ? 0 : 1, (trailing > 0) ? trailing-1 : message.length ).split(' ');
					if ( prefix != 0 ) // If the prefix is missing from the message, it is assumed to have originated from the connection from which it was received from.
						args.unshift( undefined );
					if ( trailing != 0 )
						args.push( message.substring( trailing + 1 ) );
					if ( !isNaN(args[1]) )
						args[1] = _numericCommand[parseInt(args[1])]||parseInt(args[1]);
					args.splice(1, 0, args.shift()); // move the command name to the first place.

					_messageListener.Fire.apply( null, args );

				} catch (ex if ex == ERR) {
				
					ReportError('Invalid IRC server message');
				}
			}
		}

		function OnDisconnected( remotelyDisconnected ) {
			
			ReportWarning( remotelyDisconnected ? 'Remotely disconnected' : 'Locally disconnected' );

			for each ( mod in _core.ModuleList() ) 
				_core.RemoveModule( mod );

			_coreListener.Fire('OnDisconnected');
			_hasFinished = true;
			_connection.Close();
			// (TBD) retry if remotelyDisconnected ?
		}
		
		function OnConnected() {
			
			setData( _data.sockName, _connection.sockName );
			setData( _data.sockPort, _connection.sockPort );
			setData( _data.peerPort, _connection.peerPort );
			setData( _data.peerName, _connection.peerName );
			_connection.OnData = OnData;
			_connection.OnDisconnected = OnDisconnected;
			_coreListener.Fire('OnConnected');
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
			
			ReportNotice( 'Trying to connect to ' + host + ':' + port );
			_connection = new TCPConnection(host, port);
			_connection.OnFailed = function() {

				ReportError('Failed to connect to ' + host + ':' + port );
				
				var _timeoutId = io.AddTimeout( getData(_data.serverRetryPause), function() {
				
					TryNextServer();
				});
			}
			_connection.OnConnected = OnConnected;
			_connection.Connect();
			setData( _data.connectTime, IntervalNow() );
		}

		TryNextServer();
		_coreListener.Fire('OnConnecting');
	}
		
	this.AddModule = function( mod ) {
		
		if ( mod.moduleApi )
			for ( let f in mod.moduleApi )
				_api[f] = mod.moduleApi[f];
		
		mod.moduleListener && _moduleListener.AddSet( mod.moduleListener );
		mod.messageListener && _messageListener.AddSet( mod.messageListener );

		mod.AddMessageListenerSet = _messageListener.AddSet;
		mod.RemoveMessageListenerSet = _messageListener.RemoveSet;
		mod.AddModuleListenerSet = _moduleListener.AddSet;
		mod.RemoveModuleListenerSet = _moduleListener.RemoveSet;
		mod.FireModuleListener = _moduleListener.Fire;

		mod.Send = this.Send;
		mod.data = _data;
		mod.api = _api;
		_modules.push(mod);

		_coreListener.AddSet(mod);

		mod.InitModule && mod.InitModule();
		return mod;
	}
	
	this.RemoveModule = function( mod ) {
	
		var pos = _modules.indexOf(mod);
		if ( pos == -1 ) return;
		_modules.splice(pos, 1);

		mod.messageListener && _messageListener.RemoveSet( mod.messageListener );
		mod.moduleListener && _moduleListener.RemoveSet( mod.moduleListener );

		if ( mod.moduleApi )
			for ( var f in mod.moduleApi )
				delete _api[f];

		mod.DestroyModule && mod.DestroyModule();
		_coreListener.RemoveSet(mod);
		Clear(mod);
	}
	
	this.ReloadModule = function( mod ) {

		if ( 'Reload' in mod && mod.Reload instanceof Function )
			mod.Reload();
		else
			ReportError('Unable to reload the module '+mod.name+': Reload function not found.');
	}
	
	this.ModuleByName = function( name ) {

		for each ( mod in _modules )
			if ( mod.name == name )
				return mod;
		return undefined;
	}

//	this.HasModuleName = function( name ) _modules.some(function(mod) mod.name == name);

	this.ModuleList = function() _modules.slice(); // slice() to prevent dead-loop

	for each ( let moduleURL in getData(_data.moduleList) )
		LoadModuleFromURL( this, moduleURL );

	Seal(this);
}


///////////////////////////////////////////////// MAIN /////////////////////////////////////////////


var log = new Log;
log.AddFilter( MakeLogFile('jsircbot.log', false), 'irc net http error warning failure notice' );
log.AddFilter( MakeLogScreen(), 'irc net http error warning failure notice' );

function ReportNotice(text) log.WriteLn( 'notice', text);
function ReportWarning(text) log.WriteLn( 'warning', text)
function ReportError(text) log.WriteLn( 'error', text);
function ReportFailure(text) log.WriteLn( 'failure', text);

ReportNotice('log initialized @ '+(new Date()));
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

	ReportFailure( 'IoError: '+ ex.text + ' ('+ex.os+')' );
}

ReportNotice('**************************** Gracefully end.');
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
	This is the same as saying that - and the characters 0 to 9 and A to } in the ASCII table are allowed.
	The first character in a nick cannot be a - or a number.

	The characters { } | ^ are considered the lower case equivalents of [ ] \ ~ respectively. This is said to be because of IRCs scandinavian origin, 
	but while scandinavians will notice that Æ,Ø,Å is forced lowercase in channelnames, Å and Ä is not equivalent with each other or 
	with any of { } | ^. This bear the mark of a backward-compatible ircu feature, and how non-american letters are treated on IRC may vary between nets.

	A weird side-effect happens when trying to ban people with these characters in the name.
	Trying to ban the nick ac\dc, *|*!*@* will work where *\*!*@* fails. *ac\dc*!*@* works just fine too.
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
