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

		this.Next = function(defaultTimeout) {

			_min = Number.POSITIVE_INFINITY;
			for ( var w in _tlist )
				if ( w < _min )
					_min = w;
			var t = _min - IntervalNow();
			return t > defaultTimeout ? defaultTimeout : t;
		}

		this.Process = function() {
		
			var now = IntervalNow();
			if ( _min > now )
				return;
			for ( var w in _tlist )
				if ( w <= now ) {
				
					_tlist[w]();
					delete _tlist[w];
				}
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
		
		while ( !endPredicate() ) {

			Poll(_descriptorList, _timeout.Next(500));
			_timeout.Process();
		}
	}
	
	this.Close = function() {
		
		for each ( var d in _descriptorList )
			d.Close();		
	}
}


///////////////////////////////////////////////////////


function UDPGet( host, port, data, timeout, OnResponse ) {

	var timeout;
	var time = IntervalNow();
	var ms = new Socket( Socket.UDP );
	ms.nonblocking = true;
	ms.Connect( host, port );

	ms.writable = function() {

		delete ms.writable;
		ms.Write(data);
	}

	ms.readable = function() {

		delete ms.readable;
		var data = ms.Read(8192);
		ms.Close();
		io.RemoveTimeout(timeout);
		io.RemoveDescriptor(ms);
		OnResponse && OnResponse(data, IntervalNow() - time);
	}

	io.AddDescriptor(ms);
	timeout = io.AddTimeout( timeout, function() {

		ms.Close();
		io.AddDescriptor(ms);
		OnResponse && OnResponse();
	});
}	


///////////////////////////////////////////////////////


function TCPGet( host, port, data, timeout, OnResponse ) {

	var timeout;
	var time = IntervalNow();
	var socket = new Socket( Socket.UDP );
	socket.nonblocking = true;
	socket.Connect( host, port );
	var buffer = new Buffer();

	socket.writable = function() {

		data = socket.Write(data);
		data || delete socket.writable;
	}

	socket.readable = function() {

		var tmp = socket.Read(8192);
		if ( tmp.length )
			buffer.Write( tmp );
		else {
		
			socket.Close();
			io.RemoveTimeout(timeout);
			io.RemoveDescriptor(socket);
			OnResponse && OnResponse(buffer.Read(), IntervalNow() - time);
		}
	}

	io.AddDescriptor(socket);
	timeout = io.AddTimeout( timeout, function() {

		socket.Close();
		io.AddDescriptor(socket);
		OnResponse && OnResponse();
	});
}	


///////////////////////////////////////////////////////


function HttpPost( url, data, timeout, OnResponse ) {

	var ud = ParseUri(url);
	var headers = { Host:ud.host, Connection:'Close' };
	var statusLine = MakeStatusLine( data ? 'POST' : 'GET', ud.path );
	var body = '';
	if ( data ) {

		body = FormURLEncode(data);
		headers['Content-Length'] = body.length;
		headers['Content-Type'] = 'application/x-www-form-urlencoded';
	}

	var httpSocket = new Socket();
	httpSocket.nonblocking = true;
	io.AddDescriptor( httpSocket );
	var timeoutId = io.AddTimeout( timeout, Finalize );

	function Finalize() {

		io.RemoveTimeout(timeoutId);
		httpSocket.Close();
		io.RemoveDescriptor( httpSocket );
		OnResponse();
	}

	httpSocket.writable = function(s) {

		s.Write(statusLine + CRLF + MakeHeaders(headers) + CRLF + body);
		delete s.writable;
	}

	var responseBuffer = new Buffer();

	httpSocket.readable = function(s) {

		var chunk = s.Read();
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
				OnResponse(statusCode, reasonPhrase, headers, responseBuffer.Read());
			} catch(ex if ex == ERR) {

//				log.WriteLn( 'Error while parsing HTTP response' );
				OnResponse();
			}
		}
	}
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

function SocketConnection() {

	var _socket = new Socket(Socket.TCP);
	_socket.nonblocking = true;
	_socket.noDelay = true;

	this.Connect = function( host, port, OnConnected, OnData, OnClose, OnFailed ) {

		var _connectionTimeout;
		
		function ConnectionFailed() {
			
			io.RemoveTimeout(_connectionTimeout);
			io.RemoveDescriptor(_socket)
			_socket.Close();
			OnFailed();
		}

		_socket.writable = function(s) {
		
			delete s.writable;
			io.RemoveTimeout(_connectionTimeout);
			OnConnected();
		}
		
		_socket.readable = function(s) {
			
			var buf = s.Read();
			if ( buf.length == 0 ) {
				
				delete s.readable;
				io.RemoveDescriptor(s);
				s.Close();
				OnDisconnected();
			}	else {
			
				OnData(buf);
			}
		}
		
		io.AddDescriptor(_socket);
		_connectionTimeout = io.AddTimeout( 5000, ConnectionFailed );

		try {		
			_socket.Connect(host, port);
			
		} catch(ex) {
			
			ConnectionFailed();
		}
	}
	
	this.Disconnect = function() {

		delete _socket.writable;
		_socket.Shutdown(); // both
		var shutdownTimeout;
		function Close() {

			io.RemoveTimeout(shutdownTimeout); // cancel the timeout
			io.RemoveDescriptor(_socket); // no more read/write notifications are needed
			_socket.Close();
			OnDisconnected();
		}
		_socket.readable = Close;
		shutdownTimeout = io.AddTimeout(1000, Close); // force disconnect after the timeout
	}
	
	this.Write = function(data) _socket.Write(data);
}

