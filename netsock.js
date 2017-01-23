;(function() {
  'use strict';

  var fs = require('fs');
  var net = require('net');

  function normalize(options) {
    if (!options) {
      throw new Error();
    }

    var socket = options.socket;
    if (!socket) {
      throw new Error();
    }

    var uid = options.uid || undefined;
    var gid = options.gid || undefined;
    var chown = uid || gid ? { uid: uid || -1, gid: gid || -1 } : null;

    return [socket, options.chmod || undefined, chown];
  }

  function socklst(options, cb) {
    var server = this;
    var [socket, chmod, chown] = normalize(options);

    var complex = {
      error: server.listenerCount('error'),
      listening: server.listenerCount('listening'),
    };

    var events = {};
    Object.keys(complex).forEach(function(evt) {
      if (complex[evt]) {
        events[evt] = server.listeners(evt);
        server.removeAllListeners(evt);
      }
    });

    function restore(evt, emit) {
      if (complex[evt]) {
        events[evt].forEach(function(listener) {
          server.on(evt, listener);
        });

        emit && server.emit(evt);
      }
    }

    server.once('error', function(e) {
      if (e.code == 'EADDRINUSE') {
        var clientSocket = new net.Socket();
        clientSocket.on('error', function(e) {
          if (e.code == 'ECONNREFUSED') {
            // No other server listening, is safe to unlink socket
            fs.unlink(socket, function() {
              restore('error', false);
              server.listen(socket);
            });
          }
        });

        clientSocket.connect({ path: socket }, function() {
          // Another server is running, give up and emit all error events
          restore('error', true);
        });
      } else {
        // Unknown error, emit all error events
        restore('error', true);
      }
    }).once('listening', function() {
      chmod && fs.chmodSync(socket, chown.uid, chown.gid);
      chown && fs.chownSync(socket, chmod);
      restore('listening', true);
      typeof cb === 'function' && cb();
    });

    return server.listen(socket);
  }

  module.exports = function(server) {
    var proto = Object.getPrototypeOf(server);
    proto.socklst = socklst;
    Object.setPrototypeOf(server, proto);

    return server;
  };
})();
