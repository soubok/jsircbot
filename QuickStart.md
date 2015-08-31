**!! NEW VERSION IN PROGRESS !!**

**!! NEW VERSION IN PROGRESS !!**

**!! NEW VERSION IN PROGRESS !!**

### Introduction ###
The aim of this page is to explain you how jsircbot works, an how to customize it.

The first obvious thing you have to know is how does IRC works.

Internet Relay Chat [Client Protocol](http://www.irchelp.org/irchelp/rfc/rfc2812.txt) and [Server Protocol](http://www.irchelp.org/irchelp/rfc/rfc2813.txt).

jsircbot is nothing else that a non-interactive IRC client ( on the other hand mIRC is an interactive IRC client ).

### Overview ###
jsircbot is split in two parts :

  * **The core** : manages low level operations (Socket connections, messages, ...)
  * **The modules** : manage higher level operations (channel management, DCC requests, ...)

### jsircbot core ###
The core manages :

  * The connection to the server
  * IRC messages receipt
  * IRC messages sending
  * The events to the modules

### A module is a simple object that implements some functions ( Core -> Module ) ###

  * **InitModule** : Called by the core when the module have to initializes itself. At this stage, the bot is NOT connected to the server.
  * **OnConnecting** : Called when the core is trying to connect to a server
  * **OnConnected** : Called by the core when it is connected to the server.
  * **OnConnectionFailed** : Called by the core if the connecting attempt has failed.
  * **OnDisconnecting** : Called by the core when the server has disconnected the bot
  * **OnDisconnected** :Called by the core when the bot is disconnected
  * **OnConnectionTimeout** : Called by the core if the connection cannot be done at time
  * **FinalizeModuleListeners** : Called by the core when the module have to remove its listeners. (see. RemoveMessageListener )
  * **FinalizeModuleAPI** : Called by the core when the module have to free its public API

Note: It is NOT mandatory for a module to implement these functions.
Note2: All modules are notified by these events.

### A module can call some functions to the Core ###

  * **Send** : send a row message to the server
  * **AddMessageListener** : allow the module to listen a specific IRC message.
  * **RemoveMessageListener** : remove a listener set by AddMessageListener.
  * **AddMessageListenerSet** : register a whole object for receiving IRC messages.
  * **RemoveMessageListenerSet** : remove a listener set

Note: All theses functions are stored in the current object of the module ( this )


### Module public API ###

It is possible for a module to create and export its own API. For example, the CTCP module export AddCtcpListener(), RemoveCtcpListener(), CtcpQuery() and CtcpResponse() function and are available for other modules.

The module use the this.api object ( that is provided by the core at the module initialization) to store its public API. this.api object is common to all modules.


### Core data API ###

The core implements a listener-based tree structure that is available for modules to store any kind of information. this structure is shared between all modules and the core. In a module, the root object of this storage space is this.data.
eg. the ChannelModule use this structure to store general informations about the channel it manages.
```
...      
TOPIC: function( from, command, channel, topic ) {

  if ( channel != _channel )
    return;
  setData( this.data.channel[channel].topic, topic );
},
...
```
In the previous example, the ChannelModule listen for any TOPIC messages from the IRC server, and store the topic string in a right place.
next, anyone that are listening this node of the tree will receive a notification.

eg: the following example, send a message to the channel when the topic has changed
```
addDataListener( _module.data.channel['#jslibs'].topic, function(info) {
       
  _module.Send( 'PRIVMSG #jslibs :the topic has changed: ' + info );
});
```

### Default modules ###
The current jsircbot distribution cames with some default modules

  * **DefaultModule** : manages server handshake and login.
> > arguments: nick, username, realname
  * **ChannelModule** : manages a specific IRC channel.
> > arguments: channelName
  * **CTCPModule** : manages CTCP protocol codec
> > arguments: _none_
  * **DCCReceiverModule** : manages incoming DCC file transfer
> > arguments: destinationPath