var timeout = new function() {

	var _min;
	var _tlist = {};
	this.Add = function( time, func ) {
	
		var when = IntervalNow() + time;
		while( _tlist[when] ) when++; // avoid same time
		_tlist[when] = func;
		if ( when < _min )
			_min = when;
		return when;
	}
	
	this.Remove = function(when) {
		
		if ( when == _min )
			_min = Number.POSITIVE_INFINITY;
		delete _tlist[when];
	}
	
	this.Next = function(defaultTimeout) {
		
		_min = Number.POSITIVE_INFINITY;
		for ( var w in _tlist )
			if ( w < _min )
				_min = w;
//		var t = _min == Number.POSITIVE_INFINITY ? undefined : _min - IntervalNow();
		var t = _min - IntervalNow();
		return t > defaultTimeout ? defaultTimeout : t;
	}

	this.Process = function() {
		
		var now = IntervalNow();
		if ( _min > now )
			return;
		for ( var [w,f] in _tlist )
			if ( w <= now ) {
				f();
				delete _tlist[w];
			}
	}
}


var io = new function() {
	
	var _descriptorList = [];
	
	this.AddTimeout = function( time, fct ) {
	
		return timeout.Add( time, fct );
	}

	this.RemoveTimeout = function( when ) {
	
		timeout.Remove( when );
	}
	
	this.AddDescriptor = function( d ) {
	
		_descriptorList.push(d);
	}

	this.RemoveDescriptor = function(d) {
		
		_descriptorList.splice( _descriptorList.indexOf(d), 1 );
	}

	this.Process = function( endPredicate ) {
	
		for ( ; !endPredicate() ; ) {
		
			Poll(_descriptorList, timeout.Next(1000));
			timeout.Process();
		}
	}
	
	this.Close = function() {

		//Poll(_descriptorList, 1000);
		Sleep(500);
		
		for ( var [i,d] in _descriptorList )
			d.Close();		
	}
}
