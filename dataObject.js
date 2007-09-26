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

LoadModule('jsobjex');

function newDataNode(parent) new ObjEx(undefined,undefined,newDataNode.get,undefined,{listenerList:[],parent:parent});

newDataNode.get = function( name, value, aux ) (name in this) ? value : (this[name] = newDataNode(this));

function addDataListener( path, listener ) {

	ObjEx.Aux( path ).listenerList.push(listener);
}

function removeDataListener( path, listener ) {

	var list = ObjEx.Aux( path ).listenerList;
	var pos = list.indexOf(listener);
	pos != -1 && list.splice( pos, 1 );
}

function setData( path, data ) {
	
	var aux = ObjEx.Aux(path);
	for each ( var listener in aux.listenerList )
		listener('set', data);
	aux.data = data;
	
//	while ( path = (aux=ObjEx.Aux(path)).parent || undefined )
//		aux.listener && aux.listener('set (children)');

// bubble to all parents
//	var paux = ObjEx.Aux(aux.parent);
//	for ( var [i,l] in paux.listenerList )
//		l('set', data);
}

function getData( path ) {
	
	var aux = ObjEx.Aux(path);
	return ('data' in aux) ? (aux.data) : undefined;
}

function hasData( path ) {

	return ('data' in ObjEx.Aux(path));
}

function moveData( path, newPath ) {
	
	setData( newPath, getData(path));
	delete ObjEx.Aux(path).data;
	for ( var k in path )
		moveData( path[k], newPath[k] );		
}

//function delPath( path ) {
//	
//	delete path;
//}

function delData( path ) { // delete datas but not listeners

	var aux = ObjEx.Aux(path);
	for each ( var listener in aux.listenerList )
		listener('del');
	delete aux.data;
	for each ( var v in path )
		delData( v );
}

/*

var xml = <data>
  <aaa/>
  <aaa/>
</data>;

for each( var x in xml ) {

  _o(x.name())
}

function importXML( dest, src ) {
	
	for ( var name in src ) {
		
		dest[name] = src[name]
}
*/

function dumpData( path, tab ) {

	tab = tab||'';
	var out = '';
	for ( var name in path ) {
		
		var has = hasData(path[name]);
		var data = getData(path[name]);

		switch ( typeof data ) {
			case 'string':
				data = '"' + data + '"';
				break;
			case 'object':
				if ( data instanceof Array )
					data = data.toSource();
				break;
		}

		out += tab + name + (has ? (' = ' + data) : '');
		out += '\n' + dumpData(path[name], tab + '    ');
	}
	return out;
}
