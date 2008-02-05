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

var io = new function() {

/* need to be fix*/
	var _timeout = new function() {

		var _tlist = {};
		var _min = Infinity;
		
		this.Add = function(time, func) {
			
			DBG && isNaN(time) && Failed('the timeout is not a number ('+time+')');
			
			var date = IntervalNow() + time;
			while ( date in _tlist )
				date++; // avoid same time because we use the time as timer id
			_tlist[date] = func;
			if ( date < _min )
				_min = date;
				
			return date; // timer id
		}

		this.Remove = function(date) {
			
			delete _tlist[date];
			if ( date == _min )
				_min = -Infinity;
		}

		this.Process = function() {
			
			var now = IntervalNow();
			if ( _min <= now ) {

				var date, expiredList = {};
				for ( date in _tlist )
					if ( date <= now )
						expiredList[date] = _tlist[date];
				for ( date in expiredList ) {
				
					delete _tlist[date];
					void expiredList[date].call(expiredList[date]); // 'this' will be the function itself
				}
				_min = Infinity;
				for ( let date in Iterator(_tlist, true) )
					if ( date < _min )
						_min = date;
			}
			return _min - now;
		}
		
		INSPECT.push(function() let ( now=IntervalNow() ) 'TIMEOUT '+[(date-now)+':'+fct.name for ( [date,fct] in Iterator(_tlist) )].join(' ')+' MIN='+(_min-now)+'');
	}

	var _descriptorList = [];
	
	this.AddTimeout = _timeout.Add;

	this.RemoveTimeout = _timeout.Remove;

	this.AddDescriptor = function(d) _descriptorList.push(d);

	this.RemoveDescriptor = function(d) _descriptorList.some( function(item, index) item == d && _descriptorList.splice(index, 1) );

	this.Process = function( endPredicate ) {
		
		while ( !endPredicate() ) {
		
			Poll(_descriptorList, Math.min(_timeout.Process(), 500));
//			_descriptorList = _descriptorList.slice();  // copy to avoid memory leaks ( bz404755 )
		}
	}
	
	this.Close = function() {
		
		for each ( let d in _descriptorList )
			d.Close();
		return _descriptorList.splice(0).length; // empty the descriptor list and returns the count of remaining open descriptor
	}
	
	INSPECT.push(function() 'DESCRIPTORS '+_descriptorList.length+':'+[desc.peerPort+':'+desc.peerName for each ( desc in _descriptorList )].join(' ')+' ');
	
}

/////////////////////////////////////////////////////// Assync function helpers


function AsyncSleep(delay) function(callback) io.AddTimeout( delay, callback );
	

///////////////////////////////////////////////////////

function GetHostByName( hostName ) {

	try {
	
		return Socket.GetHostsByName(hostName).shift(); // GetHostsByName returns an array of IP
	} catch(ex if ex instanceof IoError) {
	
		DBG && ReportError( 'GetHostByName failed', hostName, ex.code, ex.text );
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
	} catch(ex) {
	
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

/* (TBD) manage UDP errors and UDP exceptions
	socket.error =
	socket.exception = function() {
	
		DPrint( 'UDP socket error or exception' );
	}
*/

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
	} catch(ex) {
	
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
	
	function Connecting() {

		_socket.writable = function(s) {
			
			delete s.writable;
			_connectionTimeout && io.RemoveTimeout(_connectionTimeout);
			_this.sockPort = s.sockPort;
			_this.sockName = s.sockName;
			_this.peerPort = s.peerPort;
			_this.peerName = s.peerName;
			delete _this.Connect;
			_this.OnConnected && _this.OnConnected();
		}
	
		_socket.readable = function(s) { // (TBD) link _socket.readable to _this.OnData

			if ( s.available ) {
			
				_this.OnData && _this.OnData(_this);
			} else {

				delete s.readable;
				delete _this.sockPort;
				delete _this.sockName;
				delete _this.peerPort;
				delete _this.peerName;
				delete _this.Connect;
				delete _this.Sleep;
				delete _this.Read;
				delete _this.Write;
				_this.OnDisconnected && _this.OnDisconnected(true); // (TBD) define an enum like REMOTELY ?
			}
		}

		io.AddDescriptor(_socket);
	}
	
	if ( host instanceof Socket ) {
		
		_socket = host;
		Connecting();
	} else {
		
		this.Connect = function( timeout ) {
		
			DBG && ReportNotice( 'TCP CONNECTING TO: '+host+':'+port );

			delete _this.Connect;

			function ConnectionFailed() {

				delete _socket.writable;
				delete _socket.readable;
				io.RemoveTimeout(_connectionTimeout);
				_socket.Close();
				delete _this.Sleep;
				delete _this.Read;
				delete _this.Write;
				_this.OnFailed && _this.OnFailed(host, port);
			}

			_connectionTimeout = io.AddTimeout( timeout||5*SECOND, ConnectionFailed );
			_socket = new Socket(Socket.TCP);
			_socket.nonblocking = true;
			_socket.noDelay = true;

			try {

				_socket.Connect(host, port);
			} catch( ex if ex instanceof IoError ) {

				ConnectionFailed();
				return;
			}
			Connecting();
		}
	}
	
	this.Sleep = function(time) {
		
		var prev = [ arguments.callee, _socket.readable, _socket.writable ];
		delete _this.Sleep;
		delete _socket.readable;
		delete _socket.writable;
		io.AddTimeout( time, function() {
			
			[ _this.Sleep, _socket.readable, _socket.writable ] = prev;
		});
	}
	
	this.Close = function() {

		io.RemoveDescriptor(_socket); // no more read/write notifications are needed
		_socket.Close();
		delete _this.Connect;
		delete _this.Sleep;
		delete _this.Read;
		delete _this.Write;
	}

	this.Disconnect = function() {
		
		_socket.linger = 2000;
		delete _socket.writable;
		_socket.Shutdown(); // both
		var shutdownTimeout;
		function Disconnected() {

			delete _socket.readable;
			io.RemoveTimeout(shutdownTimeout); // cancel the timeout
			io.RemoveDescriptor(_socket); // no more read/write notifications are needed

			delete _this.sockPort;
			delete _this.sockName;
			delete _this.peerPort;
			delete _this.peerName;

			_this.OnDisconnected && _this.OnDisconnected(false); // locally disconnected  // (TBD) define an enum like LOCALLY ?
			_socket.Close();
		}
		_socket.readable = Disconnected;
		shutdownTimeout = io.AddTimeout( 2*SECOND, Disconnected ); // force disconnect after the timeout
		delete _this.Connect;
		delete _this.Sleep;
		delete _this.Read;
		delete _this.Write;
	}

	var _out = [];
	
	this.Read = function() _socket.Read();
	
	this.Write = function(item, async) { // string|function|generator, use_asynchronous_writing // (TBD) add a timeout

		function SendNext(s) {

			while (_out.length) {

				var item = _out.shift();
				if (!item)
					continue;
				if (item instanceof Array)
					_out = Array.concat(item, _out);
				if (item instanceof Function) {

					let chunk = item();
					chunk && _out.unshift(chunk, item);
					continue;
				}
				if (item.__iterator__) {

					try {
					
						_out.unshift(item.next(), item);
					} catch (ex if ex == StopIteration) {}
					continue;
				}
				item = s.Write(item);
				item && _out.unshift(item);
				DBG && remain && ReportWarning('Unable to write the whole data on the socket, split was needed ('+s.peerName+':'+s.peerPort+')');
				return true;
			}
			return false;
		}

		_out.push(item);

		if (async) {
			
			_socket.writable = function(s) {
				
				SendNext(s) || delete s.writable;
			}
		} else {
			
			delete _socket.writable;
			while ( SendNext(_socket) );
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
	_socket.reuseAddr = true;
	if ( !TryBindSocket( _socket, portRange, ip ) )
		DBG && ReportError('Unable to create the TCPServer, cannot bind to '+ip+':'+portRange );
	_socket.Listen(backlog);
	this.port = _socket.sockPort;
	this.name = _socket.sockName;
	_socket.readable = function(s) {
		
		var incomingConnection = s.Accept();
		DBG && ReportNotice( 'TCP CONNECTION REQUEST on '+incomingConnection.sockPort+' from '+incomingConnection.peerName );
		_this.OnIncoming(new TCPConnection(incomingConnection));
	}
	this.Close = function() {

		io.RemoveDescriptor(_socket);
		_socket.Close();
	}
	io.AddDescriptor(_socket);

	DBG && ReportNotice( 'TCP LISTENING: ' + this.name+':'+this.port );
}


/*
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


*/


