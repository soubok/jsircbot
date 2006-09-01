function Ident( io, callback, timeout ) {

	var identServerSocket = new Socket(); // create a server ( rendez-vous ) socket
	io.AddDescriptor( identServerSocket ); // add the socket to the 'pollable' list
	identServerSocket.Listen(113); // listen on port 113
	
	var listenTimeoutId = io.AddTimeout(timeout, function() { // create a timeout to prevent ...
		identServerSocket.Close();
		io.RemoveDescriptor(identServerSocket);
	} );

	identServerSocket.readable = function(s) { // ... when an incoming connection happens

		var identClient = s.Accept(); // accept the connection
		var dataTimeoutId = io.AddTimeout(timeout, function() { // create a timeout to prevent ...
			identClient.Close();
			io.RemoveDescriptor(identClient);
		} );
		io.AddDescriptor( identClient ); // add the 'arriving' socket to the 'pollable' list

		io.RemoveTimeout( listenTimeoutId ); // connection happens, we can remove the timeout
		s.Close(); // close the server ( rendez-vous ) socket
		io.RemoveDescriptor(s); // remove it from the 'pollable' list
		identClient.readable = function(cs) { // ... when the client sent data to us

			delete cs.readable; // stop being notified on incoming datas 
			cs.Send(callback(cs.Recv())); // get the request, send the response
			cs.writable = function(cs) { // ... when we can write again on the socket ( for closing it )

				io.RemoveTimeout( dataTimeoutId ); // everithing happens, so we can remove this timeout
				cs.Close(); // close the incoming socket
				io.RemoveDescriptor(cs); // remove it from the 'pollable' list
			}
		}
	}
}
