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
LoadModule('jsobjex');

Exec('tools.js');
Exec('dataObject.js');
Exec('io.js');
Exec('ident.js');


///////////////////////////////////////////////// CONST /////////////////////////////////////////////

// Default state names
const STATE_RUNNING = 'running';


// IRC state names
const STATE_INTERACTIVE = 'interactive';
const STATE_HAS_GOOD_NICK = 'hasGoodNick';


///////////////////////////////////////////////// TOOLS /////////////////////////////////////////////

function MakeModuleFromHttp( url, retry, retryPause, callback ) {

	var CreationFunction = let ( args = arguments ) function() args.callee.apply(null, args);

	StartAsyncProc( new function() {

		ReportNotice( 'Loading module from: '+url );
		for (;;) {
	
			var [status, statusCode, reasonPhrase, headers, body] = yield function(cb) HttpRequest(url, undefined, 10*SECOND, cb);
			if ( status == OK && statusCode == 200 )
				break;

			if ( --retry <= 0 || Match(status, BADREQUEST, NOTFOUND, ERROR) > 0 || status == OK && statusCode > 500 ) {

				ReportError('Failed to load the module from '+url+' (status:'+String(status)+', reason:'+reasonPhrase+').');
				callback(status);
				return; // cannot retry in this case
			}
			
			ReportError('Retrying to load the module from '+url+' ('+retry+' tries left)');
			yield function(cb) io.AddTimeout( retryPause, cb ); // async pause
		}
		
		var relativeLineNumber;
		try {
			
			try { throw new Error() } catch(ex) { relativeLineNumber = ex.lineNumber }
			var modConstructor = eval(body);
		} catch(ex) {
		
			ex.lineNumber -= relativeLineNumber;
			ex.fileName = url;
			ReportError('Failed to make the module: '+ExToText(ex));
			callback(BADRESPONSE);
			return;
		}

		ReportNotice( 'Module '+url+ ' loaded.' );
		callback(OK, modConstructor, CreationFunction, url);
	});
}


function MakeModuleFromPath( path, callback ) {
	
	var CreationFunction = let ( args = arguments ) function() args.callee.apply(null, args);

	ReportNotice( 'Loading module from: '+path );

	try {
		
		var modConstructor = Exec(path, false); // do not save compiled version of the script
	} catch(ex) {

		ReportError('Failed to make the module from '+path+' ('+ExToText(ex)+')');
		callback(BADRESPONSE);
		return;
	}
	callback(OK, modConstructor, CreationFunction, path);
	ReportNotice( 'Module '+path+ ' loaded.' );
}


function LoadModuleFromURL( url, retryCount, retryPause, callback ) { // callback(moduleConstructor, creationFunction, source);

	const defaultSufix = '.jsmod';
	var ud = ParseUri(url);
	
	switch (ud.protocol.toLowerCase()) {
		case 'file':
			var path = ud.path.substr(1);
			if ( path.substr(-1) == '/' ) {
				
				var entry, dir = new Directory(path, Directory.SKIP_BOTH);
				for ( dir.Open(); (entry = dir.Read()); )
					if ( StringEnd( entry, defaultSufix ) )
						MakeModuleFromPath( path+entry, callback );
			} else
				MakeModuleFromPath( path, callback );
			break;
		case 'http':
			MakeModuleFromHttp( url, retryCount, retryPause, callback );
			break;
		default:
			ReportError('Invalid module source: URL not supported ('+url+')');
	}	
}


function LoadModuleList( core, moduleList ) {
	
	var moduleLoadRetry = getData(core.data.moduleLoadRetry);
	var moduleLoadRetryPause = getData(core.data.moduleLoadRetryPause);
	
	var sem = new Semaphore(2); // only 2 concurrent loads
		
	function ModuleLoaded(status, moduleConstructor, creationFunction, source) {
	
		if ( status == OK )
			core.AddModule(moduleConstructor, creationFunction, source);
		sem.Release();
	}

	StartAsyncProc( new function() {

		for each ( let moduleURL in moduleList ) {
		
			yield AsyncSemaphoreAcquire(sem);
			LoadModuleFromURL( moduleURL, moduleLoadRetry, moduleLoadRetryPause, ModuleLoaded );
		}		
	});
}


///////////////////////////////////////////////// CORE /////////////////////////////////////////////

function Core( Configurator ) {

	var _core = this;
	var _data = this.data = newDataNode();
	Configurator(_data);
	
	function ListenerException(ex) ReportError( ExToText(ex) );
	var _moduleListener = new Listener( ListenerException );
	var _state = new StateKeeper( ListenerException );

	_api.AddModuleListener = _moduleListener.Add;
	_api.RemoveModuleListener = _moduleListener.Remove;
	_api.ToggleModuleListener = _moduleListener.Toggle;
	_api.FireModuleListener = _moduleListener.Fire;

	var _api = {}; // or new SetOnceObject(); or NewDataObj(); see. AddModule !
	_api.__noSuchMethod__ = function(methodName) {
		
		ReportError( 'UNDEFINED API: '+methodName );
		return NOSUCHMETHOD;
	}

	var _modules = [];
	
	this.AddModule = function( moduleConstructor, creationFunction, source ) {
	
		var module = new moduleConstructor(_data, _api, _state);

		if ( module.disabled ) {
		
			ReportWarning( 'Module '+source+' is disabled.' );
			return;
		}
		
		if ( module.moduleApi )
			for ( let f in module.moduleApi )
				if ( f in _api ) { // avoid module API do be overwritten ( use hasOwnProperty() ? )
					
					ReportError( f+' function already defined in module API. Module '+source+' cannot be loaded.' );
					RemoveModule(module);
					return;
				} else {
				
					_api[f] = module.moduleApi[f];
				}
			
		if ( module.stateListener )
			for each ( let {set:set, reset:reset, trigger:trigger} in module.stateListener )
				_state.AddStateListener(set, reset, trigger);
		
		if ( module.moduleListener )
			_moduleListener.Add( module.moduleListener );
		
		module.Reload = creationFunction; // this function allows the module to completly reload itself from the same source
		module.name = module.name || moduleConstructor.name || IdOf(source).toString(36); // modules MUST have a name.
		module.source = source; // not mendatory for the moment
		_modules.push(module);
		_state.Enter(module.name); // don't move this line
	}
	

	this.LoadModule = function( moduleURL ) {
	
		var moduleLoadRetry = getData(core.data.moduleLoadRetry);
		var moduleLoadRetryPause = getData(core.data.moduleLoadRetryPause);

		function ModuleLoaded(status, moduleConstructor, creationFunction, source) {

			if ( status == OK )
				core.AddModule(moduleConstructor, creationFunction, source);
		}
		LoadModuleFromURL( moduleURL, moduleLoadRetry, moduleLoadRetryPause, ModuleLoaded );
	}

	
	this.RemoveModule = function( module ) {
		
		if ( !DeleteArrayElement(_modules, module) ) // remove the module from the module list
			return;

		_state.Leave(module.name);

		if ( module.moduleListener )
			_moduleListener.Remove( module.moduleListener );
		
		if ( module.moduleApi )
			for ( var f in module.moduleApi )
				delete _api[f];
				
		if ( module.stateListener )
			for each ( let {set:set, reset:reset, trigger:trigger} in module.stateListener )
				_state.RemoveStateListener(set, reset, trigger);

		Clear(module); // jsstd
	}
	
	
	this.ReloadModule = function( module ) {
		
		var ReloadFct = module.Reload;
		for each ( let m in _core.ModulesByName(module.name) )
			_core.RemoveModule(m); // remove existing module with the same name
		ReloadFct();
	}
	
	
	this.ModulesByName = function( name ) { // note: this.HasModuleName = function( name ) _modules.some(function(mod) mod.name == name);

		return [ mod for each ( mod in _modules ) if ( mod.name == name ) ];
	}

	this.ModuleList = function() _modules.slice(); // slice() to prevent dead-loop


	Seal(this); // jsstd

	LoadModuleList( _core, getData(_data.moduleList) );

	_state.Enter(STATE_RUNNING);
	io.Process( endSignal );
	_state.Leave(STATE_RUNNING);
}



///////////////////////////////////////////////// MAIN /////////////////////////////////////////////

function DateString() let ( d = new Date ) d.getFullYear() + StringPad(d.getMonth()+1,2,'0') + StringPad(d.getDate(),2,'0');
var thisSession = 'jsircbot_'+(Now())+'.log'; // used to create ONE log file by session

//log.AddFilter( MakeLogFile(function() 'jsircbot_'+DateString()+'.log', false), LOG_ALL - LOG_NET );
log.AddFilter( MakeLogFile(function() thisSession, false), LOG_ALL );
log.AddFilter( MakeLogScreen(), LOG_FAILURE | LOG_ERROR | LOG_WARNING );

ReportNotice('Start at '+(new Date()));

try {

	new Core(Exec('configuration.js'));
} catch( ex if ex instanceof IoError ) {

	ReportFailure( 'IoError: '+ ex.text + ' ('+ex.os+')' );
}

ReportNotice('**************************** Gracefully end.');
log.Close();

var remainingOpenDescriptors = io.Close(); // this must be done at the very end
Print( 'remaining open descriptors: '+remainingOpenDescriptors );

GetExitValue(); // this must be the last evaluated expression
