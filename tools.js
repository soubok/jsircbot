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



/////////////////////////////////////////////////////// status objects

ENUM({
	OK:undefined,
	ERROR:undefined,
	TIMEOUT:undefined,
	NOTFOUND:undefined,
	BADREQUEST:undefined,
	BADRESPONSE:undefined,
	UNAVAILABLE:undefined,
	UNREACHABLE:undefined
});



/////////////////////////////////////////////////////// Date and Time

function Now() (new Date).getTime(); // returns the current date in ms

const SECOND = 1000; // ms
const MINUTE = 60*SECOND;
const HOUR = 60*MINUTE;
const DAY = 24*HOUR;
const WEEK = 7*DAY;
const YEAR = 365*DAY + 5*HOUR + 48*MINUTE + 45*SECOND;



/////////////////////////////////////////////////////// Errors

function ExToText(ex, showStack) ex instanceof Error ? ex.name+': '+ex.message+' ('+(showStack ? ex.stack : (ex.fileName+':'+ex.lineNumber))+')' : ex.toString();

function Failed(text) { ReportFailure(text); throw new Error(text) } // fatal error

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

function StateKeeper() {

	var _stateList = NewDataObj();
	var _predicateList = [];

//	function Is(stateName) stateName in _stateList; // not needed fot the moment

	function StateChanging(stateName, state) {
		
		if ( !state == !_stateList[stateName] ) // if state is already set
			return;
		DBG && DebugTrace( 'STATE', stateName, state );
		_stateList[stateName] = state;
		for each ( let item in _predicateList ) {
			var callback = item[2];
			if ( !item[3] )
				item[0](_stateList, stateName) && callback.call(callback, (item[3] = true), _predicateList); // 'this' will be the function itself
			else
				( item[1] ? item[1](_stateList, stateName) : !item[0](_stateList) ) && callback.call(callback, (item[3] = false), _predicateList); // 'this' will be the function itself
		}
	}
	
	this.Enter = function(stateName) StateChanging(stateName, true);
	this.Leave = function(stateName)	StateChanging(stateName, false);
	this.Toggle = function(stateName, polarity) StateChanging(stateName, polarity);

	this.AddStateListener = function( setPredicate, resetPredicate, callback, initialState ) 
		_predicateList.push(arguments);
	this.RemoveStateListener = function( setPredicate, resetPredicate, callback ) 
		_predicateList.some( function(item, index) item[0] == setPredicate && item[1] == resetPredicate && item[2] == callback && _predicateList.splice(index,1) );

	INSPECT.push(function() 'STATE '+[stateName+':'+state for ([stateName, state] in Iterator(_stateList))].join(' '));
}



/////////////////////////////////////////////////////// Event Listener

function Listener() {
	
	var _list = [];
	this.Add = function( set ) void _list.push(set);
	this.Remove = function( set ) void _list.splice(CHKNEQ(_list.indexOf(set),-1), 1);
	this.Toggle = function( set, polarity ) {

		if ( polarity )
			void _list.push(set);
		else
			void _list.splice(CHKNEQ(_list.indexOf(set),-1), 1);
	}
	
	this.Fire = function Fire() { // beware, Fire is only used for the function name
	
		try {

			for each ( let set in _list.slice() ) {
				
				var n = set;
				for ( var it = 0; typeof(n) == 'object' && it in arguments && arguments[it] in n; n = n[arguments[it++]] ); // var is faster than let
				n instanceof Function && void n.apply(n, arguments); // 'this' will be the function itself
			}
		} catch(ex) {

			DBG && ReportError( ExToText(ex) );
		}
	}
}



/////////////////////////////////////////////////////// Asynchronus procedures

function StartAsyncProc( procedure ) {
	
	DBG && DebugTrace( 'START PROC', (procedure.name||'???')+'()' );
	try {
		void procedure.next()(function(result) {

			try {
				void procedure.send(arguments)(arguments.callee);
			} catch(ex if ex == StopIteration) {}
		});
	} catch(ex if ex == StopIteration) {}
}

function AbortAsyncProc() { // used inside a procedure
	
	throw StopIteration;
}

function StopAsyncProc( procedure ) { // used outside a procedure
	
	DBG && DebugTrace( 'STOP PROC', procedure.name );
	procedure.close();
}

function ToggleAsyncProc( procedure, polarity ) {
	
	if ( polarity )
		StartAsyncProc( procedure );
	else
		StopAsyncProc( procedure );
}



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
	LOG_FAILURE: bit*=2,
	LOG_ERROR: bit*=2,
	LOG_WARNING: bit*=2,
	LOG_NOTICE: bit*=2,
	LOG_DEBUG: bit*=2,
	LOG_IRCMSG: bit*=2,
	LOG_NET: bit*=2,
	LOG_HTTP: bit*=2,
	LOG_PROC: bit*=2,
	LOG_ALL: (bit*=2)-1
});

const LOG_CLOSE_FILTER = { toString:function() '' };

function MakeLogScreen() function(data) {
	
	Print('    '+data+LF);
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
	function FormatedTime() StringPad(((Now()-_time0)/SECOND).toFixed(2), 7, ' ');

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

		var data = FormatedTime()+' '+String(type)+' <'+Array.slice(arguments,1).join('> <')+'>';
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


function DeleteArrayElement( array, element ) let (pos = array.lastIndexOf(element)) pos != -1 ? array.splice(pos, 1) : undefined;


function SetOnceObject() new ObjEx( undefined,undefined,undefined, function(name, value) this[name] ? Failed('Property Already defined') : value );



/////////////////////////////////////////////////////// String functions

function StringPad( str, count, chr ) {
	
	str += '';
	chr = chr || SPC;
	var diff = count - str.length;
	while( diff-- > 0 )
		str = chr + str;
	return str;
}


function LTrim(str) str.replace(/^\s+/, '');


function RTrim(str) str.replace(/\s+$/, '');


function Trim(str) str.replace(/^\s+|\s+$/g, '');


function StrBefore(str, sep) (sep = str.indexOf(sep)) == -1 ? str : str.substr(0, sep);


function StringReplacer(conversionObject) function(s) s.replace(new RegExp([k.replace(/(\/|\.|\*|\+|\?|\||\(|\)|\[|\]|\{|\}|\\)/g, "\\$1") for (k in conversionObject)].join('|'), 'g'), function(str) conversionObject[str]); // eg. StringReplacer({aa:11})('xxaaxx'); returns 'xx11xx'


function Switch(i) arguments[++i];


function Match(v) Array.indexOf(arguments,v,1)-1;


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

// try: http://www.webtoolkit.info/



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

function DStack() { try { throw Error() } catch(ex) { Print( 'Stack: ', ex.stack, LF ) } }

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


var DBG = true;




