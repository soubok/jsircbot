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

// http://www.ietf.org/rfc/rfc1413.txt
function Ident( io, callback, timeout ) {

	var identServerSocket = new Socket(); // create a server ( rendez-vous ) socket
	
	try {	
	
		identServerSocket.Bind(113);
	} catch( ex if ex instanceof IoError ) {

		return false;
	}	
	
	identServerSocket.Listen(); // listen on port 113 (ident)

	io.AddDescriptor( identServerSocket ); // add the socket to the 'pollable' list
	
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
			cs.Write(callback(cs.Read())); // get the request, send the response
			cs.writable = function(cs) { // ... when we can write again on the socket ( for closing it )

				io.RemoveTimeout( dataTimeoutId ); // everithing happens, so we can remove this timeout
				cs.Close(); // close the incoming socket
				io.RemoveDescriptor(cs); // remove it from the 'pollable' list
			}
		}
	}
	return true;
}
