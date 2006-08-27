/*
rfc: rfc2812.txt
rfc: rfc2813.txt
*/

exec('deflib.js');
LoadModule('jsnspr');

var timeout = new function() {

	var _min;
	var _tlist = {};
	this.Add = function( time, func ) {
	
		var when = IntervalNow() + time;
		while( _tlist[when] ) when++; // avoid same time
		_tlist[when] = func;
		if ( when < _min )
			_min = when;
		return when;
	}
	
	this.Remove = function(when) {
		
		if ( when == _min )
			_min = Number.POSITIVE_INFINITY;
		delete _tlist[when];
	}
	
	this.Next = function() {
		
		_min = Number.POSITIVE_INFINITY;
		for ( var w in _tlist )
			if ( w < _min )
				_min = w;
		return _min == Number.POSITIVE_INFINITY ? undefined : _min - IntervalNow();
	}

	this.Process = function() {
		
		var now = IntervalNow();
		if ( _min > now )
			return;
		for ( var [w,f] in _tlist )
			if ( w <= now ) {
				f();
				delete _tlist[w];
			}
	}
}


var io = new function() {
	
	var _descriptorList = [];
	
	this.AddTimeout = function( time, fct ) {
	
		timeout.Add( time, fct );
	}
	
	this.AddDescriptor = function( d ) {
	
		_descriptorList.push(d);
	}

	this.RemoveDescriptor = function(d) {
		
		_descriptorList.splice( _descriptorList.indexOf(d), 1 );
	}

	this.Process = function( endPredicate ) {
	
		for ( ; !endPredicate() ; ) {

			Poll(_descriptorList, timeout.Next() || 1000);
			timeout.Process();
		}

	}
	
	this.Close = function() {
		
		for ( var [i,d] in _descriptorList )
			d.Close();		
	
	}

}


var log = new function() {

	var _file = new File('ircbot.log');
	_file.Open( File.CREATE_FILE + File.WRONLY + File.APPEND );
	
	this.Write = function( data ) {
		
		_file.Write( data );
	}
	
	this.WriteLn = function( data ) {
		
		this.Write( data + '\n' );
	}

	this.Close = function() {
		
		_file.Close();
	}
}


///////////////////////////////////////////////////////


var NumericCommand = exec('NumericCommand.js');

function Time() {

	//return (new Date()).getTime(); // in ms
	return IntervalNow();
}

function FloodControlSender( max, time, rawSender ) {

	var _count = max;
	var _time = Time();
	var _queue = [];
	
	function Process() {
	
		print('.');
	
		var buffer = '';
		for ( ; _count > 0 && _queue.length > 0 ; _count--) {
			buffer += _queue.shift();
		}
		buffer != '' && rawSender(buffer);
	}
	
	function timeout() {

		_count = max;
		Process();
		io.AddTimeout( time, timeout );
	}
	
	io.AddTimeout( time, timeout );
	
	this.Send = function( line ) {
		
		line != undefined && _queue.push(line);
		Process();
	}
}
// ( 15/16 bytes messages )
// 1,  600 => 16
// 1,  700 => 24
// 1,  800 => 22
// 1,  900 => 32
// 1, 1000 => 38
// 2, 2000 => 37
// 4, 4000 => 37
// 8, 8000 => 25

// ( 31/32 bytes messages )
// 1, 1000 => 28


function IRCClient( server, port ) {

	var _this = this;
	var _startTime = Time();
	var _socket;
	var _receiveBuffer = '';	
	var _sender = new FloodControlSender( 1, 1000, function(buffer) { _socket.Send( buffer ) } );
	var _startTime;
	var _modules = [];
	var _data = { server:server, port:port };
//	var _messages = [];

	this.Send = function( message ) {

		log.WriteLn( '> '+message );

		//_socket.Send( message+'\r\n' );
		_sender.Send( message+'\r\n' );
	}

	this.DispatchCommand = function( prefix, command ) {
		
		for ( m in _modules ) {
			var mod = _modules[m];
			mod[command] && mod[command].apply( mod, arguments );
		}
	}

	this.DispatchEvent = function( event ) {
		
		for ( m in _modules ) {
			var mod = _modules[m];
			mod[event] && mod[event]();
		}
	}

	this.OnMessage = function( message ) {
		
		log.WriteLn( 'raw message: ' + message );

		var prefix = message.indexOf( ':' );
		var trailing = message.indexOf( ':', 1 );
		var args = message.substring( prefix?0:1, trailing>0?trailing-1:message.length ).split(' ');
		if (prefix)
			args.unshift( undefined );
		if ( trailing>0 )
			args.push( message.substring( trailing+1 ) );
		if ( !isNaN( args[1] ) )
			args[1] = NumericCommand[Number(args[1])];

		log.WriteLn( '< '+args );

		this.DispatchCommand.apply( this, args );
	}


	this.onSocketReadable = function(s) {

		var buf = _socket.Recv();
		if ( buf.length == 0 ) {
	
			_this.DispatchEvent( 'OnDisconnect' );
			delete s.readable;
			s.Close();
			io.RemoveDescriptor(s);
			return;
		}

		_receiveBuffer += buf;

		var eol;
		while ( (eol = _receiveBuffer.indexOf('\r\n')) != -1 ) {

			_this.OnMessage( _receiveBuffer.substring( 0, eol ) )
			_receiveBuffer = _receiveBuffer.substring( eol+2 ); // +2 for '\r\n';
		}
	}

	this.Create = function() {

		_socket = new Socket();
		_socket.Connect( server, port );
		_socket.writable = function() {
		
			delete _socket.writable;
	
			_socket.readable = _this.onSocketReadable;
			_this.DispatchEvent( 'OnConnect' );
		}
		io.AddDescriptor(_socket);
	}


	this.AddModule = function( mod ) {
		
		mod.Send = this.Send;
		mod.data = _data;
		_modules.push( mod );
	}
	
	this.Quit = function() {
	
		this.Send( 'QUIT :');
	}
}

/////////////////////////////////////////////////

function ProcessSocket() {

var socket = Socket.WaitForReceive( 100, _socket ) 


}


///////////////////////////////////////////////// MODULES /////////////////////////////////////////////


function DefaultModule( nick ) {

// [TBD] autodetect max message length ( with a self sent mesage )
// [TBD] autodetect flood limit


	this.OnConnect = function() {

		this.Send( 'USER '+nick+' 127.0.0.1 '+this.data.server+' :'+nick );
		this.Send( 'NICK '+nick );
	} 

	this.RPL_WELCOME = function( from, command, to ) {
		
		this.data.nick = to;
		this.Send( 'USERHOST ' + to );
	}

	this.RPL_USERHOST = function( from, command, to, host ) {
		
		this.data.userHost = host;
	}

	this.ERR_NICKNAMEINUSE = function() {

	  // ...
	}

	this.PING = function( prefix, command, arg ) {

		this.Send( 'PONG '+arg );
	}

	this.PRIVMSG = function( from, command, to, msg ) {

		if ( msg.charAt(0) == '\1' ) {
			// manage CTCP message
		}
	}
}

/////////////

function ChanModule( _channel ) {


	this.RPL_WELCOME = function() {

		this.data.channel || ( this.data.channel = {} );
		this.Send( 'JOIN ' + _channel );
	}

	this.PRIVMSG = function( from, command, to, msg ) {
		
		var nick = from.substring( 0, from.indexOf('!') );

		if ( to == _channel && msg == '!!dump' ) {
			
			this.Send( 'PRIVMSG '+nick+' :'+this.data.toSource() );
		}
		
		if ( to == _channel && msg == '!!flood' ) {
			
			for ( var i = 0; i<100; i++ )
			  this.Send( 'PRIVMSG '+nick+' :XxxxxxxxXxxxxxxxXxxxxxxxXxxxx '+i );
		}
	}

	this.JOIN = function( who, command, channel ) { // :cdd_etf_bot!~cdd_etf_b@nost.net JOIN #soubok

		if ( channel != _channel )
			return;
	
		var nick = who.substring( 0, who.indexOf('!') ); // [TBD] try to auto extract this
		
		if ( nick == this.data.nick ) {// self

			this.data.channel[_channel] = {};
			this.Send( 'MODE '+_channel );
			this.Send( 'MODE '+_channel+' +b' );
		} else
			this.data.channel[_channel].names[nick] = {};
	}
	
	this.RPL_BANLIST = function( from, command, to, channel, ban, banBy, time ) {
		
		var chanData = this.data.channel[_channel];
		chanData.bans || ( chanData.bans = {} );
		chanData.bans[ban] = true;
	}

	this.PART = function( who, command, channel ) {

		if ( channel != _channel )
			return;
	
		var nick = who.substring( 0, who.indexOf('!') ); // [TBD] try to auto extract this
		if ( nick == this.data.nick )
			delete this.data.channel[_channel];
		else
			delete this.data.channel[_channel].names[nick];
	}

	this.QUIT = function( who, command ) {
	
		var nick = who.substring( 0, who.indexOf('!') );
		delete this.data.channel[_channel].names[nick];
	}

	this.NICK = function( who, command, newNick ) {

		var nick = who.substring( 0, who.indexOf('!') );

		this.data.channel[_channel].names[newNick] = this.data.channel[_channel].names[nick];
		delete this.data.channel[_channel].names[nick];
	}
	
	this.RPL_NOTOPIC = function( channel ) {

		if ( channel != _channel )
			return;
		delete this.data.channel[_channel].topic;
	}
	
	this.TOPIC = function( from, command, channel, topic ) {

		if ( channel != _channel )
			return;
		this.data.channel[_channel].topic = topic;
	}
	
	this.RPL_TOPIC = function( from, command, to, channel, topic ) {

		if ( channel != _channel )
			return;
		this.data.channel[_channel].topic = topic;
	}

	this.RPL_CHANNELMODEIS = function( from, command, to, channel, modes /*, ...*/ ) {
	
		if ( channel != _channel ) // can be a user mode OR a mod for another channel
			return;
		
		var args = [];
		for ( var i = 5; i < arguments.length; i++)
			args[i-5] = arguments[i];
		this._ParseModes( modes, args, this.data.channel[_channel] );
	}

	this.MODE = function( who, command, what, modes /*, ...*/ ) {

		if ( what != _channel ) // can be a user mode OR a mod for another channel
			return;

		var args = [];
		for ( var i = 4; i < arguments.length; i++)
			args[i-4] = arguments[i];
		this._ParseModes( modes, args, this.data.channel[_channel] );
	}


	this._ParseModes = function( modes, args, chanData ) {

		var simpleMode = { i:'inviteOnly', t:'topicByOp', p:'priv', s:'secret', m:'moderated', n:'noExternalMessages', r:'reop', C:'noCtcp', N:'noExternalNotice'  };
		var argPos = 0;
		var pos = 0;
		var set;
		var c;
		while ( (c = modes.charAt(pos)) != '' ) {

			switch(c) {
				case '+' :
					set = true;
					break;
				case '-' :
					set = false;
					break;
				case 'k' :
					chanData.key = args[argPos++];
					break;
				case 'o' :
					chanData.names[args[argPos++]].operator  = set;
					break;
				case 'v' :
					chanData.names[args[argPos++]].voice = set;
					break;
				case 'l' :
					if ( set )
						chanData.userLimit = args[argPos++];
					else
						delete chanData.userLimit;
					break;
				case 'b' :
					chanData.bans || ( chanData.bans = {} );
					chanData.bans[args[argPos++]] = set;
					break;
				default:
					chanData[simpleMode[c]] = set;
			}
			pos++;
		}		
	}

	this.RPL_NAMREPLY = function( from, command, to, type, channel, list ) {

		if ( channel != _channel ) // [TBD] use a kind of filter to avoid doing this (eg. register RPL_NAMREPLY with #chan as filter )
			return;

		var chanData = this.data.channel[_channel];
		chanData.names || ( chanData.names = {} );
		
		if (type == '@')
			chanData.secret = true;
			
		if (type == '*')
			chanData.priv = true;
		
		var names = list.split(' ');
		for ( var n in names ) {

			var nameData = {};
			var name = names[n];
			var pos = 0;
			switch( name.charAt(0) ) {
			
				case '+':
					nameData.voice = true;
					pos = 1;
					break;
				case '@':
					nameData.operator = true;
					pos = 1;
					break;
			}
			chanData.names[name.substring( pos )] = nameData;
		}
	}
}

////////// Start //////////

var client = new IRCClient( 'euroserv.fr.quakenet.org', 6667 );

client.AddModule( new DefaultModule( 'cdd_etf_bot' ) ); 
client.AddModule( new ChanModule( '#soubok' ) );


client.Create();

io.Process( function() { return endSignal } );
print('\nbreak!\n');

client.Quit();

//io.Close();

log.WriteLn(' ========================================================= END ========================================================= ');
log.Close();


// My notes
// ========

// user mode message: <nickname> *( ( "+" / "-" ) *( "i" / "w" / "o" / "O" / "r" ) )
// channel mode message: <channel> *( ( "-" / "+" ) *<modes> *<modeparams> )
/*
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
*/

// quakenet +r flag: you must be authed to join (+r)

//   353    RPL_NAMREPLY "( "=" / "*" / "@" ) <channel> :[ "@" / "+" ] <nick> *( " " [ "@" / "+" ] <nick> )
//         - "@" is used for secret channels, "*" for private channels, and "=" for others (public channels).

// :soubok!soubok@soubok.users.quakenet.org PART #soubok

// modes infos/servers: http://www.alien.net.au/irc/chanmodes.html

// this.test getter = function() { echo('getter') }
// this.test setter = function() { echo('setter') }

// http://www.irchelp.org/irchelp/rfc/rfc2811.txt
// http://www.croczilla.com/~alex/reference/javascript_ref/object.html
// http://www.js-examples.com/javascript/core_js15/obj.php
// CTCP: http://www.irchelp.org/irchelp/rfc/ctcpspec.html


/*

MODE soubok :+i
PING :LAGTIMER
:euroserv.fr.quakenet.org PONG euroserv.fr.quakenet.org :LAGTIMER
JOIN #soubok 
:soubok!~chatzilla@host.com JOIN #soubok
:euroserv.fr.quakenet.org 353 soubok = #soubok :@soubok
:euroserv.fr.quakenet.org 366 soubok #soubok :End of /NAMES list.
USERHOST soubok
:euroserv.fr.quakenet.org 302 soubok :soubok=+~chatzilla@host.com
MODE #soubok
:euroserv.fr.quakenet.org 324 soubok #soubok +tnCN 
:euroserv.fr.quakenet.org 329 soubok #soubok 1108995458
MODE #soubok +b
:euroserv.fr.quakenet.org 368 soubok #soubok :End of Channel Ban List

WATCH:

o = {p:1}
o.watch("p",
   function (id,oldval,newval) {
      document.writeln("o." + id + " changed from "
         + oldval + " to " + newval)
      return newval
   })

o.p = 2
o.p = 3
delete o.p
o.p = 4

o.unwatch('p')
o.p = 5 

*/
