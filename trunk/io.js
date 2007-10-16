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

		var _tlist = NewDataObj();
		var _min = Infinity;
		
		this.Add = function(time, func) {
			
			DBG && isNaN(time) && FAILED('the timeout is not a number');
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
				
				for ( let [date, fct] in Iterator(_tlist) )
				
					if ( date <= now ) {
						
						delete _tlist[date];
						void fct.call(fct); // 'this' will be the function itself
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


/*
	var _timeout = new function() {

		var _tlist = NewDataObj();
		
		this.Add = function( time, func ) {
			
			DBG && isNaN(time) && FAILED('the timeout is not a number');
			var when = IntervalNow() + time;
			while ( when in _tlist )
				when++; // avoid same time because we use the time as timer id
			_tlist[when] = func;
			return when; // timer id
		}

		this.Remove = function(when) delete _tlist[when];

		this.Process = function(next) {
		
			var now = IntervalNow();
			for ( let w in _tlist )
				if ( w <= now ) {

					void _tlist[w]();
					delete _tlist[w];
				} else {

					if ( w - now < next )
						next = w - now;
				}
			return next;
		}
	}

*/

	var _descriptorList = [];
	
	this.AddTimeout = _timeout.Add;

	this.RemoveTimeout = _timeout.Remove;

	this.AddDescriptor = function(d) _descriptorList.push(d);

	this.RemoveDescriptor = function(d) _descriptorList.some( function(item, index) item == d && _descriptorList.splice(index, 1) );

	this.Process = function( endPredicate ) {
		
		while ( !endPredicate() ) {

//			Print('-');
			Poll(_descriptorList, Math.min(_timeout.Process(), 500));
		}
	}
	
	this.Close = function() {
		
		for each ( let d in _descriptorList )
			d.Close();
		return _descriptorList.splice(0).length; // empty the descriptor list and returns the count of remaining open descriptor
	}
}

///////////////////////////////////////////////////////

function GetHostsByName( hostName ) {

	try {
		return Socket.GetHostsByName(hostName).shift(); // GetHostsByName returns an array of IP
	} catch(ex if ex instanceof IoError) {}
	return undefined;
}


///////////////////////////////////////////////////////


function TryBindSocket( Socket, portRange, ip ) {

	for each ( let port in ExpandStringRanges(portRange) )
		if ( Socket.Bind( port, ip ) )
			return true;
	return false;
}


///////////////////////////////////////////////////////


function UDPGet( host, port, data, timeout, OnResponse ) {

	var timeoutId;
	var time = IntervalNow();
	var socket = new Socket( Socket.UDP );
	socket.nonblocking = true;

	try {
		socket.Connect( host, port );
	} catch(ex) {
		OnResponse && OnResponse.call(OnResponse, UNREACHABLE); // UDP, never UNREACHABLE
	}

	socket.writable = function() {

		delete socket.writable;
		socket.Write(data);
	}

	socket.readable = function() {

		delete socket.readable;
		var status, data;
		try {
		
			data = socket.Read(8192);
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
	
		DPrint( 'UDP socket error or exception' );
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
	} catch(ex) {
		OnResponse && OnResponse.call(OnResponse, UNREACHABLE);
	}

	var buffer = new Buffer();

	socket.writable = function() {
	
		data = socket.Write(data);
		data || delete socket.writable;
	}

	socket.readable = function() {

		var tmp = socket.Read(8192);
		if ( tmp.length )
			buffer.Write(tmp);
		else {
		
			socket.Close();
			io.RemoveTimeout(timeoutId);
			io.RemoveDescriptor(socket);
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


function HttpRequest( url, data, timeout, OnResponse ) {
	
//	log.Write( 'http', url+' <-['+data+']...' );

	var ud = ParseUri(url);
	var headers = { Host:ud.host, Connection:'Close' };
	var statusLine = MakeStatusLine( data ? 'POST' : 'GET', ud.relative );

	if ( ud.userInfo )
		headers['Authorization'] = 'Basic ' + encode64(ud.userInfo);
	
	var body = '';
	if ( data ) {

		body = FormURLEncode(data);
		headers['Content-Type'] = 'application/x-www-form-urlencoded';
		headers['Content-Length'] = body.length;
	}

	TCPGet( ud.host, ud.port||80, statusLine + CRLF + MakeHeaders(headers) + CRLF + body, timeout, function( status, response ) {
	
//		DBG && log.Write( LOG_HTTP, 'HTTP GET: ' + url+' = \n'+response+'\n' ); // cannot read the response because this empty the buffer :)

		if ( status != OK ) {
			
			OnResponse && OnResponse.call(OnResponse, status);
			return;
		}
			
		try {

			var [httpVersion, statusCode, reasonPhrase] = CHK(response.ReadUntil(CRLF)).split(SPC, 3);
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


function ProxyHttpConnection( proxyHost, proxyPort ) {
	this.Connect = function( host, port, OnConnected, OnData, OnClose, OnFailed ) {
	}
	this.Disconnect = function() {
	}
	this.Write = function(data) {
	}
}

///////////////////////////////////////////////////////

function TCPConnection( host, port ) {
	
	var _this = this;
	this.OnConnected = Noop;
	this.OnData = Noop;
	this.OnDisconnected = Noop;
	this.OnFailed = Noop;
	var _connectionTimeout;
	var _socket;
	
	function Connecting() {

		_socket.writable = function(s) {

			delete s.writable;
			_connectionTimeout && io.RemoveTimeout(_connectionTimeout);
			_this.sockPort = s.sockPort;
			_this.sockName = s.sockName;
			_this.peerPort = s.peerPort;
			_this.peerName = s.peerName;
			_this.OnConnected();
		}
	
		_socket.readable = function(s) {

			var buf = s.Read();
			if ( buf.length == 0 ) {

				delete s.readable;

				delete _this.sockPort;
				delete _this.sockName;
				delete _this.peerPort;
				delete _this.peerName;
				
				_this.OnDisconnected(true);
			}	else
				_this.OnData(buf);
		}

		io.AddDescriptor(_socket);
	}
	
	if ( host instanceof Socket ) {
		
		_socket = host;
		Connecting();
	} else {
		
		this.Connect = function( timeout ) {
		
			DBG && ReportNotice( 'TCP CONNECTING TO: '+host+':'+port );

			function ConnectionFailed() {

				delete _socket.writable;
				delete _socket.readable;
				io.RemoveTimeout(_connectionTimeout);
				_socket.Close();
				_this.OnFailed(host, port);
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
	
	this.Close = function() {

		io.RemoveDescriptor(_socket); // no more read/write notifications are needed
		_socket.Close();
	}

	this.Disconnect = function() {

		delete _socket.writable;
		_socket.Shutdown(); // both
		var shutdownTimeout;
		function Disconnected() {

			delete _socket.readable;
			io.RemoveTimeout(shutdownTimeout); // cancel the timeout

			delete _this.sockPort;
			delete _this.sockName;
			delete _this.peerPort;
			delete _this.peerName;

			_this.OnDisconnected(false); // locally disconnected
		}
		_socket.readable = Disconnected;
		shutdownTimeout = io.AddTimeout( 2*SECOND, Disconnected ); // force disconnect after the timeout
	}

	this.Write = function(data) _socket.Write(data);
}


function TCPServer( portRange, ip ) {

	var _this = this;
	this.OnIncoming = Noop;
	var _socket = new Socket(Socket.TCP);
	_socket.nonblocking = true;
	_socket.reuseAddr = true;
	if ( !TryBindSocket( _socket, portRange, ip ) )
		DBG && ReportError('Unable to create the TCPServer, cannot bind to '+ip+':'+portRange );
	_socket.Listen();
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


