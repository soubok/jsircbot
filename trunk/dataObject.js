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

function newDataNode(parent) {

	return new objex(undefined,undefined,get,undefined,{listenerList:[],parent:parent});
}

function get( what, obj, id, val, aux ) {
	
	return id in obj ? val : obj[id] = newDataNode(obj);
}

function addDataListener( path, listener ) {

	objex.Aux( path ).listenerList.push(listener);
}

function removeDataListener( path, listener ) {

	var list = objex.Aux( path ).listenerList;
	var pos = list.indexOf(listener);
	pos != -1 && list.splice( pos, 1 );
}

function setData( path, data ) {
	
	var aux = objex.Aux(path);
	for each ( var listener in aux.listenerList )
		listener('set', data);
	aux.data = data;
	
//	while ( path = (aux=objex.Aux(path)).parent || undefined )
//		aux.listener && aux.listener('set (children)');

// bubble to all parents
//	var paux = objex.Aux(aux.parent);
//	for ( var [i,l] in paux.listenerList )
//		l('set', data);
}

function getData( path ) {

	return objex.Aux(path).data || undefined; // "|| undefined" avoids strict warning
}

function hasData( path ) {

	return 'data' in objex.Aux(path);
}

function moveData( path, newPath ) {
	
	setData( newPath, getData(path));
	delete objex.Aux(path).data;
	for ( var [k,v] in path )
		moveData( v, newPath[k] );		
}

function delData( path ) { // delete datas but not listeners

	var aux = objex.Aux(path);
	for each ( var listener in aux.listenerList )
		listener('del');
	delete aux.data;
	for each ( var v in path )
		delData( v );
}

function dumpData( path, tab ) {

	tab = tab||'';
	var out = '';
	for ( var [name,child] in path ) {
		var data = getData(child);
		out += tab+name+(( data != undefined ) ?'='+data : '')+'\n'+dumpData(child,tab+'  ');
	}
	return out;
}
