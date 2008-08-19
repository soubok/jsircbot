/* ***** BEGIN LICENSE BLOCK *****
 * Version: GNU GPL 3.0
 *
 * The contents of this file are subject to the
 * GNU General Public License Version 3.0; you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 * http://www.gnu.org/licenses/gpl.html
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 * ***** END LICENSE BLOCK ***** */
 
var io = new function() {

	var _descriptorList = [], _tlist = {}, _min = Infinity;

	this.AddTimeout = function(time, func) {

		DBG && isNaN(time) && Failed('the timeout is not a number ('+time+')');
		DBG && Math.floor(time) != time && ReportWarning('timeout should be an integer. see: '+GetCurrentCallStack(0));
		time = Math.floor(time); // (TBD) should be avoid;
		var date = IntervalNow() + time;
		while ( date in _tlist )
			date++; // avoid same time because we use the time as timer id
		_tlist[date] = func;
		if ( date < _min )
			_min = date;
		return date; // timer id
	}

	this.RemoveTimeout = function(date, execOnRemove) {

		var func = _tlist[date];
		delete _tlist[date];
		if ( date == _min )
			_min = -Infinity;
		execOnRemove && func && func.call(func); // 'this' will be the function itself
	}

	function ProcessTimeout() {

		var now = IntervalNow();
		if ( _min <= now ) {

			let date, expiredList = {};
			for ( date in _tlist )
				if ( date <= now )
					expiredList[date] = _tlist[date];

			for ( date in expiredList ) {

				delete _tlist[date];
				void expiredList[date].call(expiredList[date]); // 'this' will be the function itself
			}
			
			_min = Infinity;
			
			for ( date in _tlist )
				if ( date < _min )
					_min = date;
		}
		return _min - now;
	}

	this.AddDescriptor = function(d) _descriptorList.push(d); // (TBD) do a poll after the new descriptor has been added ? NO !

	this.HasDescriptor = function(d) _descriptorList.some( function(item) item == d );

	this.RemoveDescriptor = function(d) _descriptorList.some( function(item, index) item == d && _descriptorList.splice(index, 1) );

	this.GetDescriptorCount = function() _descriptorList.length;

	this.Close = function() {

		for each ( let d in _descriptorList )
			d.Close();
		_descriptorList.splice(0);
	}

	this.Process = function( endPredicate ) {
		
		var count, timeout;
		do {

			timeout = Math.min(ProcessTimeout(), 1*SECOND);
			DBG && DebugTrace( 'Poll('+_descriptorList.length+' descriptors, '+timeout+'ms timeout)' );
			count = Poll(_descriptorList, timeout); // _descriptorList = _descriptorList.slice();  // copy to avoid memory leaks ( bz404755 )
			DBG && DebugTrace( 'Poll returns '+ count );
			
		} while ( !endPredicate() );
	}

	INSPECT.push(function() let ( now=IntervalNow() ) 'TIMEOUT '+ObjPropertyCount(_tlist)+': '+[(date-now)+':'+fct.name for ( [date,fct] in Iterator(_tlist) )].join(' ')+' MIN='+(_min-now)+'');
	INSPECT.push(function() 'DESCRIPTORS '+_descriptorList.length+': '+[desc.sockName+':'+desc.sockPort+'-'+desc.peerPort+':'+desc.peerName for each ( desc in _descriptorList )].join('  ')+' ');
}

/////////////////////////////////////////////////////// Assync function helpers


function AsyncSleep(delay) function(callback) io.AddTimeout( delay, callback );
	

///////////////////////////////////////////////////////

function GetHostByName( hostName ) {

	try {
	
		return Socket.GetHostsByName(hostName).shift(); // GetHostsByName returns an array of IP
	} catch(ex if ex instanceof IoError) {
	
		DBG && DebugTrace( 'GetHostByName failed', hostName, ex.code, ex.text );
	}
	return undefined;
}


///////////////////////////////////////////////////////


function TryBindSocket( Socket, portRange, ip ) {

	for each ( let port in ExpandStringRanges(String(portRange)) )
		if ( Socket.Bind( port, ip ) )
			return true;
	return false;
}


///////////////////////////////////////////////////////


function UDPGet( host, port, data, timeout, OnResponse ) { // OnResponse( status, data, time )

	var timeoutId;
	var time = IntervalNow();
	var socket = new Socket( Socket.UDP );
	socket.nonblocking = true;
	// socket.noDelay = true; // (TBD) good for UDP ?

	try {
	
		socket.Connect( host, port );
	} catch (ex if ex instanceof IoError) {
	
		OnResponse && OnResponse.call(OnResponse, UNREACHABLE); // UDP, never UNREACHABLE ?
		return;
	}

	socket.writable = function() {

		delete socket.writable;
		socket.Write(data);
	}

	socket.readable = function() {

		delete socket.readable;
		var status, data;
		try {
		
			data = socket.Read(8192); // (TBD) find better than '''8192'''
			status = OK;
		} catch(ex if ex instanceof IoError) {
			
			status = ERROR; // IoError: TCP connection reset by peer (10054) ?? ( see. bottom of this page )
		}
		socket.Close();
		io.RemoveTimeout(timeoutId);
		io.RemoveDescriptor(socket);
		OnResponse && OnResponse.call(OnResponse, status, data, IntervalNow() - time);
	}

	socket.error =
	socket.exception = function() {
		
		io.RemoveTimeout(timeoutId);
		io.RemoveDescriptor(socket);
		OnResponse && OnResponse.call(OnResponse, UNREACHABLE);
	}

	io.AddDescriptor(socket);
	timeoutId = io.AddTimeout( timeout, function() {

		socket.Close();
		io.RemoveDescriptor(socket);
		OnResponse && OnResponse.call(OnResponse, TIMEOUT);
	});
}


///////////////////////////////////////////////////////


function TCPGet( host, port, data, timeout, OnResponse ) {

	var timeoutId;
	var time = IntervalNow();
	var socket = new Socket( Socket.TCP );
	socket.nonblocking = true;
	socket.noDelay = true;

	try {
	
		socket.Connect( host, port );
	} catch (ex if ex instanceof IoError) {
	
		OnResponse && OnResponse.call(OnResponse, UNREACHABLE);
		return;
	}

	var buffer = new Buffer();

	socket.writable = function(s) {

		delete s.writable;
		try {
		
			s.Write(data);
		} catch(ex if ex instanceof IoError) {

			s.Close();
			io.RemoveTimeout(timeoutId);
			io.RemoveDescriptor(s);
			
			OnResponse && OnResponse.call(OnResponse, UNREACHABLE);
		}	
	}

	socket.readable = function(s) {

		if ( s.available )
			buffer.Write(s.Read());
		else {
		
			s.Close();
			io.RemoveTimeout(timeoutId);
			io.RemoveDescriptor(s);
			OnResponse && OnResponse.call(OnResponse, OK, buffer, IntervalNow() - time);
		}
	}

	io.AddDescriptor(socket);
	timeoutId = io.AddTimeout( timeout, function() {

		socket.Close();
		io.RemoveDescriptor(socket);
		OnResponse && OnResponse.call(OnResponse, TIMEOUT);
	});
}	


///////////////////////////////////////////////////////


function HttpRequest( url, data, timeout, OnResponse ) { // OnResponse(status, statusCode, reasonPhrase, headers, response);
	
//	log.Write( 'http', url+' <-['+data+']...' );

	var ud = ParseUri(url);
	var headers = { Host:ud.host, Connection:'Close' };
	var statusLine = MakeStatusLine( data != undefined ? 'POST' : 'GET', ud.relative );

	if ( ud.userInfo )
		headers['Authorization'] = 'Basic ' + encode64(ud.userInfo);
	
	var body = '';
	if ( data ) {

		body = FormURLEncode(data);
		headers['Content-Type'] = 'application/x-www-form-urlencoded';
		headers['Content-Length'] = body.length;
	}

	log.Write( LOG_HTTP, url +' ====' + statusLine + CRLF + MakeHeaders(headers) + CRLF + body+'====' );
	
	TCPGet( ud.host, ud.port||80, statusLine + CRLF + MakeHeaders(headers) + CRLF + body, timeout, function( status, response ) {
		
		if ( DBG && status == OK ) {

			let buf = response.Read(300);
			log.Write( LOG_HTTP, buf+'  ...' );
			response.Unread(buf);
		}

		if ( status != OK ) {
			
			OnResponse && OnResponse.call(OnResponse, status);
			return;
		}
		
		if ( !response.length ) {
		
			OnResponse && OnResponse.call(OnResponse, EMPTYRESPONSE);
			return;
		}

		try {

//			var [httpVersion, statusCode, reasonPhrase] = CHK(response.ReadUntil(CRLF)).split(SPC, 3);
			var [, httpVersion, statusCode, reasonPhrase] = /(.+?) (\d+) (.*)/( CHK(response.ReadUntil(CRLF)) );
			
			var headers = NewDataObj();
			for each ( let h in CHK(response.ReadUntil(CRLF+CRLF)).split(CRLF) ) {

				var [k, v] = h.split(': ', 2); 
				headers[k] = v;
			}
			OnResponse && OnResponse.call(OnResponse, status, statusCode, reasonPhrase, headers, response.Read());
		} catch(ex if ex == ERR) {

			OnResponse && OnResponse.call(OnResponse, BADRESPONSE);
		}
	});
}


///////////////////////////////////////////////////////

function TCPConnection( host, port ) { // use ( host, port ) OR ( rendez-vous socket )
	
//	this.OnConnected;
//	this.OnData;
//	this.OnDisconnected;
//	this.OnFailed;

	var _this = this;
	var _socket, _connectionTimeout;
	
	function Connected() {
		
//		_socket.recvBufferSize = 16*KILOBYTE;
//		_socket.sendBufferSize = 16*KILOBYTE;
		delete _socket.error;
		delete _socket.exception;
		delete _socket.writable;
		_this.sockName = _socket.sockName;
		_this.sockPort = _socket.sockPort;
		_this.peerName = _socket.peerName; // only available once connected
		_this.peerPort = _socket.peerPort; // only available once connected
		_connectionTimeout && io.RemoveTimeout(_connectionTimeout);
		delete _this.Connect; // cannot connect twice
		
		_this.OnConnected && _this.OnConnected();

		_socket.readable = function(s) { // (TBD) link _socket.readable to _this.OnData ?

			if ( _socket.available ) {

				_this.OnData && _this.OnData(_this);
			} else { // disconnected case

				delete _socket.readable;
				delete _socket.writable;
				delete _this.Sleep;
				delete _this.Read;
				delete _this.Write;
				io.RemoveDescriptor(s); // no more read/write notifications are needed
				_this.OnDisconnected && _this.OnDisconnected(true); // (TBD) define an enum like REMOTELY ?
				MaybeCollectGarbage();
			}
		}
	}
	
	if ( host instanceof Socket ) {

		_socket = host;
		Connected(); // the incoming socket is already connected
		io.AddDescriptor(_socket);
	} else {
		
		this.Connect = function( timeout ) {
		
			ReportNotice( 'TCPConnection to: '+host+':'+port );
			delete _this.Connect;

			function ConnectionFailed() {

				delete _socket.error;
				delete _socket.exception;
				delete _socket.writable;
				delete _socket.readable;
				io.RemoveTimeout(_connectionTimeout);
				delete _this.Sleep;
				delete _this.Read;
				delete _this.Write;
				io.RemoveDescriptor(_socket); // no more read/write notifications are needed
				ReportWarning( 'TCPConnection to '+host+':'+port+' failed');// ('+ex.code+'; os:'+ex.os+', '+ex.text+')' );
				_this.OnFailed && _this.OnFailed(host, port);
				_this.Close(); // here we close the socket unlike in this.Disconnect/Disconnected
			}

			_socket = new Socket(Socket.TCP);
			_socket.nonblocking = true;
			_socket.noDelay = true;
			_socket.error = ConnectionFailed; // callback order is: error, exception, readable, writable
			_socket.exception = ConnectionFailed; // called if cannot connect
			_socket.readable = function(s) s.available || ConnectionFailed();
			_socket.writable = Connected;
			_connectionTimeout = io.AddTimeout( timeout || 5*SECOND, ConnectionFailed );
			try {

				_socket.Connect(host, port);
			} catch( ex if ex instanceof IoError ) {

				ConnectionFailed();
				return;
			}
			io.AddDescriptor(_socket);
		}
	}

	
	var _sleepTimeout;
	
	this.Sleep = function(time) {
		
		var _thisFunction = arguments.callee;
		delete _this.Sleep;
		io.RemoveDescriptor(_socket);
		_sleepTimeout = io.AddTimeout( time, function() { io.AddDescriptor(_socket); _this.Sleep = _thisFunction });
	}
	
	this.Close = function() {

		io.RemoveTimeout(_sleepTimeout, true);
		io.RemoveDescriptor(_socket); // no more read/write notifications are needed
		_socket.Close();
		Clear(_this);
	}

	this.Disconnect = function() {
		
		io.RemoveTimeout(_sleepTimeout, true);
		_socket.linger = 2000;
		delete _socket.writable;
		_socket.Shutdown(); // both
		var shutdownTimeout;
		function Disconnected() {

			delete _socket.readable;
			io.RemoveTimeout(shutdownTimeout); // cancel the timeout
			io.RemoveDescriptor(_socket); // no more read/write notifications are needed
			_this.OnDisconnected && _this.OnDisconnected(false); // locally disconnected  // (TBD) define an enum like LOCALLY ?
			delete _this.sockPort;
			delete _this.sockName;
			delete _this.peerPort;
			delete _this.peerName;
			MaybeCollectGarbage();
		}
		_socket.readable = Disconnected;
		shutdownTimeout = io.AddTimeout( 2*SECOND, Disconnected ); // force disconnect after the timeout
		delete _this.Connect;
		delete _this.Sleep;
		delete _this.Read;
		delete _this.Write;
	}

	this.Read = function() _socket.Read();
	
	var _out = new DataExpander();
	
	function Sender(s) {

		var data = _out.Read();
		if (!data) {

			delete s.writable;
			return;
		}

		try {
		
			data = s.Write(data);
		} catch (ex if ex instanceof IoError) {
		
			//if ( ex.code == -5961 || ex.code == -5928 ) { // Connection reset by peer | Connection aborted
			// (TBD) check if the diconnection is always detected: YES
			ReportError('@TCPConnection::Sender - IoError:'+ex.code+' '+ex.text);
			delete _out;
			delete s.writable;
			return;
		}

		if (data) {

			_out.UnRead(data);
			DBG && ReportWarning('@TCPConnection::Sender - missed write ('+_socket.peerName+':'+_socket.peerPort+')');
		}
	}

	this.Write = function(item, async /*, OnWritten*/) { // string|array|function|generator, use_asynchronous_writing // (TBD) add a timeout
		
		delete _socket.writable;
		_out.Write(item);
//		if ( OnWritten ) // (TBD)
//			_out.OnEmpty = function() OnWritten(OK);
		if (async) {

			var data = _out.Read(); // even if we are sending data asynchronously, we send the first chunk immediately.
			if (data) {

				let missed = _socket.Write(data);
				missed && _out.UnRead( missed );
				_socket.writable = Sender;
			}
		} else {
			
			let status, data;
			try {
			
				data = _socket.Write(_out.ReadAll());
				data && ReportWarning('@TCPConnection::Write - uable to send data at once to ('+_socket.peerName+':'+_socket.peerPort+')');
				status = data ? INCOMPLETE : OK;
			} catch (ex if ex instanceof IoError) {

				status = ERROR;
				data = ex;
				// (TBD) check if the diconnection is always detected
			}
//			OnWritten && OnWritten( status, data );
		}
	}
}

/*
function AsyncConnectionWaitData(c, timeout) function(callback) {

	 var tid = io.AddTimeout( timeout, function() { delete c.OnData; callback(TIMEOUT) } ); // force disconnect after the timeout
	 c.OnData = function() { delete c.OnData; io.RemoveTimeout(tid); callback(OK) } // helper function
}
*/

function AsyncConnectionWaitData(c, timeout) function(callback) { // beware: this function redefines OnData and OnDisconnected

	 var tid = io.AddTimeout( timeout, function() { delete c.OnData; callback(TIMEOUT) } ); // force disconnect after the timeout
	 c.OnData = function() { delete c.OnData; delete c.OnDisconnected; io.RemoveTimeout(tid); callback(OK) }
	 c.OnDisconnected = function() { delete c.OnData; delete c.OnDisconnected; io.RemoveTimeout(tid); callback(DISCONNECTED) }
}

function AsyncConnectionRead(c) function(callback) { // beware: this function redefines OnData
	
	 c.OnData = function(data) { delete c.OnData; callback(OK, c.Read()) } // helper function
}


function TCPServer( portRange, ip, backlog ) {

	var _this = this;
	this.OnIncoming = Noop;
	var _socket = new Socket(Socket.TCP);
	_socket.nonblocking = true;
	_socket.noDelay = true;
	_socket.reuseAddr = true;
	if ( !TryBindSocket( _socket, portRange, ip ) )
		DBG && ReportError('Unable to create the TCPServer, cannot bind to '+ip+':'+portRange );
	_socket.Listen(backlog);
	this.port = _socket.sockPort;
	this.name = _socket.sockName;
	_socket.readable = function(s) {
		
		var incomingConnection = s.Accept();
		ReportNotice( 'TCP CONNECTION REQUEST on '+incomingConnection.sockPort+' from '+incomingConnection.peerName );
		_this.OnIncoming(new TCPConnection(incomingConnection));
	}

	var _sleepTimeout;

	this.Sleep = function(time) {
		
		var _thisFunction = arguments.callee;
		delete _this.Sleep;
		io.RemoveDescriptor(_socket);
		_sleepTimeout = io.AddTimeout( time, function() { io.AddDescriptor(_socket); _this.Sleep = _thisFunction });
	}
	
	this.Close = function() {
		
		io.RemoveTimeout(_sleepTimeout, true);
		io.RemoveDescriptor(_socket);
		_socket.Close();
	}
	io.AddDescriptor(_socket);
	DBG && ReportNotice( 'TCP LISTENING: ' + this.name+':'+this.port );
}


/*
WSAECONNABORTED 10053 Connection aborted ( PR_CONNECT_ABORTED_ERROR (-5928L) )
	A connection abort was caused internal to your host machine. 
	The software caused a connection abort because there is no space on the socket's queue and the socket cannot receive further connections.

WSAECONNRESET 10054 Connection reset by peer.

    An existing connection was forcibly closed by the remote host. 
    This normally results if the peer application on the remote host is suddenly stopped, 
    the host is rebooted, the host or remote network interface is disabled, 
    or the remote host uses a hard close (see setsockopt for more information on the SO_LINGER option on the remote socket). 
    This error may also result if a connection was broken due to keep-alive activity detecting a failure while one or more operations are in progress. 
    Operations that were in progress fail with WSAENETRESET. Subsequent operations fail with WSAECONNRESET.
...

The socket is actually receiving an ICMP packet back to tell it the other end's dead - stop sending from the server to the dead client and the error goes away.
If you've implemented a reliable UDP method (resend / ack) you need to ensure that you also drop all outgoing ack packets queued for that client, and also flush the resend queue for that client.

man 7 socket:

       +----------------------------------------------------------------------+
       |                             I/O events                               |
       +-----------+-----------+----------------------------------------------+
       |Event      | Poll flag | Occurrence                                   |
       +-----------+-----------+----------------------------------------------+
       |Read       | POLLIN    | New data arrived.                            |
       +-----------+-----------+----------------------------------------------+
       |Read       | POLLIN    | A connection setup has been  completed  (for |
       |           |           | connection-oriented sockets)                 |
       +-----------+-----------+----------------------------------------------+
       |Read       | POLLHUP   | A  disconnection  request has been initiated |
       |           |           | by the other end.                            |
       +-----------+-----------+----------------------------------------------+
       |Read       | POLLHUP   | A connection is broken (only for connection- |
       |           |           | oriented  protocols).   When  the  socket is |
       |           |           | written SIGPIPE is also sent.                |
       +-----------+-----------+----------------------------------------------+
       |Write      | POLLOUT   | Socket has  enough  send  buffer  space  for |
       |           |           | writing new data.                            |
       +-----------+-----------+----------------------------------------------+
       |Read/Write | POLLIN|   | An outgoing connect(2) finished.             |
       |           | POLLOUT   |                                              |
       +-----------+-----------+----------------------------------------------+
       |Read/Write | POLLERR   | An asynchronous error occurred.              |
       +-----------+-----------+----------------------------------------------+
       |Read/Write | POLLHUP   | The other end has shut down one direction.   |
       +-----------+-----------+----------------------------------------------+
       |Exception  | POLLPRI   | Urgent data arrived.  SIGURG is sent then.   |
       +-----------+-----------+----------------------------------------------+

test program:
	LoadModule('jsstd');
	LoadModule('jsio');

	var dlist = []; //descriptor list
	try {

		var clientSocket = new Socket();
		clientSocket.nonblocking = true;
		clientSocket.error     = function(s, f) Print('e', f?1:0); // Array.slice(arguments)
		clientSocket.exception = function(s, f) Print('x', f?1:0);
		clientSocket.hangup    = function(s, f) Print('h', f?1:0);
		clientSocket.readable  = function(s, f) Print('r', f?1:0);
		clientSocket.writable  = function(s, f) Print('w', f?1:0);
		clientSocket.Connect( 'localhost', 8080 );
		dlist.push(clientSocket);

		while(!endSignal) {

			Print('.');
			Poll(dlist,0);
			Sleep(100); // to avoid my console being flood
		}

	} catch ( ex if ex instanceof IoError ) { 
		Print( ex.text + ' ('+ex.code+')', '\n' );
	} catch (ex) {
		throw(ex);
	}

*/



