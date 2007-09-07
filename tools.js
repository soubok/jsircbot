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


function DPrint() {
	
	for ( var i = 0; i < arguments.length; i++ )
		Print( '{'+arguments[i]+'} ' );
	Print( '\n' );
}

function DStack() { try { throw Error() } catch(ex) { Print( 'Stack: ', ex.stack, '\n' ) } }

function DArgs() { Print( 'Arguments: ', Array.slice(DArgs.caller.arguments).toSource(), '\n' ) }


///////////////////////////////////////////////////////

function StringPad( str, count, chr ) {

	var diff = count - str.length;
		while( diff-- > 0 )
			str = chr + str;  
	return str;
}


var log = new function() {

	var _time0 = IntervalNow();

	var _file = new File('ircbot.log');
	
	this.Write = function( data ) {
		
		var t = IntervalNow() - _time0;
		_file.Open( File.CREATE_FILE + File.WRONLY + File.APPEND );
		_file.Write( '{' + StringPad(t, 12, ' ') + '}' +data );
		_file.Close();
	}
	
	this.WriteLn = function( data ) {
		
		this.Write( data + '\n' );
	}
}


///////////////////////////////////////////////////////

function ExToText(ex, showStack) ex.name+': '+ex.message+' ('+(showStack ? ex.stack : (ex.fileName+':'+ex.lineNumber))+')';

function ReportError(text) { log.WriteLn(text); Print(text, '\n') } // fatal error

function Failed(text) { log.WriteLn(text); throw new Error(text) } // fatal error

function ERR() { throw ERR }

function CHK(v) v || ERR();
function CHKEQ(value, eq) value == eq ? value : ERR();
function CHKNEQ(value, neq) value != neq ? value : ERR();

function TRY(fct) {
	try { 
		void fct();
		return true;
	} catch(ex if ex == ERR) {
		return false;
	}
}

function Switch(i) arguments[++i];


///////////////////////////////////////////////////////


function Listener() {
	
	var _list = [];
	this.AddSet = function( set ) _list.push(set);
	this.RemoveSet = function( set ) _list.splice(CHKNEQ(_list.indexOf(set),-1), 1);
	this.Fire = function() {
		
		try {
			for each ( var set in _list.slice() ) {

				for ( var it = 0, n = set; n instanceof Object && it in arguments && arguments[it] in n; n = n[arguments[it++]] );
				n instanceof Function && n.apply(null, arguments);
			}
		} catch(ex) {
			
			ReportError( ExToText(ex) );
		}
	}
}


///////////////////////////////////////////////////////


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
	for ( var k in list )
		headers += k + ': ' + list[k] + CRLF;
	return headers;
}


function FormURLEncode( list ) {

	var data = '';
	for ( var k in list )
		data += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(list[k]);
	return data.substr(1);
}


function MakeStatusLine( method, path, version ) {

	return method + ' ' + path + ' ' + (version||'HTTP/1.0');
}


///////////////////////////////////////////////////////


function SetOnceObject() {

	return new ObjEx( undefined,undefined,undefined, function(name, value) this[name] ? Failed('API Already defined') : value );
}


function StringEnd( str, end ) {
	
	var pos = str.lastIndexOf(end);
	return (pos != -1 && pos  == str.length - end.length);
}


function FileExtension(filename) {

	var pt = filename.lastIndexOf('.');
	return  pt == -1 ? undefined : filename.substr(++pt);
}
