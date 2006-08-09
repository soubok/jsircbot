LoadModule('socket')
LoadModule('file')
LoadModule('wxJS','wxJS_Init')

var log = new File('ircbot.log');

function Dump( o, prefix ) {

	for ( var p in o ) {
		Print( prefix + '.' + p )

		if ( typeof(o[p]) == 'object' )
			Dump( o[p], prefix + '.' + p );
		else
			Print( o[p] );
	}
}


function Alert( msg ) {

	dlg = new wxDialog(null, -1, "Alert", wxDefaultPosition, new wxSize( 400, 100 ));
	new wxStaticText( dlg, -1, msg, wxDefaultPosition, dlg.size, wxStaticText.ALIGN_CENTER );
	dlg.showModal();
}


var NumericCommand = {
  1:'RPL_WELCOME',
  2:'RPL_YOURHOST',
  3:'RPL_CREATED',
  4:'RPL_MYINFO',
  5:'RPL_BOUNCE',
  5:'RPL_MAP',
  5:'RPL_PROTOCTL',
  6:'RPL_MAPMORE',
  7:'RPL_MAPEND',
  8:'RPL_SNOMASK',
  9:'RPL_STATMEMTOT',
 10:'RPL_STATMEM',
 14:'RPL_YOURCOOKIE',
200:'RPL_TRACELINK',
201:'RPL_TRACECONNECTING',
202:'RPL_TRACEHANDSHAKE',
203:'RPL_TRACEUNKNOWN',
204:'RPL_TRACEOPERATOR',
205:'RPL_TRACEUSER',
206:'RPL_TRACESERVER',
207:'RPL_TRACESERVICE',
208:'RPL_TRACENEWTYPE',
209:'RPL_TRACECLASS',
210:'RPL_TRACERECONNECT',
211:'RPL_STATSLINKINFO',
212:'RPL_STATSCOMMANDS',
213:'RPL_STATSCLINE',
214:'RPL_STATSNLINE',
215:'RPL_STATSILINE',
216:'RPL_STATSKLINE',
217:'RPL_STATSQLINE',
217:'RPL_STATSPLINE',
218:'RPL_STATSYLINE',
219:'RPL_ENDOFSTATS',
220:'RPL_STATSPLINE',
221:'RPL_UMODEIS',
222:'RPL_STATSBLINE',
223:'RPL_STATSELINE',
224:'RPL_STATSFLINE',
225:'RPL_STATSDLINE',
225:'RPL_STATSZLINE',
226:'RPL_STATSCOUNT',
227:'RPL_STATSGLINE',
231:'RPL_SERVICEINFO',
232:'RPL_ENDOFSERVICES',
233:'RPL_SERVICE',
234:'RPL_SERVLIST',
235:'RPL_SERVLISTEND',
239:'RPL_STATSIAUTH',
240:'RPL_STATSVLINE',
241:'RPL_STATSLLINE',
242:'RPL_STATSUPTIME',
243:'RPL_STATSOLINE',
244:'RPL_STATSHLINE',
245:'RPL_STATSSLINE',
246:'RPL_STATSPING',
246:'RPL_STATSTLINE',
246:'RPL_STATSULINE',
247:'RPL_STATSBLINE',
247:'RPL_STATSGLINE',
247:'RPL_STATSXLINE',
248:'RPL_STATSDEFINE',
248:'RPL_STATSULINE',
249:'RPL_STATSDEBUG',
250:'RPL_STATSDLINE',
250:'RPL_STATSCONN',
251:'RPL_LUSERCLIENT',
252:'RPL_LUSEROP',
253:'RPL_LUSERUNKNOWN',
254:'RPL_LUSERCHANNELS',
255:'RPL_LUSERME',
256:'RPL_ADMINME',
257:'RPL_ADMINLOC1',
258:'RPL_ADMINLOC2',
259:'RPL_ADMINEMAIL',
261:'RPL_TRACELOG',
262:'RPL_TRACEEND',
262:'RPL_ENDOFTRACE',
262:'RPL_TRACEPING',
263:'RPL_TRYAGAIN',
263:'RPL_LOAD2HI',
265:'RPL_LOCALUSERS',
266:'RPL_GLOBALUSERS',
271:'RPL_SILELIST',
272:'RPL_ENDOFSILELIST',
274:'RPL_STATSDELTA',
275:'RPL_STATSDLINE',
280:'RPL_GLIST',
281:'RPL_ENDOFGLIST',
290:'RPL_HELPHDR',
291:'RPL_HELPOP',
292:'RPL_HELPTLR',
293:'RPL_HELPHLP',
294:'RPL_HELPFWD',
295:'RPL_HELPIGN',
300:'RPL_NONE',
301:'RPL_AWAY',
302:'RPL_USERHOST',
303:'RPL_ISON',
304:'RPL_TEXT',
305:'RPL_UNAWAY',
306:'RPL_NOWAWAY',
307:'RPL_USERIP',
307:'RPL_WHOISREGNICK',
308:'RPL_WHOISADMIN',
309:'RPL_WHOISSADMIN',
310:'RPL_WHOISSVCMSG',
311:'RPL_WHOISUSER',
312:'RPL_WHOISSERVER',
313:'RPL_WHOISOPERATOR',
314:'RPL_WHOWASUSER',
315:'RPL_ENDOFWHO',
316:'RPL_WHOISCHANOP',
317:'RPL_WHOISIDLE',
318:'RPL_ENDOFWHOIS',
319:'RPL_WHOISCHANNELS',
321:'RPL_LISTSTART',
322:'RPL_LIST',
323:'RPL_LISTEND',
324:'RPL_CHANNELMODEIS',
325:'RPL_UNIQOPIS',
326:'RPL_NOCHANPASS',
327:'RPL_CHPASSUNKNOWN',
329:'RPL_CREATIONTIME',
331:'RPL_NOTOPIC',
332:'RPL_TOPIC',
333:'RPL_TOPICWHOTIME',
334:'RPL_LISTUSAGE',
334:'RPL_COMMANDSYNTAX',
338:'RPL_CHANPASSOK',
339:'RPL_BADCHANPASS',
341:'RPL_INVITING',
342:'RPL_SUMMONING',
346:'RPL_INVITELIST',
347:'RPL_ENDOFINVITELIST',
348:'RPL_EXCEPTLIST',
349:'RPL_ENDOFEXCEPTLIST',
351:'RPL_VERSION',
352:'RPL_WHOREPLY',
353:'RPL_NAMREPLY',
354:'RPL_WHOSPCRPL',
361:'RPL_KILLDONE',
362:'RPL_CLOSING',
363:'RPL_CLOSEEND',
364:'RPL_LINKS',
365:'RPL_ENDOFLINKS',
366:'RPL_ENDOFNAMES',
367:'RPL_BANLIST',
368:'RPL_ENDOFBANLIST',
369:'RPL_ENDOFWHOWAS',
371:'RPL_INFO',
372:'RPL_MOTD',
373:'RPL_INFOSTART',
374:'RPL_ENDOFINFO',
375:'RPL_MOTDSTART',
376:'RPL_ENDOFMOTD',
381:'RPL_YOUREOPER',
382:'RPL_REHASHING',
383:'RPL_YOURESERVICE',
384:'RPL_MYPORTIS',
385:'RPL_NOTOPERANYMORE',
391:'RPL_TIME',
392:'RPL_USERSSTART',
393:'RPL_USERS',
394:'RPL_ENDOFUSERS',
395:'RPL_NOUSERS',
401:'ERR_NOSUCHNICK',
402:'ERR_NOSUCHSERVER',
403:'ERR_NOSUCHCHANNEL',
404:'ERR_CANNOTSENDTOCHAN',
405:'ERR_TOOMANYCHANNELS',
406:'ERR_WASNOSUCHNICK',
407:'ERR_TOOMANYTARGETS',
408:'ERR_NOSUCHSERVICE',
408:'ERR_NOCOLORSONCHAN',
409:'ERR_NOORIGIN',
411:'ERR_NORECIPIENT',
412:'ERR_NOTEXTTOSEND',
413:'ERR_NOTOPLEVEL',
414:'ERR_WILDTOPLEVEL',
415:'ERR_BADMASK',
416:'ERR_TOOMANYMATCHES',
416:'ERR_QUERYTOOLONG',
421:'ERR_UNKNOWNCOMMAND',
422:'ERR_NOMOTD',
423:'ERR_NOADMININFO',
424:'ERR_FILEERROR',
429:'ERR_TOOMANYAWAY',
431:'ERR_NONICKNAMEGIVEN',
432:'ERR_ERRONEUSNICKNAME',
433:'ERR_NICKNAMEINUSE',
434:'ERR_SERVICENAMEINUSE',
435:'ERR_SERVICECONFUSED',
435:'ERR_BANONCHAN',
436:'ERR_NICKCOLLISION',
437:'ERR_UNAVAILRESOURCE',
437:'ERR_BANNICKCHANGE',
438:'ERR_DEAD',
438:'ERR_NICKTOOFAST',
438:'ERR_NCHANGETOOFAST',
439:'ERR_TARGETTOOFAST',
440:'ERR_SERVICESDOWN',
441:'ERR_USERNOTINCHANNEL',
442:'ERR_NOTONCHANNEL',
443:'ERR_USERONCHANNEL',
444:'ERR_NOLOGIN',
445:'ERR_SUMMONDISABLED',
446:'ERR_USERSDISABLED',
451:'ERR_NOTREGISTERED',
452:'ERR_IDCOLLISION',
453:'ERR_NICKLOST',
455:'ERR_HOSTILENAME',
461:'ERR_NEEDMOREPARAMS',
462:'ERR_ALREADYREGISTRED',
463:'ERR_NOPERMFORHOST',
464:'ERR_PASSWDMISMATCH',
465:'ERR_YOUREBANNEDCREEP',
466:'ERR_YOUWILLBEBANNED',
467:'ERR_KEYSET',
468:'ERR_INVALIDUSERNAME',
468:'ERR_ONLYSERVERSCANCHANGE',
471:'ERR_CHANNELISFULL',
472:'ERR_UNKNOWNMODE',
473:'ERR_INVITEONLYCHAN',
474:'ERR_BANNEDFROMCHAN',
475:'ERR_BADCHANNELKEY',
476:'ERR_BADCHANMASK',
477:'ERR_MODELESS',
477:'ERR_NOCHANMODES',
477:'ERR_NEEDREGGEDNICK',
478:'ERR_BANLISTFULL',
479:'ERR_BADCHANNAME',
481:'ERR_NOPRIVILEGES',
482:'ERR_CHANOPRIVSNEEDED',
483:'ERR_CANTKILLSERVER',
484:'ERR_DESYNC',
484:'ERR_ISCHANSERVICE',
485:'ERR_UNIQOPPRIVSNEEDED',
487:'ERR_CHANTOORECENT',
488:'ERR_TSLESSCHAN',
489:'ERR_VOICENEEDED',
491:'ERR_NOOPERHOST',
492:'ERR_NOSERVICEHOST',
501:'ERR_UMODEUNKNOWNFLAG',
502:'ERR_USERSDONTMATCH',
503:'ERR_GHOSTEDCLIENT',
504:'ERR_LAST_ERR_MSG',
511:'ERR_SILELISTFULL',
512:'ERR_NOSUCHGLINE',
512:'ERR_TOOMANYWATCH',
513:'ERR_BADPING',
514:'ERR_TOOMANYDCC',
521:'ERR_LISTSYNTAX',
522:'ERR_WHOSYNTAX',
523:'ERR_WHOLIMEXCEED',
600:'RPL_LOGON',
601:'RPL_LOGOFF',
602:'RPL_WATCHOFF',
603:'RPL_WATCHSTAT',
604:'RPL_NOWON',
605:'RPL_NOWOFF',
606:'RPL_WATCHLIST',
607:'RPL_ENDOFWATCHLIST',
617:'RPL_DCCSTATUS',
618:'RPL_DCCLIST',
619:'RPL_ENDOFDCCLIST',
620:'RPL_DCCINFO',
999:'ERR_NUMERIC_ERR'
}

function Time() {

	return (new Date()).getTime(); // in ms
}

function FloodControlSender( max, time, rawSender ) {
	
	var _count = 0;
	var _time = Time();
	var _lines = [];
	
	this.Send = function( line ) {
		
		if ( line != undefined )
			_lines.push(line);
		
		if ( Time() - _time >= time ) {
			
			_time = Time();
			_count = 0;
		}

		for ( var buffer = '';  _count < max && _lines.length > 0; _count++ )
			buffer += _lines.shift();

		buffer != '' && rawSender(buffer);
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
	
	var _socket;
	var _sender = new FloodControlSender( 1, 1000, function(buffer) { _socket.Send( buffer ) } );
	var _startTime;
	var _modules = [];
	var _data = { server:server, port:port };
//	var _messages = [];

	this.Send = function( message ) {

		Print( '> '+message );

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

		log.Open();
		log.Write(message+'\r\n')
		log.Close();

		var prefix = message.indexOf( ':' );
		var trailing = message.indexOf( ':', 1 );
		args = message.substring( prefix?0:1, trailing>0?trailing-1:message.length ).split(' ');
		if (prefix)
			args.unshift( undefined );
		if ( trailing>0 )
			args.push( message.substring( trailing+1 ) );
		if ( !isNaN( args[1] ) )
			args[1] = NumericCommand[Number(args[1])];

		Print( '< '+args );

		this.DispatchCommand.apply( this, args );
	}

	this.Create = function() {

		var _receiveBuffer = ''

		_socket = new Socket();
		_socket.Connect( server, port );

		var _startTime = Time();

		this.DispatchEvent( 'OnConnect' );

		for ( var l = 0; _socket.isConnected ;++l ) {

			_sender.Send();
			if ( Socket.WaitForReceive( 100, _socket ) ) {
				
				_receiveBuffer += _socket.Receive();
				
				var eol;
				while ( (eol = _receiveBuffer.indexOf('\r\n')) != -1 ) {

					this.OnMessage( _receiveBuffer.substring( 0, eol ) )
					_receiveBuffer = _receiveBuffer.substring( eol+2 ); // +2 for '\r\n';
				}
			}
		}
		this.DispatchEvent( 'OnDisconnect' );
	}

	this.AddModule = function( mod ) {
		
		mod.Send = this.Send;
		mod.data = _data;
		_modules.push( mod );
	}
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
			
			Dump( this.data, 'DATA' );
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