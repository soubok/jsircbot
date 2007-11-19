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

LoadModule('jsstd'); 
LoadModule('jsio');
//LoadModule('jsobjex');

Exec('tools.js');
Exec('io.js');

DBG = false;


function DateString() let ( d = new Date ) d.getFullYear() + StringPad(d.getMonth()+1,2,'0') + StringPad(d.getDate(),2,'0');
var thisSession = 'log_'+(Now())+'.log'; // used to create ONE log file by session
log.AddFilter( MakeLogFile(function() thisSession, false), LOG_ALL );

var count = 0;

try {

	(function() {
		
		Print( count, '\n' );
		io.AddTimeout( 1000, arguments.callee );
	})();

	(function() {
		
		count++;
		HttpRequest( 'http://127.0.0.1:8080/', undefined, 200, function(status, statusCode, reasonPhrase, headers, response) {

			ReportNotice( 'HttpRequest: '+ status );
		});
		
		UDPGet( '127.0.0.1', 5678, 'abcdefghi', 10, function(status, data, time) {

			ReportNotice( 'UDPGet: '+ status );
		});
		
		io.AddTimeout( 1, arguments.callee );
	})();


	io.Process( function() { CollectGarbage(); return endSignal } );

} catch( ex if ex instanceof IoError ) {

	ReportFailure( 'IoError: '+ ex.text + ' ('+ex.os+')' );
}
