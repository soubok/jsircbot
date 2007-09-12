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

	var _timeout = new function() {

		var _min, _tlist = {};
		
		this.Add = function( time, func ) {

			var when = IntervalNow() + time;
			while( when in _tlist ) when++; // avoid same time because we use the time as timer id
			_tlist[when] = func;
			if ( when < _min )
				_min = when;
			return when; // timer id
		}

		this.Remove = function(when) {

			if ( when == _min )
				_min = Number.POSITIVE_INFINITY;
			delete _tlist[when];
		}

		this.Process = function(defaultTimeout) {
		
			var now = IntervalNow();
			if ( _min <= now )
				for ( var w in _tlist )
					if ( w <= now ) {

						void _tlist[w]();
						delete _tlist[w];
					}
			_min = Number.POSITIVE_INFINITY;
			for ( var w in _tlist )
				if ( w < _min )
					_min = w;
			var t = _min - now;
			return t > defaultTimeout ? defaultTimeout : t;
		}
	}
	
	var _descriptorList = [];
	
	this.AddTimeout = function( time, fct ) _timeout.Add( time, fct );

	this.RemoveTimeout = function( when ) _timeout.Remove( when );

	this.AddDescriptor = function( d ) _descriptorList.push(d);

	this.RemoveDescriptor = function(d) {
		
		var pos = _descriptorList.indexOf(d);
		pos != -1 && _descriptorList.splice( pos, 1 );
	}

	this.Process = function( endPredicate ) {
		
		while ( !endPredicate() )
			Poll(_descriptorList, _timeout.Process(500));
	}
	
	this.Close = function() {
		
		for each ( var d in _descriptorList )
			d.Close();
	}
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
		OnResponse();
	}

	socket.writable = function() {

		delete socket.writable;
		socket.Write(data);
	}

	socket.readable = function() {

		delete socket.readable;
		var data = socket.Read(8192);
		socket.Close();
		io.RemoveTimeout(timeoutId);
		io.RemoveDescriptor(socket);
		OnResponse && OnResponse(data, IntervalNow() - time);
	}

	io.AddDescriptor(socket);
	timeoutId = io.AddTimeout( timeout, function() {

		socket.Close();
		io.AddDescriptor(socket);
		OnResponse && OnResponse(undefined, IntervalNow() - time);
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
		OnResponse();
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
			OnResponse && OnResponse(buffer, IntervalNow() - time);
		}
	}

	io.AddDescriptor(socket);
	timeoutId = io.AddTimeout( timeout, function() {

		socket.Close();
		io.AddDescriptor(socket);
		OnResponse && OnResponse(undefined, IntervalNow() - time);
	});
}	


///////////////////////////////////////////////////////


function HttpRequest( url, data, timeout, OnResponse ) {

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

	TCPGet( ud.host, ud.port||80, statusLine + CRLF + MakeHeaders(headers) + CRLF + body, 2000, function( response ) {

		if ( !response ) {
		
			OnResponse();
			return;
		}
			
		try {

			var [httpVersion,statusCode,reasonPhrase] = CHK(response.ReadUntil(CRLF)).split(' ',3);
			var headers = {};
			for each ( var h in CHK(response.ReadUntil(CRLF+CRLF)).split(CRLF) ) {

				var [k, v] = h.split(': ',2); 
				headers[k] = v;
			}
			OnResponse(statusCode, reasonPhrase, headers, response);
		} catch(ex if ex == ERR) {

			OnResponse();
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

function SocketConnection( host, port ) {

	var _this = this;
	
	this.OnConnected = Noop;
	this.OnData = Noop;
	this.OnDisconnected = Noop;
	this.OnFailed = Noop;
	
	var _socket;	
	if ( host instanceof Socket ) {
		
		_socket = host;
	} else {
		_socket = new Socket(Socket.TCP);
		_socket.nonblocking = true;
		_socket.noDelay = true;

		try {
			_socket.Connect(host, port);

		} catch(ex) {

			ConnectionFailed();
			return;
		}

		var _connectionTimeout;

		function ConnectionFailed() {

			delete _socket.writable;
			delete _socket.readable;
			io.RemoveTimeout(_connectionTimeout);
			_socket.Close();
			_this.OnFailed();
		}
		
		_connectionTimeout = io.AddTimeout( 5000, ConnectionFailed );

		_socket.writable = function(s) {

			delete s.writable;
			io.RemoveTimeout(_connectionTimeout);
			_this.OnConnected();
		}
	}
	
	io.AddDescriptor(_socket);

	_socket.readable = function(s) {

		var buf = s.Read();
		if ( buf.length == 0 ) {

			delete s.readable;
			_this.OnDisconnected(true);
		}	else {

			_this.OnData(buf);
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
			_this.OnDisconnected(false); // locally disconnected
		}
		_socket.readable = Disconnected;
		shutdownTimeout = io.AddTimeout( 2000, Disconnected ); // force disconnect after the timeout
	}

	this.Write = function(data) _socket.Write(data);
}


function SocketServer( port, ip, OnIncoming ) {

	var _server = new Socket(Socket.TCP);
	_server.nonblocking = true;
	
	_server.Bind(port, ip);
	_server.Listen();
	_server.readable = function(s) OnIncoming(new SocketConnection( s.Accept() ));
	this.Close = function() {

		io.RemoveDescriptor(_server);
		_server.Close();
	}
	io.AddDescriptor(_server);
}
