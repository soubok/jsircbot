/*
<style type="text/css" title="terminal" rel="stylesheet"></style>
<style type="text/css" title="console" rel="alternate stylesheet" disabled="disabled">
body {
	border-bottom: 20px solid black;
}
#in {
	position: fixed;
	bottom: 0px;
	left: 0px;
	border-top: 2px solid #666;
	background-color: #111;
}
</style>
*/

function Console($A) {

	function StripHTML(html) { return html.replace( /<(.|\n)+?>/mg, ' ').replace( /[ \n]+/g, ' ') }
	
	$A.SetStyle('\
		html { overflow-x: hidden; overflow-y: scroll; overflow: -moz-scrollbars-vertical } \
		body { margin: 1px } \
		html, #in { background-color: white; color: #CCC; white-space: nowrap; font-family: console, monospace; font-weight: bold; font-size: 10pt } \
		#in { border-style: none; padding: 0px; width: 100% } \
	');

	$A.InsertHtmlInside(_body, '<input type="text" id="in" autocomplete="off" />');
	var _in = _win.document.getElementById('in');

	function Cout(html) {

		var isAtEnd = (_html.scrollTop + _html.clientHeight >= _html.scrollHeight - 1); // cf. body {	margin: ...
		$A.InsertHtmlBefore(_in, html);
		if ( isAtEnd )
			_html.scrollTop = _html.scrollHeight;
	}

	this[CONNECTION_ERROR] = function(eventName) {

		Cout('<span style="color:red">Connection closed</span><br/>');
	}

	this[RECEIVE_DATA_ITEM] = function(_, type, html) {
		
		if ( type == 'console' )
			Cout(html);
	}

	var stack = [''], stackp = 0;
	function OnKey(event) {

		switch (event.keyCode) {

			case 38: // up
				if ( event.shiftKey || event.ctrlKey || event.altKey )
					return;
				if ( stackp == 0 )
					stack[0] = _in.value;
				if ( stackp < stack.length-1 )
					stackp++;
				_in.value = stack[stackp];
				break;
			case 40: // down
				if ( event.shiftKey || event.ctrlKey || event.altKey )
					return;
				_in.value = stackp ? stack[--stackp] : stack[0];
				break;
			case 13:
				if ( event.shiftKey || event.ctrlKey || event.altKey )
					return;
				stackp=0;
				stack[0] = _in.value;
				if ( stack[0] == stack[1] )
					stack[0] = '';
				else
					stack.unshift('');
				$A.DispatchEvent(SEND_DATA, 'console', _in.value);
				_in.value = '';
				_in.focus();
				break;
			case 27:
				_in.value = stackp ? stack[stackp=0] : '';
				break;
			case 33: // pageup
				if ( event.ctrlKey )
					_body.scrollTop -= _body.clientHeight;
				else
					return;
				break;
			case 34: // pagedown
				if ( event.ctrlKey )
					_body.scrollTop += _body.clientHeight;
				else
					return;
				break;
			case 35: // end
				if ( event.ctrlKey )
					_body.scrollTop = _body.scrollHeight;
				else
					return;
				break;
			case 36: // home
				if ( event.ctrlKey )
					_body.scrollTop = 0;
				else
					return;
				break;
			default:
				return;
		}
		$A.PreventDefault(event);
		$A.StopPropagation(event);
	}

	$A.AddEvent( _in, 'keydown', OnKey );
	$A.AddEvent( _html, 'click', function() { _in.focus() } );
	$A.AddEvent( _html, 'focus', function() { _in.focus() } );
	$A.AddEvent( _body, 'resize', function() { _html.scrollTop = _html.scrollHeight } );
	$A.AddEvent( _win, 'beforeunload', function() { return 'This will close the current session.' } );
//	ProcessResponse( new HttpRequest().Send('?action=history', undefined, undefined, true) , 'text/json');
	_in.focus();
}
