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


function InitModule(mod) {
	
	mod.name = this.constructor.name;
	return mod;
}



/////////////////////////////////////////////////////// Enum

function ENUM(enumMap) {

	for ( let [name, value] in Iterator(enumMap) )
		let (n = name, v = value)
			this[name] = { toString:function() n, valueOf:function() v };
}



/////////////////////////////////////////////////////// Chars

const NUL = '\0';
const CR = '\r';
const LF = '\n';
const CRLF = CR+LF;
const SPC = ' ';
const DOT = '.';
const SLASH = '/';


/////////////////////////////////////////////////////// status objects

ENUM({
	OK:undefined,
	ERROR:undefined,
	TIMEOUT:undefined,
	DISCONNECTED:undefined,
	NOTFOUND:undefined,
	BADREQUEST:undefined,
	BADRESPONSE:undefined,
	EMPTYRESPONSE:undefined,
	UNAVAILABLE:undefined,
	UNREACHABLE:undefined,
	NOSUCHMETHOD:undefined
});



/////////////////////////////////////////////////////// Date and Time

var Now = Date.now; // returns the current date in ms

const MILLISECOND = 1;
const SECOND = 1000*MILLISECOND;
const MINUTE = 60*SECOND;
const HOUR = 60*MINUTE;
const DAY = 24*HOUR;
const WEEK = 7*DAY;
const YEAR = 365*DAY + 5*HOUR + 48*MINUTE + 45*SECOND;

const KILOBYTE = 1024;


/////////////////////////////////////////////////////// Errors

function ExToText(ex, showStack) ex instanceof Error ? ex.name+': '+ex.message+' ('+(showStack ? ex.stack : (ex.fileName+':'+ex.lineNumber))+')' : ex.toString();

function Failed(text) { ReportFailure(text, DStack()); throw new Error(text) } // fatal error

function ERR() { throw ERR }

function TRY(fct) {

	try {
		void fct();
		return true;
	} catch(ex if ex == ERR) {}
	return false;
}

function CHK(v) v || ERR(); // check that the argument is not !!false

function CHKN(v) !v || ERR(); // check that the argument is not !!true

function CHKEQ(value, eq) value == eq ? value : ERR();

function CHKNEQ(value, neq) value != neq ? value : ERR();



/////////////////////////////////////////////////////// State Keeper

function StateKeeper( catchCallback ) {

	var _stateList = NewDataObj();
	var _predicateList = [];

	function StateChanging(stateName, state) {
		
		if ( !state == !_stateList[stateName] ) // if state is already set
			return;
		DBG && DebugTrace( 'STATE', stateName, state );
		_stateList[stateName] = state;
		
		try {
		
			for each ( let item in _predicateList ) { // item = [0:setPredicate, 1:resetPredicate, 2:callback, 3:<the state of stateName>]
				var callback = item[2];
				if ( !item[3] )
					item[0](_stateList, stateName) && callback.call(callback, (item[3] = true), _predicateList); // 'this' will be the function itself
				else
					( item[1] ? item[1](_stateList, stateName) : !item[0](_stateList) ) && callback.call(callback, (item[3] = false), _predicateList); // 'this' will be the function itself
			}
		} catch(ex) {
			
			if( catchCallback )
				catchCallback(ex);
			else
				throw ex;
		}
	}
	
	this.Is = function(stateName) !!_stateList[stateName];
	this.Enter = function(stateName) StateChanging(stateName, true);
	this.Leave = function(stateName)	StateChanging(stateName, false);
	this.Toggle = function(stateName, polarity) {
		
		polarity = arguments.length >= 2 ? polarity : !_stateList[stateName]; // if polarity argument is not provided, act as a flip-flop
		StateChanging(stateName, polarity);
	}

	this.AddStateListener = function( setPredicate, resetPredicate, callback, initialState ) 
		_predicateList.push(arguments);
	this.RemoveStateListener = function( setPredicate, resetPredicate, callback ) 
		_predicateList.some( function(item, index) item[0] == setPredicate && item[1] == resetPredicate && item[2] == callback && _predicateList.splice(index,1) );

	INSPECT.push(function() 'STATE '+[stateName+':'+state for ([stateName, state] in Iterator(_stateList))].join(' '));
}

//

function AsyncStateWait(state, predicate) function(callback) { // eg: yield AsyncStateWait($S, function(s) s.interactive); 

	state.AddStateListener(predicate, undefined, function() {

		state.RemoveStateListener(predicate, undefined, arguments.callee);
		callback();
	});
}


/////////////////////////////////////////////////////// Event Listener

function Listener( catchCallback ) {
	
	var _list = [];
	this.Add = function( set ) _list.push(set);
	this.Remove = function( set ) DeleteArrayElement(_list, set);
	this.Toggle = function( set, polarity ) void polarity ? _list.push(set) : DeleteArrayElement(_list, set);
	this.Fire = function Fire() { // beware, Fire is only used for the function name
	
		try {

			for each ( let set in _list.slice() ) {
				
				var n = set;
				for ( var it = 0; typeof(n) == 'object' && it in arguments && arguments[it] in n; n = n[arguments[it++]] ); // var is faster than let
				n instanceof Function && void n.apply(n, arguments); // 'this' will be the function itself
			}
		} catch(ex) {
			
			if( catchCallback )
				catchCallback(ex);
			else
				throw ex;
		}
	}
}



/////////////////////////////////////////////////////// Asynchronus procedures

function StartAsyncProc( procedure ) {
	
	DBG && DebugTrace( 'START PROC', (procedure.name||'???')+'()' );
	try {

		procedure._running = true; 
		void procedure.next()(function(result) {

			try {
			
				void procedure.send(arguments)(arguments.callee);
			} catch(ex if ex == StopIteration) { procedure._running = false }
		});
	} catch(ex if ex == StopIteration) { procedure._running = false }
	
	return procedure;
}

function AbortAsyncProc() { // used inside a procedure
	
	throw StopIteration;
}

function StopAsyncProc( procedure ) { // used outside a procedure
	
	DBG && DebugTrace( 'STOP PROC', (procedure.name||'???')+'()' );
	procedure.close();
	procedure._running = false;
	return undefined;
	// doc: Generators have a close() method that forces the generator to close itself. The effects of closing a generator are:
	//        1. Any finally clauses active in the generator function are run.
	//        2. If a finally clause throws any exception other than StopIteration, the exception is propagated to the caller of the close() method.
	//        3. The generator terminates. 			
}

AsyncProcHelper.prototype = {

	Start: function() this.procedure = StartAsyncProc(this.procedureConstructor.apply(null, arguments)),
	Stop: function() this.procedure = StopAsyncProc(this.procedure),
	get running() this.procedure && this.procedure._running,
	Toggle: function(polarity) {
		
		if ( arguments.length )
			polarity ? this.Start() : this.Stop();
		else
			this.procedure && this.procedure._running ? this.Stop() : this.Start();
	}
}

function AsyncProcHelper( procedureConstructor ) { 

	this.procedureConstructor = procedureConstructor;
}

//

function Event() {

	var _lockList = [];
	this.Wait = function(callback) _lockList.push(callback);
	this.Fire = function() {

		var tmp = _lockList;
		_lockList = [];
		while ( tmp.length )
			tmp.shift()();
	}
}

function AsyncEventWait(event) function(callback) event.Wait(callback); // helper function

//

function Semaphore( res ) {
	
	var _lockList = [];

	this.Release = function() {
		
		if ( _lockList.length )
			_lockList.shift()();
		else
			res++;
	}
	
	this.Acquire = function(callback) {
		
		if ( res > 0 ) {
			res--;
			callback();
		} else
			_lockList.push(callback);
	}
}

function AsyncSemaphoreAcquire(semaphore) function(callback) semaphore.Acquire(callback); // helper function


/////////////////////////////////////////////////////// Call Scheduler system

function CallScheduler() {

	var _callList = [];
	
	this.Add = function(fct) {
		
		_callList.push(fct);
		_callList.length == 1 && void _callList[0].call(_callList[0]);
	}

	this.Next = function() {

		_callList.shift();
		_callList.length && _callList[0].call(_callList[0]);
	}
}



/////////////////////////////////////////////////////// LOG system

var bit = 1;
ENUM({
	LOG_FAILURE : bit*=2,
	LOG_ERROR   : bit*=2,
	LOG_WARNING : bit*=2,
	LOG_NOTICE  : bit*=2,
	LOG_DEBUG   : bit*=2,
	LOG_MISC    : bit*=2,
	LOG_IRCMSG  : bit*=2,
	LOG_NET     : bit*=2,
	LOG_HTTP    : bit*=2,
	LOG_PROC    : bit*=2,
	LOG_ALL     : (bit*=2)-1
});

const LOG_CLOSE_FILTER = { toString:function() '' };

function MakeLogScreen() function(data) {
	
	Print(''+data+LF);
}

function MakeLogFile(fileNameMaker, append) { // fileNameMaker is a function that returns a filename

	var _fileName;
	var _file;
	
	return function(data) {

		if ( data === LOG_CLOSE_FILTER )
			_file.Close();
		else {
			
			var newFileName = fileNameMaker();
			if ( _fileName != newFileName ) {
				
				_fileName = newFileName;
				_file && _file.Close();
				_file = new File(_fileName);
				_file.Open(File.CREATE_FILE + File.WRONLY + (append ? File.APPEND : File.TRUNCATE));
			}
			_file.Write(data+LF);
		}
	}
}

function MakeLogUDP(host, port) {

	var socket = new Socket( Socket.UDP );
	try {
		socket.Connect( host, port );
	} catch(ex) {
		Print( 'Unable to '+arguments.callee.name );
	}
	return function(data) {
		
		if ( data === LOG_CLOSE_FILTER )
			socket.Close();
		else
			socket.Write(data+LF);
	}
}

function MakeLogEMail(mailTo) {

	return function(data) {
		// (TBD)
	}
}

var log = new function(data) {

	var _outputList = [];
	var _time0 = Now();
//	function FormatedTime() StringPad(((Now()-_time0)/SECOND).toFixed(2), 7, ' ');
	function FormatedTime() let (d = new Date()) d.toLocaleFormat('%m-%d,%H:%M:%S.')+String(1000+d.getMilliseconds()).substr(1);
	
	this.AddFilter = function( output, typeList ) _outputList.push([output, typeList]);

	this.RemoveFilter = function( outputToRemove ) {
	
		for each ( let [i, [output]] in Iterator(_outputList) )
			if ( output == outputToRemove ) {
				
				output(LOG_CLOSE_FILTER);
				_outputList.splice( i, 1 );
				return; // done.
			}
	}
	
	this.Close = function() {

		for each ( let [output] in _outputList )
			output(LOG_CLOSE_FILTER); // if filter do not support closing, an empty string is used instead ( see LOG_CLOSE_FILTER )
		_outputList.splice(0);
	}

	this.Write = function(type /*, data, ...*/) {

// (TBD) fix LOG_ERROR <TypeError: can't convert Array.slice(arguments, 1).join to string (tools.js:414)>
		var data = FormatedTime()+' '+String(type)+' <'+Array.slice(arguments,1).join('> <')+'>'; // ('+gcByte+') 
		for each ( let [output, typeList] in _outputList )
			typeList & type && void output(data);
	}
}

function DebugTrace(text) log.Write.apply( null, [LOG_DEBUG].concat(Array.slice(arguments)) );

function ReportNotice() log.Write.apply( null, [LOG_NOTICE].concat(Array.slice(arguments)) );
function ReportWarning() log.Write.apply( null, [LOG_WARNING].concat(Array.slice(arguments)) );
function ReportError() log.Write.apply( null, [LOG_ERROR].concat(Array.slice(arguments)) );
function ReportFailure() log.Write.apply( null, [LOG_FAILURE].concat(Array.slice(arguments)) );



/////////////////////////////////////////////////////// HTTP tools

function ParseUri(source) { // ParseUri 1.2; MIT License By Steven Levithan. http://blog.stevenlevithan.com/archives/ParseUri
	var o = ParseUri.options, value = o.parser[o.strictMode ? "strict" : "loose"].exec(source);
	for (var i = 0, uri = {}; i < 14; i++) uri[o.key[i]] = value[i] || "";
	uri[o.q.name] = {};
	uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) { if ($1) uri[o.q.name][$1] = $2 });
	return uri;
};

ParseUri.options = {
	strictMode: false,
	key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
	q: {
		name: "queryKey",
		parser: /(?:^|&)([^&=]*)=?([^&]*)/g
	},
	parser: {
		strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
		loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
	}
};


function MakeHeaders( list ) {

	var headers = '';
	for ( let k in list )
		headers += k + ': ' + list[k] + CRLF;
	return headers;
}


function FormURLEncode( list ) {

	var data = '';
	for ( let k in list )
		data += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(list[k]);
	return data.substr(1);
}

function MakeStatusLine( method, path, version ) {

	return method + SPC + path + SPC + (version||'HTTP/1.0');
}



/////////////////////////////////////////////////////// Misc tools

function False() false;


function True() true;


function Noop() {}


function Identity(arg) arg;


function NewDataObj() ({ __proto__: null }); // create a really empty object ( without __parent__, __count__, __proto__, ... )


function ObjPropertyCount(obj) {
	
	var count = 0;
	for ( var p in obj ) count++;
	return count;
}

function IntegerToIp(number) (number>>24 & 255)+'.'+(number>>16 & 255)+'.'+(number>>8 & 255)+'.'+(number & 255);


function IpToInt(ip) {
	
	var res = 0;
	ip.split('.',4).forEach(function(v, i) res |= v << (3-i) * 8 );
	return res;
}


function NumberToUint32NetworkOrderString(number) String.fromCharCode(number>>24 & 255)+String.fromCharCode(number>>16 & 255)+String.fromCharCode(number>>8 & 255)+String.fromCharCode(number & 255);


function RandomNumber(length) {
	
	var str = '';
	for ( ; str.length < length; str += Math.random().toString().substr(2) );
	return str.substr(0, length);
}


function RandomString(length) {
    
    var str = '';
    for ( ; str.length < length; str += Math.random().toString(36).substr(2) );
    return str.substr(0, length);
}

function RandomRange( min, max )	min + Math.random() * (max - min);


function MakeObj( tpl, arr ) { // { num:1, level:2, hostmask:3, time:4 } , [1, 10, 'host.com', 1249012873401] = { num:1, level:2, hostmask:'host.com', time:1249012873401 }
	
	var obj = NewDataObj();
	if ( arr )
		for ( let p in tpl ) obj[p] = arr[tpl[p]];
	return obj;
}


function DeleteArrayElement( array, element ) !!let (pos=array.lastIndexOf(element)) pos != -1 && array.splice(pos, 1);


function SetOnceObject() new ObjEx( undefined,undefined,undefined, function(name, value) this[name] ? Failed('Property Already defined') : value );


// RateMeter usage:
//   var foo = new RateMeter();
//   if ( foo.Inc(cmdName, 1, 1*SECOND) > 5 ) Print('More than 5 times per seconds is too fast');
function RateMeter() {

    var _keyList = {};
    this.Inc = function(key, amount, monitorPeriod) {

    	var now = Now();
    	for ( var k in Iterator(_keyList, true) ) // clean the list
			if ( now - _keyList[k].time > monitorPeriod )
				delete _keyList[k];
        var data = _keyList[key] || (_keyList[key] = { time:0, amount:0 });
   		var interval = now - data.time;
   		data.amount = data.amount * (interval < monitorPeriod ? 1 - interval / monitorPeriod : 0) + amount;
   		data.time = now;
		return data.amount;
    }
}

// RateMeter usage:
//   var foo = new MultiRateMeter([5:1000]);
//   if ( !foo.Inc('127.0.0.1', 1) ) Print('Sorry, your connection rate is too high');
function MultiRateMeter([max,monitorPeriod]) {

    var _keyList = {};
    this.Inc = function(key, amount) {

    	var now = Now();
    	for ( var k in Iterator(_keyList, true) ) // clean the list
			if ( now - _keyList[k].time > monitorPeriod )
				delete _keyList[k];
        var data = _keyList[key] || (_keyList[key] = { time:0, amount:0 });
   		var interval = now - data.time;
   		data.amount = data.amount * (interval < monitorPeriod ? 1 - interval / monitorPeriod : 0) + amount;
   		data.time = now;
		return data.amount <= max;
    }
}


// RateMeter usage:
//   var foo = new SingleRateMeter([5:1000]);
//   if ( !foo.Inc(1) ) Print('More than 5 times per seconds is too fast');
function SingleRateMeter([max,monitorPeriod]) {

	var time=0, total=0;
	this.Inc = function(amount) {

		var now = Now();
		var interval = now - time;
		total = total * (interval < monitorPeriod ? 1 - interval / monitorPeriod : 0) + amount;
		time = now;
		return total <= max;
	}

	this.Check = function() this.Inc(0); // check if we are under the limit
	
	this.RestTime = function() { // time needed to return under the limit
		
		this.Inc(0);
		if ( total < max )
			return 0;
		return monitorPeriod * (total - max) / max;
	}
}


/////////////////////////////////////////////////////// String functions

function StringPad( str, count, chr ) {
	
	str += '';
	chr = chr || SPC;
	var diff = count - str.length;
	while( diff-- > 0 )
		str = chr + str;
	return str;
}


function StripHTML(html) html.replace( /<(.|\n)+?>/mg, ' ').replace( /[ \n]+/g, ' ');


function LTrim(str) str.replace(/^\s+/, '');


function RTrim(str) str.replace(/\s+$/, '');


function Trim(str) str.replace(/^\s+|\s+$/g, ''); // or function Trim(string) /^ *(.*?) *$/(string)[1];


function StrBefore(str, sep) (sep = str.indexOf(sep)) == -1 ? str : str.substr(0, sep);


function StringReplacer(conversionObject) function(s) s.replace(new RegExp([k.replace(/(\/|\.|\*|\+|\?|\||\(|\)|\[|\]|\{|\}|\\)/g, "\\$1") for (k in conversionObject)].join('|'), 'g'), function(str) conversionObject[str]); // eg. StringReplacer({aa:11})('xxaaxx'); returns 'xx11xx'


function Switch(i) arguments[++i];


function Match(v) Array.indexOf(arguments,v,1) - 1;


function ExpandStringRanges(rangesStr) {

    for each (let range in rangesStr.split(',')) {

        var minmax = range.split('-', 2);
        if (minmax.length == 2)
            for (let i = parseInt(minmax[0]); i <= parseInt(minmax[1]); i++)
                yield i;
        else
            yield parseInt(minmax[0]);
    }
}


function ValueInStringRanges(rangesStr, value) {

	for each (let range in rangesStr.split(',')) {

		var minmax = range.split('-', 2);
		if (minmax.length == 2) {
		
			if ( value >= parseInt(minmax[0]) && value <= parseInt(minmax[1]) )
				return true;
		} else {
		
			if ( value == parseInt(minmax[0]) )
				return true;
		}
	}
	return false;
}


function StringEnd( str, end ) {
	
	var pos = str.lastIndexOf(end);
	return (pos != -1 && pos  == str.length - end.length);
}


function FileExtension(filename) {

	var pt = filename.lastIndexOf('.');
	return  pt == -1 ? undefined : filename.substr(++pt);
}


function ParseArguments(str) {

	var args = [], reg = /"((?:\\?.)*?)"|[^ ]+/g;
	for (let res; res = reg(str); args.push(res[1] != null ? res[1] : res[0] ));
	return args;
}


function Dump( data, tab ) {

    tab = tab||'';
    if ( data === null ) return 'null';
    if ( data === undefined ) return 'undefined';
    if ( typeof(data) == 'string' || data instanceof String ) return '"' + data + '"';
    if ( typeof(data) == 'number' || data instanceof Number ) return data;
    if ( data instanceof Function ) return data.toSource().substr(1,50) + '...';
    if ( data instanceof Date ) return data;
    if ( data instanceof XML ) return data.toXMLString();
    if ( data instanceof Object && data.__iterator__ ) return data;
    if ( data instanceof Object ) {
   
       var name = data.constructor != Object && data.constructor != Array ? '|'+(data.constructor.name||'?')+'|' : '';
       var newTab = tab+'  '
       var propList = '';
        for ( var p in data )
            propList += newTab+p+':'+arguments.callee( data[p], newTab )+'\n';
      
       var isArray = data instanceof Array;
       return name + (isArray? '[' : '{') + (propList? '\n'+propList+tab : '') + (isArray? ']' : '}') + '\n';
    }
    return data;
}


const entityToCode = { __proto__: null, apos:0x0027,
	quot:0x0022,amp:0x0026,lt:0x003C,gt:0x003E,nbsp:0x00A0,iexcl:0x00A1,cent:0x00A2,pound:0x00A3,
	curren:0x00A4,yen:0x00A5,brvbar:0x00A6,sect:0x00A7,uml:0x00A8,copy:0x00A9,ordf:0x00AA,laquo:0x00AB,
	not:0x00AC,shy:0x00AD,reg:0x00AE,macr:0x00AF,deg:0x00B0,plusmn:0x00B1,sup2:0x00B2,sup3:0x00B3,
	acute:0x00B4,micro:0x00B5,para:0x00B6,middot:0x00B7,cedil:0x00B8,sup1:0x00B9,ordm:0x00BA,raquo:0x00BB,
	frac14:0x00BC,frac12:0x00BD,frac34:0x00BE,iquest:0x00BF,Agrave:0x00C0,Aacute:0x00C1,Acirc:0x00C2,Atilde:0x00C3,
	Auml:0x00C4,Aring:0x00C5,AElig:0x00C6,Ccedil:0x00C7,Egrave:0x00C8,Eacute:0x00C9,Ecirc:0x00CA,Euml:0x00CB,
	Igrave:0x00CC,Iacute:0x00CD,Icirc:0x00CE,Iuml:0x00CF,ETH:0x00D0,Ntilde:0x00D1,Ograve:0x00D2,Oacute:0x00D3,
	Ocirc:0x00D4,Otilde:0x00D5,Ouml:0x00D6,times:0x00D7,Oslash:0x00D8,Ugrave:0x00D9,Uacute:0x00DA,Ucirc:0x00DB,
	Uuml:0x00DC,Yacute:0x00DD,THORN:0x00DE,szlig:0x00DF,agrave:0x00E0,aacute:0x00E1,acirc:0x00E2,atilde:0x00E3,
	auml:0x00E4,aring:0x00E5,aelig:0x00E6,ccedil:0x00E7,egrave:0x00E8,eacute:0x00E9,ecirc:0x00EA,euml:0x00EB,
	igrave:0x00EC,iacute:0x00ED,icirc:0x00EE,iuml:0x00EF,eth:0x00F0,ntilde:0x00F1,ograve:0x00F2,oacute:0x00F3,
	ocirc:0x00F4,otilde:0x00F5,ouml:0x00F6,divide:0x00F7,oslash:0x00F8,ugrave:0x00F9,uacute:0x00FA,ucirc:0x00FB,
	uuml:0x00FC,yacute:0x00FD,thorn:0x00FE,yuml:0x00FF,OElig:0x0152,oelig:0x0153,Scaron:0x0160,scaron:0x0161,
	Yuml:0x0178,fnof:0x0192,circ:0x02C6,tilde:0x02DC,Alpha:0x0391,Beta:0x0392,Gamma:0x0393,Delta:0x0394,
	Epsilon:0x0395,Zeta:0x0396,Eta:0x0397,Theta:0x0398,Iota:0x0399,Kappa:0x039A,Lambda:0x039B,Mu:0x039C,
	Nu:0x039D,Xi:0x039E,Omicron:0x039F,Pi:0x03A0,Rho:0x03A1,Sigma:0x03A3,Tau:0x03A4,Upsilon:0x03A5,
	Phi:0x03A6,Chi:0x03A7,Psi:0x03A8,Omega:0x03A9,alpha:0x03B1,beta:0x03B2,gamma:0x03B3,delta:0x03B4,
	epsilon:0x03B5,zeta:0x03B6,eta:0x03B7,theta:0x03B8,iota:0x03B9,kappa:0x03BA,lambda:0x03BB,mu:0x03BC,
	nu:0x03BD,xi:0x03BE,omicron:0x03BF,pi:0x03C0,rho:0x03C1,sigmaf:0x03C2,sigma:0x03C3,tau:0x03C4,
	upsilon:0x03C5,phi:0x03C6,chi:0x03C7,psi:0x03C8,omega:0x03C9,thetasym:0x03D1,upsih:0x03D2,piv:0x03D6,
	ensp:0x2002,emsp:0x2003,thinsp:0x2009,zwnj:0x200C,zwj:0x200D,lrm:0x200E,rlm:0x200F,ndash:0x2013,
	mdash:0x2014,lsquo:0x2018,rsquo:0x2019,sbquo:0x201A,ldquo:0x201C,rdquo:0x201D,bdquo:0x201E,dagger:0x2020,
	Dagger:0x2021,bull:0x2022,hellip:0x2026,permil:0x2030,prime:0x2032,Prime:0x2033,lsaquo:0x2039,rsaquo:0x203A,
	oline:0x203E,frasl:0x2044,euro:0x20AC,image:0x2111,weierp:0x2118,real:0x211C,trade:0x2122,alefsym:0x2135,
	larr:0x2190,uarr:0x2191,rarr:0x2192,darr:0x2193,harr:0x2194,crarr:0x21B5,lArr:0x21D0,uArr:0x21D1,
	rArr:0x21D2,dArr:0x21D3,hArr:0x21D4,forall:0x2200,part:0x2202,exist:0x2203,empty:0x2205,nabla:0x2207,
	isin:0x2208,notin:0x2209,ni:0x220B,prod:0x220F,sum:0x2211,minus:0x2212,lowast:0x2217,radic:0x221A,
	prop:0x221D,infin:0x221E,ang:0x2220,and:0x2227,or:0x2228,cap:0x2229,cup:0x222A,int:0x222B,
	there4:0x2234,sim:0x223C,cong:0x2245,asymp:0x2248,ne:0x2260,equiv:0x2261,le:0x2264,ge:0x2265,
	sub:0x2282,sup:0x2283,nsub:0x2284,sube:0x2286,supe:0x2287,oplus:0x2295,otimes:0x2297,perp:0x22A5,
	sdot:0x22C5,lceil:0x2308,rceil:0x2309,lfloor:0x230A,rfloor:0x230B,lang:0x2329,rang:0x232A,loz:0x25CA,
	spades:0x2660,clubs:0x2663,hearts:0x2665,diams:0x2666
}; // source: http://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references


var charToEntity = {}; // opposite
for ( var entityName in entityToCode )
	charToEntity[String.fromCharCode(entityToCode[entityName])] = entityName;

function UnescapeEntities(str) str.replace(/&(.+?);/g, function(str, ent) String.fromCharCode( ent[0]!='#' ? entityToCode[ent] : ent[1]=='x' ? parseInt(ent.substr(2),16): parseInt(ent.substr(1)) ) );

function EscapeEntities(str) str.replace(/[^\x20-\x7E]/g, function(str) charToEntity[str] ? '&'+charToEntity[str]+';' : str );



/////////////////////////////////////////////////////// base64

// This code was written by Tyler Akins and has been placed in the public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function encode64(input) {

   var output = "";
   var chr1, chr2, chr3;
   var enc1, enc2, enc3, enc4;
   var i = 0;

   do {
      chr1 = input.charCodeAt(i++);
      chr2 = input.charCodeAt(i++);
      chr3 = input.charCodeAt(i++);

      enc1 = chr1 >> 2;
      enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
      enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
      enc4 = chr3 & 63;

      if (isNaN(chr2))
         enc3 = enc4 = 64;
      else if (isNaN(chr3))
         enc4 = 64;

      output = output + keyStr.charAt(enc1) + keyStr.charAt(enc2) + keyStr.charAt(enc3) + keyStr.charAt(enc4);
   } while (i < input.length);
   return output;
}

function decode64(input) {

   var output = "";
   var chr1, chr2, chr3;
   var enc1, enc2, enc3, enc4;
   var i = 0;

   // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
   input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

   do {
      enc1 = keyStr.indexOf(input.charAt(i++));
      enc2 = keyStr.indexOf(input.charAt(i++));
      enc3 = keyStr.indexOf(input.charAt(i++));
      enc4 = keyStr.indexOf(input.charAt(i++));

      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;

      output = output + String.fromCharCode(chr1);

      if (enc3 != 64)
         output = output + String.fromCharCode(chr2);
      if (enc4 != 64)
         output = output + String.fromCharCode(chr3);
   } while (i < input.length);
   return output;
}

// alternative implementation: http://www.webtoolkit.info/


/**
 * sprintf() for JavaScript v.0.4, Copyright (c) 2007 Alexandru Marasteanu <http://alexei.417.ro/>, Thanks to David Baird (unit test and patch).
 * This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software
 * Foundation; either version 2 of the License, or (at your option) any later version.
 */

function str_repeat(i, m) { for (var o = []; m > 0; o[--m] = i); return(o.join('')); }

function sprintf () {
  var i = 0, a, f = arguments[i++], o = [], m, p, c, x;
  while (f) {
    if ((m = /^[^\x25]+/.exec(f))) o.push(m[0]);
    else if ((m = /^\x25{2}/.exec(f))) o.push('%');
    else if ((m = /^\x25(?:(\d+)\$)?(\+)?(0|'[^$])?(-)?(\d+)?(?:\.(\d+))?([b-fosuxX])/.exec(f))) {
      if (((a = arguments[m[1] || i++]) == null) || (a == undefined)) throw("Too few arguments.");
      if (/[^s]/.test(m[7]) && (typeof(a) != 'number'))
        throw("Expecting number but found " + typeof(a));
      switch (m[7]) {
        case 'b': a = a.toString(2); break;
        case 'c': a = String.fromCharCode(a); break;
        case 'd': a = parseInt(a); break;
        case 'e': a = m[6] ? a.toExponential(m[6]) : a.toExponential(); break;
        case 'f': a = m[6] ? parseFloat(a).toFixed(m[6]) : parseFloat(a); break;
        case 'o': a = a.toString(8); break;
        case 's': a = ((a = String(a)) && m[6] ? a.substring(0, m[6]) : a); break;
        case 'u': a = Math.abs(a); break;
        case 'x': a = a.toString(16); break;
        case 'X': a = a.toString(16).toUpperCase(); break;
      }
      a = (/[def]/.test(m[7]) && m[2] && a > 0 ? '+' + a : a);
      c = m[3] ? m[3] == '0' ? '0' : m[3].charAt(1) : ' ';
      x = m[5] - String(a).length;
      p = m[5] ? str_repeat(c, x) : '';
      o.push(m[4] ? a + p : p + a);
    }
    else throw ("Huh ?!");
    f = f.substring(m[0].length);
  }
  return o.join('');
}


/////////////////////////////////////////////////////// Manage exit value

var _exitValue;
function SetExitValue(val) _exitValue = val;
function GetExitValue() _exitValue;



/////////////////////////////////////////////////////// Debug inspect

var INSPECT = [];
function Inspect() '$'+[fct() for each (fct in INSPECT)].join(LF);



/////////////////////////////////////////////////////// Debug tools

function DPrint() {
	
	for ( let i = 0; i < arguments.length; i++ )
		Print( '{'+arguments[i]+'} ' );
	Print(LF);
}

var Trace = DPrint;

function DStack(skip) { try { throw Error() } catch(ex) { Print( 'Stack: ', String(ex.stack).split(LF).slice(skip||0).join(LF), LF ) } }

function DArgs() { Print( 'Arguments: ', Array.slice(DArgs.caller.arguments).toSource(), LF ) }


function DebugTraceCall(name) { 
	
	try {

		var args = Array.slice(arguments.callee.caller.arguments);
		var out = '';
		for ( var i in args ) {

			if ( typeof args[i] == 'string' ) {

				args[i] = '"'+args[i]+'"';
				continue;
			}

			if ( args[i] instanceof Function ) {

				args[i] = (args[i].name||'???')+'()';
				continue;
			}

			if ( typeof(args[i]) == 'object' && !('toString' in (args[i])) ) {

				var list = [];
				for each ( var [k,v] in Iterator(args[i]) )
					list.push( k+':'+v );
				args[i] = '{ '+list.join(', ')+' }';
				continue;
			}

			args[i] = args[i].toString();
		}

		DebugTrace( 'CALL SPY', name, arguments.callee.caller.name, args.join(', ') );

	} catch(ex) { DebugTrace( 'DEBUG TRACE ERROR' ) }
}
