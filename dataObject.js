LoadModule('jsobjex');

function newDataNode(parent) {

	return new objex(undefined,undefined,get,undefined,{listenerList:[],parent:parent});
}

function get( what, obj, id, val, aux ) {
	
	return id in obj ? val : obj[id] = newDataNode(obj);
}

//function set( what, obj, id, val, aux ) {
//	
//	return val
//}


function addDataListener( path, listener ) {

	objex.Aux( path ).listenerList.push(listener);
}

function removeDataListener( path, listener ) {

	var list = objex.Aux( path ).listenerList;
	list.splice( list.indexOf(listener), 1 );
}

function setData( path, data ) {
	
	var aux = objex.Aux(path);
	
	for ( var [i,l] in aux.listenerList )
		l('set', data);
	aux.data = data;
	
//	while ( path = (aux=objex.Aux(path)).parent || undefined )
//		aux.listener && aux.listener('set (children)');

	var paux = objex.Aux(aux.parent);
	for ( var [i,l] in paux.listenerList )
		l('set', data);
}

function getData( path ) {

	return objex.Aux(path).data || undefined; // "|| undefined" avoids strict warning
}

function moveData( path, newPath ) {
	
	setData( newPath, getData(path));
	delete objex.Aux(path).data;
	for ( i in path )
		moveData( path[i], newPath[i] );		
}

function delData( path ) { // delete datas but not listeners

	var aux = objex.Aux(path);
	
	for ( var [i,l] in aux.listenerList )
		l('del', data);
		
	delete aux.data;
	for ( var [k,v] in path )
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