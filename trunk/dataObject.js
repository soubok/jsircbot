function newNode() {

	return new objex(undefined,undefined,get,undefined,{});
}

function get( what, obj, id, val, aux ) {

	return id in obj ? val : obj[id] = newNode();
}

function addListener( path, listener ) {

	objex.Aux( path ).listener = listener;
}

function setData( path, data ) {
	
	var aux = objex.Aux( path );
	aux.listener && aux.listener('set', data);
	aux.data = data;
}

function getData( path, data ) {

	return objex.Aux( path ).data || undefined;
}

function moveData( path, newPath ) {
	
	setData( newPath, getData(path));
	delete objex.Aux(path).data;
	for ( i in path )
		moveData( path[i], newPath[i] );		
}


function delData( path ) { // delete datas but not listeners

	var aux = objex.Aux(path);
	aux.listener && aux.listener('del');
	delete aux.data;
	for ( var [k,v] in path )
		delData( v );
}
