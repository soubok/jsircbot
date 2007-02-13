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

var io = new function() {

	var _timeout = new function() {

		var _min, _tlist = {};
		
		this.Add = function( time, func ) {

			var when = IntervalNow() + time;
			while( _tlist[when] ) when++; // avoid same time because we use the time as timer id
			_tlist[when] = func;
			if ( when < _min )
				_min = when;
			return when; // timer id
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
	
	var _descriptorList = [];
	
	this.AddTimeout = function( time, fct ) {
	
		return _timeout.Add( time, fct );
	}

	this.RemoveTimeout = function( when ) {
	
		_timeout.Remove( when );
	}

	this.AddDescriptor = function( d ) {
	
		_descriptorList.push(d);
	}

	this.RemoveDescriptor = function(d) {
		
		var pos = _descriptorList.indexOf(d);
		pos != -1 && _descriptorList.splice( pos, 1 );
	}

	this.Process = function( endPredicate ) {
	
		for ( ; !endPredicate() ; ) {
		
			Poll(_descriptorList, _timeout.Next(500));
			_timeout.Process();
		}
	}
	
	this.Close = function() {
		
		for each ( var d in _descriptorList )
			d.Close();		
	}
}
