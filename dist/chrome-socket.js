"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _ramda = require("ramda");

var _timeout = _interopRequireDefault(require("./timeout"));

var _tlsUtils = _interopRequireDefault(require("./tls-utils"));

var _workerUtils = require("./worker-utils");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var TCPSocket = /*#__PURE__*/function () {
  _createClass(TCPSocket, null, [{
    key: "open",
    value: function open(host, port) {
      var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      return new TCPSocket({
        host: host,
        port: port,
        options: options
      });
    }
  }]);

  function TCPSocket(_ref) {
    var _this = this;

    var host = _ref.host,
        port = _ref.port,
        options = _ref.options;

    _classCallCheck(this, TCPSocket);

    this.host = host;
    this.port = port;
    this.ssl = false;
    this.bufferedAmount = 0;
    this.readyState = 'connecting';
    this.binaryType = (0, _ramda.propOr)('arraybuffer', 'binaryType')(options);

    if (this.binaryType !== 'arraybuffer') {
      throw new Error('Only arraybuffers are supported!');
    }

    this._ca = options.ca;
    this._useTLS = (0, _ramda.propOr)(false, 'useSecureTransport')(options);
    this._useSTARTTLS = false;
    this._socketId = 0;
    this._useLegacySocket = false;
    this._useForgeTls = false; // handles writes during starttls handshake, chrome socket only

    this._startTlsBuffer = [];
    this._startTlsHandshakeInProgress = false;
    chrome.runtime.getPlatformInfo(function (platformInfo) {
      if (platformInfo.os.indexOf('cordova') !== -1) {
        // chrome.sockets.tcp.secure is not functional on cordova
        // https://github.com/MobileChromeApps/mobile-chrome-apps/issues/269
        _this._useLegacySocket = false;
        _this._useForgeTls = true;
      } else {
        _this._useLegacySocket = true;
        _this._useForgeTls = false;
      }

      if (_this._useLegacySocket) {
        _this._createLegacySocket();
      } else {
        _this._createSocket();
      }
    });
  }
  /**
   * Creates a socket using the deprecated chrome.socket API
   */


  _createClass(TCPSocket, [{
    key: "_createLegacySocket",
    value: function _createLegacySocket() {
      var _this2 = this;

      chrome.socket.create('tcp', {}, function (createInfo) {
        _this2._socketId = createInfo.socketId;
        chrome.socket.connect(_this2._socketId, _this2.host, _this2.port, function (result) {
          if (result !== 0) {
            _this2.readyState = 'closed';

            _this2._emit('error', chrome.runtime.lastError);

            return;
          }

          _this2._onSocketConnected();
        });
      });
    }
    /**
     * Creates a socket using chrome.sockets.tcp
     */

  }, {
    key: "_createSocket",
    value: function _createSocket() {
      var _this3 = this;

      chrome.sockets.tcp.create({}, function (createInfo) {
        _this3._socketId = createInfo.socketId; // register for data events on the socket before connecting

        chrome.sockets.tcp.onReceive.addListener(function (readInfo) {
          if (readInfo.socketId === _this3._socketId) {
            // process the data available on the socket
            _this3._onData(readInfo.data);
          }
        }); // register for data error on the socket before connecting

        chrome.sockets.tcp.onReceiveError.addListener(function (readInfo) {
          if (readInfo.socketId === _this3._socketId) {
            // socket closed remotely or broken
            _this3.close();
          }
        });
        chrome.sockets.tcp.setPaused(_this3._socketId, true, function () {
          chrome.sockets.tcp.connect(_this3._socketId, _this3.host, _this3.port, function (result) {
            if (result < 0) {
              _this3.readyState = 'closed';

              _this3._emit('error', chrome.runtime.lastError);

              return;
            }

            _this3._onSocketConnected();
          });
        });
      });
    }
    /**
     * Invoked once a socket has been connected:
     * - Kicks off TLS handshake, if necessary
     * - Starts reading from legacy socket, if necessary
     */

  }, {
    key: "_onSocketConnected",
    value: function _onSocketConnected() {
      var _this4 = this;

      var read = function read() {
        if (_this4._useLegacySocket) {
          // the tls handshake is done let's start reading from the legacy socket
          _this4._readLegacySocket();

          _this4._emit('open');
        } else {
          chrome.sockets.tcp.setPaused(_this4._socketId, false, function () {
            _this4._emit('open');
          });
        }
      };

      if (!this._useTLS) {
        return read();
      } // do an immediate TLS handshake if this._useTLS === true


      this._upgradeToSecure(function () {
        read();
      });
    }
    /**
     * Handles the rough edges for differences between chrome.socket and chrome.sockets.tcp
     * for upgrading to a TLS connection with or without forge
     */

  }, {
    key: "_upgradeToSecure",
    value: function _upgradeToSecure() {
      var _this5 = this;

      var callback = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : function () {};

      // invoked after chrome.socket.secure or chrome.sockets.tcp.secure have been upgraded
      var onUpgraded = function onUpgraded(tlsResult) {
        if (tlsResult !== 0) {
          _this5._emit('error', new Error('TLS handshake failed. Reason: ' + chrome.runtime.lastError.message));

          _this5.close();

          return;
        }

        _this5.ssl = true; // empty the buffer

        while (_this5._startTlsBuffer.length) {
          _this5.send(_this5._startTlsBuffer.shift());
        }

        callback();
      };

      if (!this._useLegacySocket && this.readyState !== 'open') {
        // use chrome.sockets.tcp.secure for TLS, not for STARTTLS!
        // use forge only for STARTTLS
        this._useForgeTls = false;
        chrome.sockets.tcp.secure(this._socketId, onUpgraded);
      } else if (this._useLegacySocket) {
        chrome.socket.secure(this._socketId, onUpgraded);
      } else if (this._useForgeTls) {
        // setup the forge tls client or webworker as tls fallback
        (0, _tlsUtils["default"])(this);
        callback();
      }
    }
  }, {
    key: "upgradeToSecure",
    value: function upgradeToSecure() {
      var _this6 = this;

      if (this.ssl || this._useSTARTTLS) {
        return;
      }

      this._useSTARTTLS = true;

      this._upgradeToSecure(function () {
        if (_this6._useLegacySocket) {
          _this6._readLegacySocket(); // tls handshake is done, restart reading

        }
      });
    }
    /**
     * Reads from a legacy chrome.socket.
     */

  }, {
    key: "_readLegacySocket",
    value: function _readLegacySocket() {
      var _this7 = this;

      if (this._socketId === 0) {
        // the socket is closed. omit read and stop further reads
        return;
      } // don't read from chrome.socket if we have chrome.socket.secure a handshake in progress!


      if ((this._useSTARTTLS || this._useTLS) && !this.ssl) {
        return;
      }

      chrome.socket.read(this._socketId, function (readInfo) {
        // socket closed remotely or broken
        if (readInfo.resultCode <= 0) {
          _this7._socketId = 0;

          _this7.close();

          return;
        } // process the data available on the socket


        _this7._onData(readInfo.data); // Queue the next read.
        // If a STARTTLS handshake might be upcoming, postpone this onto
        // the task queue so the IMAP client has a chance to call upgradeToSecure;
        // without this, we might eat the beginning of the handshake.
        // If we are already secure, just call it (for performance).


        if (_this7.ssl) {
          _this7._readLegacySocket();
        } else {
          (0, _timeout["default"])(function () {
            return _this7._readLegacySocket();
          });
        }
      });
    }
    /**
     * Invoked when data has been read from the socket. Handles cases when to feed
     * the data available on the socket to forge.
     *
     * @param {ArrayBuffer} buffer The binary data read from the socket
     */

  }, {
    key: "_onData",
    value: function _onData(buffer) {
      if ((this._useTLS || this._useSTARTTLS) && this._useForgeTls) {
        // feed the data to the tls client
        if (this._tlsWorker) {
          this._tlsWorker.postMessage((0, _workerUtils.createMessage)(_workerUtils.EVENT_INBOUND, buffer), [buffer]);
        } else {
          this._tls.processInbound(buffer);
        }
      } else {
        // emit data event
        this._emit('data', buffer);
      }
    }
    /**
     * Closes the socket
     * @return {[type]} [description]
     */

  }, {
    key: "close",
    value: function close() {
      this.readyState = 'closing';

      if (this._socketId !== 0) {
        if (this._useLegacySocket) {
          // close legacy socket
          chrome.socket.disconnect(this._socketId);
          chrome.socket.destroy(this._socketId);
        } else {
          // close socket
          chrome.sockets.tcp.disconnect(this._socketId);
        }

        this._socketId = 0;
      } // terminate the tls worker


      if (this._tlsWorker) {
        this._tlsWorker.terminate();

        this._tlsWorker = undefined;
      }

      this._emit('close');
    }
  }, {
    key: "send",
    value: function send(buffer) {
      if (!this._useForgeTls && this._useSTARTTLS && !this.ssl) {
        // buffer the unprepared data until chrome.socket(s.tcp) handshake is done
        this._startTlsBuffer.push(buffer);
      } else if (this._useForgeTls && (this._useTLS || this._useSTARTTLS)) {
        // give buffer to forge to be prepared for tls
        if (this._tlsWorker) {
          this._tlsWorker.postMessage((0, _workerUtils.createMessage)(_workerUtils.EVENT_OUTBOUND, buffer), [buffer]);
        } else {
          this._tls.prepareOutbound(buffer);
        }
      } else {
        // send the arraybuffer
        this._send(buffer);
      }
    }
  }, {
    key: "_send",
    value: function _send(data) {
      var _this8 = this;

      if (this._socketId === 0) {
        // the socket is closed.
        return;
      }

      if (this._useLegacySocket) {
        chrome.socket.write(this._socketId, data, function (writeInfo) {
          if (writeInfo.bytesWritten < 0 && _this8._socketId !== 0) {
            // if the socket is already 0, it has already been closed. no need to alert then...
            _this8._emit('error', new Error('Could not write ' + data.byteLength + ' bytes to socket ' + _this8._socketId + '. Chrome error code: ' + writeInfo.bytesWritten));

            _this8._socketId = 0;

            _this8.close();

            return;
          }

          _this8._emit('drain');
        });
      } else {
        chrome.sockets.tcp.send(this._socketId, data, function (sendInfo) {
          if (sendInfo.bytesSent < 0 && _this8._socketId !== 0) {
            // if the socket is already 0, it has already been closed. no need to alert then...
            _this8._emit('error', new Error('Could not write ' + data.byteLength + ' bytes to socket ' + _this8._socketId + '. Chrome error code: ' + sendInfo.bytesSent));

            _this8.close();

            return;
          }

          _this8._emit('drain');
        });
      }
    }
  }, {
    key: "_emit",
    value: function _emit(type, data) {
      var target = this;

      switch (type) {
        case 'open':
          this.readyState = 'open';
          this.onopen && this.onopen({
            target: target,
            type: type,
            data: data
          });
          break;

        case 'error':
          this.onerror && this.onerror({
            target: target,
            type: type,
            data: data
          });
          break;

        case 'data':
          this.ondata && this.ondata({
            target: target,
            type: type,
            data: data
          });
          break;

        case 'drain':
          this.ondrain && this.ondrain({
            target: target,
            type: type,
            data: data
          });
          break;

        case 'close':
          this.readyState = 'closed';
          this.onclose && this.onclose({
            target: target,
            type: type,
            data: data
          });
          break;
      }
    }
  }]);

  return TCPSocket;
}();

exports["default"] = TCPSocket;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9jaHJvbWUtc29ja2V0LmpzIl0sIm5hbWVzIjpbIlRDUFNvY2tldCIsImhvc3QiLCJwb3J0Iiwib3B0aW9ucyIsInNzbCIsImJ1ZmZlcmVkQW1vdW50IiwicmVhZHlTdGF0ZSIsImJpbmFyeVR5cGUiLCJFcnJvciIsIl9jYSIsImNhIiwiX3VzZVRMUyIsIl91c2VTVEFSVFRMUyIsIl9zb2NrZXRJZCIsIl91c2VMZWdhY3lTb2NrZXQiLCJfdXNlRm9yZ2VUbHMiLCJfc3RhcnRUbHNCdWZmZXIiLCJfc3RhcnRUbHNIYW5kc2hha2VJblByb2dyZXNzIiwiY2hyb21lIiwicnVudGltZSIsImdldFBsYXRmb3JtSW5mbyIsInBsYXRmb3JtSW5mbyIsIm9zIiwiaW5kZXhPZiIsIl9jcmVhdGVMZWdhY3lTb2NrZXQiLCJfY3JlYXRlU29ja2V0Iiwic29ja2V0IiwiY3JlYXRlIiwiY3JlYXRlSW5mbyIsInNvY2tldElkIiwiY29ubmVjdCIsInJlc3VsdCIsIl9lbWl0IiwibGFzdEVycm9yIiwiX29uU29ja2V0Q29ubmVjdGVkIiwic29ja2V0cyIsInRjcCIsIm9uUmVjZWl2ZSIsImFkZExpc3RlbmVyIiwicmVhZEluZm8iLCJfb25EYXRhIiwiZGF0YSIsIm9uUmVjZWl2ZUVycm9yIiwiY2xvc2UiLCJzZXRQYXVzZWQiLCJyZWFkIiwiX3JlYWRMZWdhY3lTb2NrZXQiLCJfdXBncmFkZVRvU2VjdXJlIiwiY2FsbGJhY2siLCJvblVwZ3JhZGVkIiwidGxzUmVzdWx0IiwibWVzc2FnZSIsImxlbmd0aCIsInNlbmQiLCJzaGlmdCIsInNlY3VyZSIsInJlc3VsdENvZGUiLCJidWZmZXIiLCJfdGxzV29ya2VyIiwicG9zdE1lc3NhZ2UiLCJFVkVOVF9JTkJPVU5EIiwiX3RscyIsInByb2Nlc3NJbmJvdW5kIiwiZGlzY29ubmVjdCIsImRlc3Ryb3kiLCJ0ZXJtaW5hdGUiLCJ1bmRlZmluZWQiLCJwdXNoIiwiRVZFTlRfT1VUQk9VTkQiLCJwcmVwYXJlT3V0Ym91bmQiLCJfc2VuZCIsIndyaXRlIiwid3JpdGVJbmZvIiwiYnl0ZXNXcml0dGVuIiwiYnl0ZUxlbmd0aCIsInNlbmRJbmZvIiwiYnl0ZXNTZW50IiwidHlwZSIsInRhcmdldCIsIm9ub3BlbiIsIm9uZXJyb3IiLCJvbmRhdGEiLCJvbmRyYWluIiwib25jbG9zZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7O0lBS3FCQSxTOzs7eUJBQ05DLEksRUFBTUMsSSxFQUFvQjtBQUFBLFVBQWRDLE9BQWMsdUVBQUosRUFBSTtBQUNyQyxhQUFPLElBQUlILFNBQUosQ0FBYztBQUFFQyxRQUFBQSxJQUFJLEVBQUpBLElBQUY7QUFBUUMsUUFBQUEsSUFBSSxFQUFKQSxJQUFSO0FBQWNDLFFBQUFBLE9BQU8sRUFBUEE7QUFBZCxPQUFkLENBQVA7QUFDRDs7O0FBRUQsMkJBQXNDO0FBQUE7O0FBQUEsUUFBdkJGLElBQXVCLFFBQXZCQSxJQUF1QjtBQUFBLFFBQWpCQyxJQUFpQixRQUFqQkEsSUFBaUI7QUFBQSxRQUFYQyxPQUFXLFFBQVhBLE9BQVc7O0FBQUE7O0FBQ3BDLFNBQUtGLElBQUwsR0FBWUEsSUFBWjtBQUNBLFNBQUtDLElBQUwsR0FBWUEsSUFBWjtBQUNBLFNBQUtFLEdBQUwsR0FBVyxLQUFYO0FBQ0EsU0FBS0MsY0FBTCxHQUFzQixDQUF0QjtBQUNBLFNBQUtDLFVBQUwsR0FBa0IsWUFBbEI7QUFDQSxTQUFLQyxVQUFMLEdBQWtCLG1CQUFPLGFBQVAsRUFBc0IsWUFBdEIsRUFBb0NKLE9BQXBDLENBQWxCOztBQUVBLFFBQUksS0FBS0ksVUFBTCxLQUFvQixhQUF4QixFQUF1QztBQUNyQyxZQUFNLElBQUlDLEtBQUosQ0FBVSxrQ0FBVixDQUFOO0FBQ0Q7O0FBRUQsU0FBS0MsR0FBTCxHQUFXTixPQUFPLENBQUNPLEVBQW5CO0FBQ0EsU0FBS0MsT0FBTCxHQUFlLG1CQUFPLEtBQVAsRUFBYyxvQkFBZCxFQUFvQ1IsT0FBcEMsQ0FBZjtBQUNBLFNBQUtTLFlBQUws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QUFBLElBQUksRUFBSkE7QUFBaEIsV0FBYixDQUFoQjtBQUNBOztBQUNGLGFBQUssTUFBTDtBQUNFLGVBQUt3QyxNQUFMLElBQWUsS0FBS0EsTUFBTCxDQUFZO0FBQUVILFlBQUFBLE1BQU0sRUFBTkEsTUFBRjtBQUFVRCxZQUFBQSxJQUFJLEVBQUpBLElBQVY7QUFBZ0JwQyxZQUFBQSxJQUFJLEVBQUpBO0FBQWhCLFdBQVosQ0FBZjtBQUNBOztBQUNGLGFBQUssT0FBTDtBQUNFLGVBQUt5QyxPQUFMLElBQWdCLEtBQUtBLE9BQUwsQ0FBYTtBQUFFSixZQUFBQSxNQUFNLEVBQU5BLE1BQUY7QUFBVUQsWUFBQUEsSUFBSSxFQUFKQSxJQUFWO0FBQWdCcEMsWUFBQUEsSUFBSSxFQUFKQTtBQUFoQixXQUFiLENBQWhCO0FBQ0E7O0FBQ0YsYUFBSyxPQUFMO0FBQ0UsZUFBS25DLFVBQUwsR0FBa0IsUUFBbEI7QUFDQSxlQUFLNkUsT0FBTCxJQUFnQixLQUFLQSxPQUFMLENBQWE7QUFBRUwsWUFBQUEsTUFBTSxFQUFOQSxNQUFGO0FBQVVELFlBQUFBLElBQUksRUFBSkEsSUFBVjtBQUFnQnBDLFlBQUFBLElBQUksRUFBSkE7QUFBaEIsV0FBYixDQUFoQjtBQUNBO0FBakJKO0FBbUJEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcHJvcE9yIH0gZnJvbSAncmFtZGEnXG5pbXBvcnQgc2NoZWR1bGVJbk5leHRFdmVudExvb3AgZnJvbSAnLi90aW1lb3V0J1xuaW1wb3J0IGNyZWF0ZVRscyBmcm9tICcuL3Rscy11dGlscydcbmltcG9ydCB7XG4gIEVWRU5UX0lOQk9VTkQsIEVWRU5UX09VVEJPVU5ELFxuICBjcmVhdGVNZXNzYWdlXG59IGZyb20gJy4vd29ya2VyLXV0aWxzJ1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBUQ1BTb2NrZXQge1xuICBzdGF0aWMgb3BlbiAoaG9zdCwgcG9ydCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgcmV0dXJuIG5ldyBUQ1BTb2NrZXQoeyBob3N0LCBwb3J0LCBvcHRpb25zIH0pXG4gIH1cblxuICBjb25zdHJ1Y3RvciAoeyBob3N0LCBwb3J0LCBvcHRpb25zIH0pIHtcbiAgICB0aGlzLmhvc3QgPSBob3N0XG4gICAgdGhpcy5wb3J0ID0gcG9ydFxuICAgIHRoaXMuc3NsID0gZmFsc2VcbiAgICB0aGlzLmJ1ZmZlcmVkQW1vdW50ID0gMFxuICAgIHRoaXMucmVhZHlTdGF0ZSA9ICdjb25uZWN0aW5nJ1xuICAgIHRoaXMuYmluYXJ5VHlwZSA9IHByb3BPcignYXJyYXlidWZmZXInLCAnYmluYXJ5VHlwZScpKG9wdGlvbnMpXG5cbiAgICBpZiAodGhpcy5iaW5hcnlUeXBlICE9PSAnYXJyYXlidWZmZXInKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ09ubHkgYXJyYXlidWZmZXJzIGFyZSBzdXBwb3J0ZWQhJylcbiAgICB9XG5cbiAgICB0aGlzLl9jYSA9IG9wdGlvbnMuY2FcbiAgICB0aGlzLl91c2VUTFMgPSBwcm9wT3IoZmFsc2UsICd1c2VTZWN1cmVUcmFuc3BvcnQnKShvcHRpb25zKVxuICAgIHRoaXMuX3VzZVNUQVJUVExTID0gZmFsc2VcbiAgICB0aGlzLl9zb2NrZXRJZCA9IDBcbiAgICB0aGlzLl91c2VMZWdhY3lTb2NrZXQgPSBmYWxzZVxuICAgIHRoaXMuX3VzZUZvcmdlVGxzID0gZmFsc2VcblxuICAgIC8vIGhhbmRsZXMgd3JpdGVzIGR1cmluZyBzdGFydHRscyBoYW5kc2hha2UsIGNocm9tZSBzb2NrZXQgb25seVxuICAgIHRoaXMuX3N0YXJ0VGxzQnVmZmVyID0gW11cbiAgICB0aGlzLl9zdGFydFRsc0hhbmRzaGFrZUluUHJvZ3Jlc3MgPSBmYWxzZVxuXG4gICAgY2hyb21lLnJ1bnRpbWUuZ2V0UGxhdGZvcm1JbmZvKHBsYXRmb3JtSW5mbyA9PiB7XG4gICAgICBpZiAocGxhdGZvcm1JbmZvLm9zLmluZGV4T2YoJ2NvcmRvdmEnKSAhPT0gLTEpIHtcbiAgICAgICAgLy8gY2hyb21lLnNvY2tldHMudGNwLnNlY3VyZSBpcyBub3QgZnVuY3Rpb25hbCBvbiBjb3Jkb3ZhXG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9Nb2JpbGVDaHJvbWVBcHBzL21vYmlsZS1jaHJvbWUtYXBwcy9pc3N1ZXMvMjY5XG4gICAgICAgIHRoaXMuX3VzZUxlZ2FjeVNvY2tldCA9IGZhbHNlXG4gICAgICAgIHRoaXMuX3VzZUZvcmdlVGxzID0gdHJ1ZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fdXNlTGVnYWN5U29ja2V0ID0gdHJ1ZVxuICAgICAgICB0aGlzLl91c2VGb3JnZVRscyA9IGZhbHNlXG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLl91c2VMZWdhY3lTb2NrZXQpIHtcbiAgICAgICAgdGhpcy5fY3JlYXRlTGVnYWN5U29ja2V0KClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2NyZWF0ZVNvY2tldCgpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgc29ja2V0IHVzaW5nIHRoZSBkZXByZWNhdGVkIGNocm9tZS5zb2NrZXQgQVBJXG4gICAqL1xuICBfY3JlYXRlTGVnYWN5U29ja2V0ICgpIHtcbiAgICBjaHJvbWUuc29ja2V0LmNyZWF0ZSgndGNwJywge30sIGNyZWF0ZUluZm8gPT4ge1xuICAgICAgdGhpcy5fc29ja2V0SWQgPSBjcmVhdGVJbmZvLnNvY2tldElkXG5cbiAgICAgIGNocm9tZS5zb2NrZXQuY29ubmVjdCh0aGlzLl9zb2NrZXRJZCwgdGhpcy5ob3N0LCB0aGlzLnBvcnQsIHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXN1bHQgIT09IDApIHtcbiAgICAgICAgICB0aGlzLnJlYWR5U3RhdGUgPSAnY2xvc2VkJ1xuICAgICAgICAgIHRoaXMuX2VtaXQoJ2Vycm9yJywgY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fb25Tb2NrZXRDb25uZWN0ZWQoKVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBzb2NrZXQgdXNpbmcgY2hyb21lLnNvY2tldHMudGNwXG4gICAqL1xuICBfY3JlYXRlU29ja2V0ICgpIHtcbiAgICBjaHJvbWUuc29ja2V0cy50Y3AuY3JlYXRlKHt9LCBjcmVhdGVJbmZvID0+IHtcbiAgICAgIHRoaXMuX3NvY2tldElkID0gY3JlYXRlSW5mby5zb2NrZXRJZFxuXG4gICAgICAvLyByZWdpc3RlciBmb3IgZGF0YSBldmVudHMgb24gdGhlIHNvY2tldCBiZWZvcmUgY29ubmVjdGluZ1xuICAgICAgY2hyb21lLnNvY2tldHMudGNwLm9uUmVjZWl2ZS5hZGRMaXN0ZW5lcihyZWFkSW5mbyA9PiB7XG4gICAgICAgIGlmIChyZWFkSW5mby5zb2NrZXRJZCA9PT0gdGhpcy5fc29ja2V0SWQpIHtcbiAgICAgICAgICAvLyBwcm9jZXNzIHRoZSBkYXRhIGF2YWlsYWJsZSBvbiB0aGUgc29ja2V0XG4gICAgICAgICAgdGhpcy5fb25EYXRhKHJlYWRJbmZvLmRhdGEpXG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIC8vIHJlZ2lzdGVyIGZvciBkYXRhIGVycm9yIG9uIHRoZSBzb2NrZXQgYmVmb3JlIGNvbm5lY3RpbmdcbiAgICAgIGNocm9tZS5zb2NrZXRzLnRjcC5vblJlY2VpdmVFcnJvci5hZGRMaXN0ZW5lcihyZWFkSW5mbyA9PiB7XG4gICAgICAgIGlmIChyZWFkSW5mby5zb2NrZXRJZCA9PT0gdGhpcy5fc29ja2V0SWQpIHtcbiAgICAgICAgICAvLyBzb2NrZXQgY2xvc2VkIHJlbW90ZWx5IG9yIGJyb2tlblxuICAgICAgICAgIHRoaXMuY2xvc2UoKVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICBjaHJvbWUuc29ja2V0cy50Y3Auc2V0UGF1c2VkKHRoaXMuX3NvY2tldElkLCB0cnVlLCAoKSA9PiB7XG4gICAgICAgIGNocm9tZS5zb2NrZXRzLnRjcC5jb25uZWN0KHRoaXMuX3NvY2tldElkLCB0aGlzLmhvc3QsIHRoaXMucG9ydCwgcmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0IDwgMCkge1xuICAgICAgICAgICAgdGhpcy5yZWFkeVN0YXRlID0gJ2Nsb3NlZCdcbiAgICAgICAgICAgIHRoaXMuX2VtaXQoJ2Vycm9yJywgY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5fb25Tb2NrZXRDb25uZWN0ZWQoKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIEludm9rZWQgb25jZSBhIHNvY2tldCBoYXMgYmVlbiBjb25uZWN0ZWQ6XG4gICAqIC0gS2lja3Mgb2ZmIFRMUyBoYW5kc2hha2UsIGlmIG5lY2Vzc2FyeVxuICAgKiAtIFN0YXJ0cyByZWFkaW5nIGZyb20gbGVnYWN5IHNvY2tldCwgaWYgbmVjZXNzYXJ5XG4gICAqL1xuICBfb25Tb2NrZXRDb25uZWN0ZWQgKCkge1xuICAgIGNvbnN0IHJlYWQgPSAoKSA9PiB7XG4gICAgICBpZiAodGhpcy5fdXNlTGVnYWN5U29ja2V0KSB7XG4gICAgICAgIC8vIHRoZSB0bHMgaGFuZHNoYWtlIGlzIGRvbmUgbGV0J3Mgc3RhcnQgcmVhZGluZyBmcm9tIHRoZSBsZWdhY3kgc29ja2V0XG4gICAgICAgIHRoaXMuX3JlYWRMZWdhY3lTb2NrZXQoKVxuICAgICAgICB0aGlzLl9lbWl0KCdvcGVuJylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNocm9tZS5zb2NrZXRzLnRjcC5zZXRQYXVzZWQodGhpcy5fc29ja2V0SWQsIGZhbHNlLCAoKSA9PiB7XG4gICAgICAgICAgdGhpcy5fZW1pdCgnb3BlbicpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLl91c2VUTFMpIHtcbiAgICAgIHJldHVybiByZWFkKClcbiAgICB9XG5cbiAgICAvLyBkbyBhbiBpbW1lZGlhdGUgVExTIGhhbmRzaGFrZSBpZiB0aGlzLl91c2VUTFMgPT09IHRydWVcbiAgICB0aGlzLl91cGdyYWRlVG9TZWN1cmUoKCkgPT4geyByZWFkKCkgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGVzIHRoZSByb3VnaCBlZGdlcyBmb3IgZGlmZmVyZW5jZXMgYmV0d2VlbiBjaHJvbWUuc29ja2V0IGFuZCBjaHJvbWUuc29ja2V0cy50Y3BcbiAgICogZm9yIHVwZ3JhZGluZyB0byBhIFRMUyBjb25uZWN0aW9uIHdpdGggb3Igd2l0aG91dCBmb3JnZVxuICAgKi9cbiAgX3VwZ3JhZGVUb1NlY3VyZSAoY2FsbGJhY2sgPSAoKSA9PiB7fSkge1xuICAgIC8vIGludm9rZWQgYWZ0ZXIgY2hyb21lLnNvY2tldC5zZWN1cmUgb3IgY2hyb21lLnNvY2tldHMudGNwLnNlY3VyZSBoYXZlIGJlZW4gdXBncmFkZWRcbiAgICBjb25zdCBvblVwZ3JhZGVkID0gdGxzUmVzdWx0ID0+IHtcbiAgICAgIGlmICh0bHNSZXN1bHQgIT09IDApIHtcbiAgICAgICAgdGhpcy5fZW1pdCgnZXJyb3InLCBuZXcgRXJyb3IoJ1RMUyBoYW5kc2hha2UgZmFpbGVkLiBSZWFzb246ICcgKyBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSkpXG4gICAgICAgIHRoaXMuY2xvc2UoKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgdGhpcy5zc2wgPSB0cnVlXG5cbiAgICAgIC8vIGVtcHR5IHRoZSBidWZmZXJcbiAgICAgIHdoaWxlICh0aGlzLl9zdGFydFRsc0J1ZmZlci5sZW5ndGgpIHtcbiAgICAgICAgdGhpcy5zZW5kKHRoaXMuX3N0YXJ0VGxzQnVmZmVyLnNoaWZ0KCkpXG4gICAgICB9XG5cbiAgICAgIGNhbGxiYWNrKClcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuX3VzZUxlZ2FjeVNvY2tldCAmJiB0aGlzLnJlYWR5U3RhdGUgIT09ICdvcGVuJykge1xuICAgICAgLy8gdXNlIGNocm9tZS5zb2NrZXRzLnRjcC5zZWN1cmUgZm9yIFRMUywgbm90IGZvciBTVEFSVFRMUyFcbiAgICAgIC8vIHVzZSBmb3JnZSBvbmx5IGZvciBTVEFSVFRMU1xuICAgICAgdGhpcy5fdXNlRm9yZ2VUbHMgPSBmYWxzZVxuICAgICAgY2hyb21lLnNvY2tldHMudGNwLnNlY3VyZSh0aGlzLl9zb2NrZXRJZCwgb25VcGdyYWRlZClcbiAgICB9IGVsc2UgaWYgKHRoaXMuX3VzZUxlZ2FjeVNvY2tldCkge1xuICAgICAgY2hyb21lLnNvY2tldC5zZWN1cmUodGhpcy5fc29ja2V0SWQsIG9uVXBncmFkZWQpXG4gICAgfSBlbHNlIGlmICh0aGlzLl91c2VGb3JnZVRscykge1xuICAgICAgLy8gc2V0dXAgdGhlIGZvcmdlIHRscyBjbGllbnQgb3Igd2Vid29ya2VyIGFzIHRscyBmYWxsYmFja1xuICAgICAgY3JlYXRlVGxzKHRoaXMpXG4gICAgICBjYWxsYmFjaygpXG4gICAgfVxuICB9XG5cbiAgdXBncmFkZVRvU2VjdXJlICgpIHtcbiAgICBpZiAodGhpcy5zc2wgfHwgdGhpcy5fdXNlU1RBUlRUTFMpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRoaXMuX3VzZVNUQVJUVExTID0gdHJ1ZVxuICAgIHRoaXMuX3VwZ3JhZGVUb1NlY3VyZSgoKSA9PiB7XG4gICAgICBpZiAodGhpcy5fdXNlTGVnYWN5U29ja2V0KSB7XG4gICAgICAgIHRoaXMuX3JlYWRMZWdhY3lTb2NrZXQoKSAvLyB0bHMgaGFuZHNoYWtlIGlzIGRvbmUsIHJlc3RhcnQgcmVhZGluZ1xuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogUmVhZHMgZnJvbSBhIGxlZ2FjeSBjaHJvbWUuc29ja2V0LlxuICAgKi9cbiAgX3JlYWRMZWdhY3lTb2NrZXQgKCkge1xuICAgIGlmICh0aGlzLl9zb2NrZXRJZCA9PT0gMCkge1xuICAgICAgLy8gdGhlIHNvY2tldCBpcyBjbG9zZWQuIG9taXQgcmVhZCBhbmQgc3RvcCBmdXJ0aGVyIHJlYWRzXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBkb24ndCByZWFkIGZyb20gY2hyb21lLnNvY2tldCBpZiB3ZSBoYXZlIGNocm9tZS5zb2NrZXQuc2VjdXJlIGEgaGFuZHNoYWtlIGluIHByb2dyZXNzIVxuICAgIGlmICgodGhpcy5fdXNlU1RBUlRUTFMgfHwgdGhpcy5fdXNlVExTKSAmJiAhdGhpcy5zc2wpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNocm9tZS5zb2NrZXQucmVhZCh0aGlzLl9zb2NrZXRJZCwgcmVhZEluZm8gPT4ge1xuICAgICAgLy8gc29ja2V0IGNsb3NlZCByZW1vdGVseSBvciBicm9rZW5cbiAgICAgIGlmIChyZWFkSW5mby5yZXN1bHRDb2RlIDw9IDApIHtcbiAgICAgICAgdGhpcy5fc29ja2V0SWQgPSAwXG4gICAgICAgIHRoaXMuY2xvc2UoKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgLy8gcHJvY2VzcyB0aGUgZGF0YSBhdmFpbGFibGUgb24gdGhlIHNvY2tldFxuICAgICAgdGhpcy5fb25EYXRhKHJlYWRJbmZvLmRhdGEpXG5cbiAgICAgIC8vIFF1ZXVlIHRoZSBuZXh0IHJlYWQuXG4gICAgICAvLyBJZiBhIFNUQVJUVExTIGhhbmRzaGFrZSBtaWdodCBiZSB1cGNvbWluZywgcG9zdHBvbmUgdGhpcyBvbnRvXG4gICAgICAvLyB0aGUgdGFzayBxdWV1ZSBzbyB0aGUgSU1BUCBjbGllbnQgaGFzIGEgY2hhbmNlIHRvIGNhbGwgdXBncmFkZVRvU2VjdXJlO1xuICAgICAgLy8gd2l0aG91dCB0aGlzLCB3ZSBtaWdodCBlYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgaGFuZHNoYWtlLlxuICAgICAgLy8gSWYgd2UgYXJlIGFscmVhZHkgc2VjdXJlLCBqdXN0IGNhbGwgaXQgKGZvciBwZXJmb3JtYW5jZSkuXG4gICAgICBpZiAodGhpcy5zc2wpIHtcbiAgICAgICAgdGhpcy5fcmVhZExlZ2FjeVNvY2tldCgpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY2hlZHVsZUluTmV4dEV2ZW50TG9vcCgoKSA9PiB0aGlzLl9yZWFkTGVnYWN5U29ja2V0KCkpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBJbnZva2VkIHdoZW4gZGF0YSBoYXMgYmVlbiByZWFkIGZyb20gdGhlIHNvY2tldC4gSGFuZGxlcyBjYXNlcyB3aGVuIHRvIGZlZWRcbiAgICogdGhlIGRhdGEgYXZhaWxhYmxlIG9uIHRoZSBzb2NrZXQgdG8gZm9yZ2UuXG4gICAqXG4gICAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ9IGJ1ZmZlciBUaGUgYmluYXJ5IGRhdGEgcmVhZCBmcm9tIHRoZSBzb2NrZXRcbiAgICovXG4gIF9vbkRhdGEgKGJ1ZmZlcikge1xuICAgIGlmICgodGhpcy5fdXNlVExTIHx8IHRoaXMuX3VzZVNUQVJUVExTKSAmJiB0aGlzLl91c2VGb3JnZVRscykge1xuICAgICAgLy8gZmVlZCB0aGUgZGF0YSB0byB0aGUgdGxzIGNsaWVudFxuICAgICAgaWYgKHRoaXMuX3Rsc1dvcmtlcikge1xuICAgICAgICB0aGlzLl90bHNXb3JrZXIucG9zdE1lc3NhZ2UoY3JlYXRlTWVzc2FnZShFVkVOVF9JTkJPVU5ELCBidWZmZXIpLCBbYnVmZmVyXSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX3Rscy5wcm9jZXNzSW5ib3VuZChidWZmZXIpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIGVtaXQgZGF0YSBldmVudFxuICAgICAgdGhpcy5fZW1pdCgnZGF0YScsIGJ1ZmZlcilcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2xvc2VzIHRoZSBzb2NrZXRcbiAgICogQHJldHVybiB7W3R5cGVdfSBbZGVzY3JpcHRpb25dXG4gICAqL1xuICBjbG9zZSAoKSB7XG4gICAgdGhpcy5yZWFkeVN0YXRlID0gJ2Nsb3NpbmcnXG5cbiAgICBpZiAodGhpcy5fc29ja2V0SWQgIT09IDApIHtcbiAgICAgIGlmICh0aGlzLl91c2VMZWdhY3lTb2NrZXQpIHtcbiAgICAgICAgLy8gY2xvc2UgbGVnYWN5IHNvY2tldFxuICAgICAgICBjaHJvbWUuc29ja2V0LmRpc2Nvbm5lY3QodGhpcy5fc29ja2V0SWQpXG4gICAgICAgIGNocm9tZS5zb2NrZXQuZGVzdHJveSh0aGlzLl9zb2NrZXRJZClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGNsb3NlIHNvY2tldFxuICAgICAgICBjaHJvbWUuc29ja2V0cy50Y3AuZGlzY29ubmVjdCh0aGlzLl9zb2NrZXRJZClcbiAgICAgIH1cblxuICAgICAgdGhpcy5fc29ja2V0SWQgPSAwXG4gICAgfVxuXG4gICAgLy8gdGVybWluYXRlIHRoZSB0bHMgd29ya2VyXG4gICAgaWYgKHRoaXMuX3Rsc1dvcmtlcikge1xuICAgICAgdGhpcy5fdGxzV29ya2VyLnRlcm1pbmF0ZSgpXG4gICAgICB0aGlzLl90bHNXb3JrZXIgPSB1bmRlZmluZWRcbiAgICB9XG5cbiAgICB0aGlzLl9lbWl0KCdjbG9zZScpXG4gIH1cblxuICBzZW5kIChidWZmZXIpIHtcbiAgICBpZiAoIXRoaXMuX3VzZUZvcmdlVGxzICYmIHRoaXMuX3VzZVNUQVJUVExTICYmICF0aGlzLnNzbCkge1xuICAgICAgLy8gYnVmZmVyIHRoZSB1bnByZXBhcmVkIGRhdGEgdW50aWwgY2hyb21lLnNvY2tldChzLnRjcCkgaGFuZHNoYWtlIGlzIGRvbmVcbiAgICAgIHRoaXMuX3N0YXJ0VGxzQnVmZmVyLnB1c2goYnVmZmVyKVxuICAgIH0gZWxzZSBpZiAodGhpcy5fdXNlRm9yZ2VUbHMgJiYgKHRoaXMuX3VzZVRMUyB8fCB0aGlzLl91c2VTVEFSVFRMUykpIHtcbiAgICAgIC8vIGdpdmUgYnVmZmVyIHRvIGZvcmdlIHRvIGJlIHByZXBhcmVkIGZvciB0bHNcbiAgICAgIGlmICh0aGlzLl90bHNXb3JrZXIpIHtcbiAgICAgICAgdGhpcy5fdGxzV29ya2VyLnBvc3RNZXNzYWdlKGNyZWF0ZU1lc3NhZ2UoRVZFTlRfT1VUQk9VTkQsIGJ1ZmZlciksIFtidWZmZXJdKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fdGxzLnByZXBhcmVPdXRib3VuZChidWZmZXIpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHNlbmQgdGhlIGFycmF5YnVmZmVyXG4gICAgICB0aGlzLl9zZW5kKGJ1ZmZlcilcbiAgICB9XG4gIH1cblxuICBfc2VuZCAoZGF0YSkge1xuICAgIGlmICh0aGlzLl9zb2NrZXRJZCA9PT0gMCkge1xuICAgICAgLy8gdGhlIHNvY2tldCBpcyBjbG9zZWQuXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAodGhpcy5fdXNlTGVnYWN5U29ja2V0KSB7XG4gICAgICBjaHJvbWUuc29ja2V0LndyaXRlKHRoaXMuX3NvY2tldElkLCBkYXRhLCB3cml0ZUluZm8gPT4ge1xuICAgICAgICBpZiAod3JpdGVJbmZvLmJ5dGVzV3JpdHRlbiA8IDAgJiYgdGhpcy5fc29ja2V0SWQgIT09IDApIHtcbiAgICAgICAgICAvLyBpZiB0aGUgc29ja2V0IGlzIGFscmVhZHkgMCwgaXQgaGFzIGFscmVhZHkgYmVlbiBjbG9zZWQuIG5vIG5lZWQgdG8gYWxlcnQgdGhlbi4uLlxuICAgICAgICAgIHRoaXMuX2VtaXQoJ2Vycm9yJywgbmV3IEVycm9yKCdDb3VsZCBub3Qgd3JpdGUgJyArIGRhdGEuYnl0ZUxlbmd0aCArICcgYnl0ZXMgdG8gc29ja2V0ICcgKyB0aGlzLl9zb2NrZXRJZCArICcuIENocm9tZSBlcnJvciBjb2RlOiAnICsgd3JpdGVJbmZvLmJ5dGVzV3JpdHRlbikpXG4gICAgICAgICAgdGhpcy5fc29ja2V0SWQgPSAwXG4gICAgICAgICAgdGhpcy5jbG9zZSgpXG5cbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2VtaXQoJ2RyYWluJylcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIGNocm9tZS5zb2NrZXRzLnRjcC5zZW5kKHRoaXMuX3NvY2tldElkLCBkYXRhLCBzZW5kSW5mbyA9PiB7XG4gICAgICAgIGlmIChzZW5kSW5mby5ieXRlc1NlbnQgPCAwICYmIHRoaXMuX3NvY2tldElkICE9PSAwKSB7XG4gICAgICAgICAgLy8gaWYgdGhlIHNvY2tldCBpcyBhbHJlYWR5IDAsIGl0IGhhcyBhbHJlYWR5IGJlZW4gY2xvc2VkLiBubyBuZWVkIHRvIGFsZXJ0IHRoZW4uLi5cbiAgICAgICAgICB0aGlzLl9lbWl0KCdlcnJvcicsIG5ldyBFcnJvcignQ291bGQgbm90IHdyaXRlICcgKyBkYXRhLmJ5dGVMZW5ndGggKyAnIGJ5dGVzIHRvIHNvY2tldCAnICsgdGhpcy5fc29ja2V0SWQgKyAnLiBDaHJvbWUgZXJyb3IgY29kZTogJyArIHNlbmRJbmZvLmJ5dGVzU2VudCkpXG4gICAgICAgICAgdGhpcy5jbG9zZSgpXG5cbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2VtaXQoJ2RyYWluJylcbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgX2VtaXQgKHR5cGUsIGRhdGEpIHtcbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzXG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlICdvcGVuJzpcbiAgICAgICAgdGhpcy5yZWFkeVN0YXRlID0gJ29wZW4nXG4gICAgICAgIHRoaXMub25vcGVuICYmIHRoaXMub25vcGVuKHsgdGFyZ2V0LCB0eXBlLCBkYXRhIH0pXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdlcnJvcic6XG4gICAgICAgIHRoaXMub25lcnJvciAmJiB0aGlzLm9uZXJyb3IoeyB0YXJnZXQsIHR5cGUsIGRhdGEgfSlcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2RhdGEnOlxuICAgICAgICB0aGlzLm9uZGF0YSAmJiB0aGlzLm9uZGF0YSh7IHRhcmdldCwgdHlwZSwgZGF0YSB9KVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnZHJhaW4nOlxuICAgICAgICB0aGlzLm9uZHJhaW4gJiYgdGhpcy5vbmRyYWluKHsgdGFyZ2V0LCB0eXBlLCBkYXRhIH0pXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdjbG9zZSc6XG4gICAgICAgIHRoaXMucmVhZHlTdGF0ZSA9ICdjbG9zZWQnXG4gICAgICAgIHRoaXMub25jbG9zZSAmJiB0aGlzLm9uY2xvc2UoeyB0YXJnZXQsIHR5cGUsIGRhdGEgfSlcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbn1cbiJdfQ==