/* ***** BEGIN LICENSE BLOCK *****
 * Version: GNU GPL 3.0
 *
 * The contents of this file are subject to the
 * GNU General Public License Version 3.0; you may not use this file except
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


var obj = {};
var c = 0, i;
while ( !endSignal ) {

	for ( i = 0; i < 1000000; i++ ) {
		obj[1] = 2;
		delete obj[1];
	}
	
	Print('*\n');
	Sleep(1000);
	CollectGarbage();
}

Halt();



(function() {

	io.AddTimeout( 0, arguments.callee );
})();

io.Process( function() { CollectGarbage(); return endSignal } );

