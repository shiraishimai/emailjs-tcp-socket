"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _ramda = require("ramda");

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

    this.host = new Windows.Networking.HostName(host); // NB! HostName constructor will throw on invalid input

    this.port = port;
    this.ssl = (0, _ramda.propOr)(false, 'useSecureTransport')(options);
    this.bufferedAmount = 0;
    this.readyState = 'connecting';
    this.binaryType = (0, _ramda.propOr)('arraybuffer', 'binaryType')(options);

    if (this.binaryType !== 'arraybuffer') {
      throw new Error('Only arraybuffers are supported!');
    }

    this._socket = new Windows.Networking.Sockets.StreamSocket();
    this._socket.control.keepAlive = true;
    this._socket.control.noDelay = true;
    this._dataReader = null;
    this._dataWriter = null; // set to true if upgrading with STARTTLS

    this._upgrading = false; // cache all client.send calls to this array if currently upgrading

    this._upgradeCache = []; // initial socket type. default is 'plainSocket' (no encryption applied)
    // 'tls12' supports the TLS 1.2, TLS 1.1 and TLS 1.0 protocols but no SSL

    this._protectionLevel = Windows.Networking.Sockets.SocketProtectionLevel[this.ssl ? 'tls12' : 'plainSocket']; // Initiate connection to destination

    this._socket.connectAsync(this.host, this.port, this._protectionLevel).done(function () {
      _this._setStreamHandlers();

      _this._emit('open');
    }, function (e) {
      return _this._emit('error', e);
    });
  }
  /**
   * Initiate Reader and Writer interfaces for the socket
   */


  _createClass(TCPSocket, [{
    key: "_setStreamHandlers",
    value: function _setStreamHandlers() {
      this._dataReader = new Windows.Storage.Streams.DataReader(this._socket.inputStream);
      this._dataReader.inputStreamOptions = Windows.Storage.Streams.InputStreamOptions.partial; // setup writer

      this._dataWriter = new Windows.Storage.Streams.DataWriter(this._socket.outputStream); // start byte reader loop

      this._read();
    }
    /**
     * Emit an error and close socket
     *
     * @param {Error} error Error object
     */

  }, {
    key: "_errorHandler",
    value: function _errorHandler(error) {
      // we ignore errors after close has been called, since all aborted operations
      // will emit their error handlers
      // this will also apply to starttls as a read call is aborted before upgrading the socket
      if (this._upgrading || this.readyState !== 'closing' && this.readyState !== 'closed') {
        this._emit('error', error);

        this.close();
      }
    }
    /**
     * Read available bytes from the socket. This method is recursive  once it ends, it restarts itthis
     */

  }, {
    key: "_read",
    value: function _read() {
      var _this2 = this;

      if (this._upgrading || this.readyState !== 'open' && this.readyState !== 'connecting') {
        return; // do nothing if socket not open
      } // Read up to 4096 bytes from the socket. This is not a fixed number (the mode was set
      // with inputStreamOptions.partial property), so it might return with a smaller
      // amount of bytes.


      this._dataReader.loadAsync(4096).done(function (availableByteCount) {
        if (!availableByteCount) {
          // no bytes available for reading, restart the reading process
          return setImmediate(_this2._read.bind(_this2));
        } // we need an Uint8Array that gets filled with the bytes from the buffer


        var data = new Uint8Array(availableByteCount);

        _this2._dataReader.readBytes(data); // data argument gets filled with the bytes


        _this2._emit('data', data.buffer); // restart reading process


        return setImmediate(_this2._read.bind(_this2));
      }, function (e) {
        return _this2._errorHandler(e);
      });
    } //
    // API
    //

  }, {
    key: "close",
    value: function close() {
      this.readyState = 'closing';

      try {
        this._socket.close();
      } catch (E) {
        this._emit('error', E);
      }

      setImmediate(this._emit.bind(this, 'close'));
    }
  }, {
    key: "send",
    value: function send(data) {
      var _this3 = this;

      if (this.readyState !== 'open') {
        return;
      }

      if (this._upgrading) {
        this._upgradeCache.push(data);

        return;
      } // Write bytes to buffer


      this._dataWriter.writeBytes(data); // Emit buffer contents


      this._dataWriter.storeAsync().done(function () {
        return _this3._emit('drain');
      }, function (e) {
        return _this3._errorHandler(e);
      });
    }
  }, {
    key: "upgradeToSecure",
    value: function upgradeToSecure() {
      var _this4 = this;

      if (this.ssl || this._upgrading) return;
      this._upgrading = true;

      try {
        // release current input stream. this is required to allow socket upgrade
        // write stream is not released as all send calls are cached from this point onwards
        // and not passed to socket until the socket is upgraded
        this._dataReader.detachStream();
      } catch (E) {} // update protection level


      this._protectionLevel = Windows.Networking.Sockets.SocketProtectionLevel.tls12;

      this._socket.upgradeToSslAsync(this._protectionLevel, this.host).done(function () {
        _this4._upgrading = false;
        _this4.ssl = true; // secured connection from now on

        _this4._dataReader = new Windows.Storage.Streams.DataReader(_this4._socket.inputStream);
        _this4._dataReader.inputStreamOptions = Windows.Storage.Streams.InputStreamOptions.partial;

        _this4._read(); // emit all cached requests


        while (_this4._upgradeCache.length) {
          var data = _this4._upgradeCache.shift();

          _this4.send(data);
        }
      }, function (e) {
        _this4._upgrading = false;

        _this4._errorHandler(e);
      });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy93aW5kb3dzLXNvY2tldC5qcyJdLCJuYW1lcyI6WyJUQ1BTb2NrZXQiLCJob3N0IiwicG9ydCIsIm9wdGlvbnMiLCJXaW5kb3dzIiwiTmV0d29ya2luZyIsIkhvc3ROYW1lIiwic3NsIiwiYnVmZmVyZWRBbW91bnQiLCJyZWFkeVN0YXRlIiwiYmluYXJ5VHlwZSIsIkVycm9yIiwiX3NvY2tldCIsIlNvY2tldHMiLCJTdHJlYW1Tb2NrZXQiLCJjb250cm9sIiwia2VlcEFsaXZlIiwibm9EZWxheSIsIl9kYXRhUmVhZGVyIiwiX2RhdGFXcml0ZXIiLCJfdXBncmFkaW5nIiwiX3VwZ3JhZGVDYWNoZSIsIl9wcm90ZWN0aW9uTGV2ZWwiLCJTb2NrZXRQcm90ZWN0aW9uTGV2ZWwiLCJjb25uZWN0QXN5bmMiLCJkb25lIiwiX3NldFN0cmVhbUhhbmRsZXJzIiwiX2VtaXQiLCJlIiwiU3RvcmFnZSIsIlN0cmVhbXMiLCJEYXRhUmVhZGVyIiwiaW5wdXRTdHJlYW0iLCJpbnB1dFN0cmVhbU9wdGlvbnMiLCJJbnB1dFN0cmVhbU9wdGlvbnMiLCJwYXJ0aWFsIiwiRGF0YVdyaXRlciIsIm91dHB1dFN0cmVhbSIsIl9yZWFkIiwiZXJyb3IiLCJjbG9zZSIsImxvYWRBc3luYyIsImF2YWlsYWJsZUJ5dGVDb3VudCIsInNldEltbWVkaWF0ZSIsImJpbmQiLCJkYXRhIiwiVWludDhBcnJheSIsInJlYWRCeXRlcyIsImJ1ZmZlciIsIl9lcnJvckhhbmRsZXIiLCJFIiwicHVzaCIsIndyaXRlQnl0ZXMiLCJzdG9yZUFzeW5jIiwiZGV0YWNoU3RyZWFtIiwidGxzMTIiLCJ1cGdyYWRlVG9Tc2xBc3luYyIsImxlbmd0aCIsInNoaWZ0Iiwic2VuZCIsInR5cGUiLCJ0YXJnZXQiLCJvbm9wZW4iLCJvbmVycm9yIiwib25kYXRhIiwib25kcmFpbiIsIm9uY2xvc2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7Ozs7Ozs7SUFFcUJBLFM7Ozt5QkFDTkMsSSxFQUFNQyxJ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WUFBQUEsTUFBTSxFQUFOQSxNQUFGO0FBQVVELFlBQUFBLElBQUksRUFBSkEsSUFBVjtBQUFnQmYsWUFBQUEsSUFBSSxFQUFKQTtBQUFoQixXQUFaLENBQWY7QUFDQTs7QUFDRixhQUFLLE9BQUw7QUFDRSxlQUFLa0IsT0FBTCxJQUFnQixLQUFLQSxPQUFMLENBQWE7QUFBRUYsWUFBQUEsTUFBTSxFQUFOQSxNQUFGO0FBQVVELFlBQUFBLElBQUksRUFBSkEsSUFBVjtBQUFnQmYsWUFBQUEsSUFBSSxFQUFKQTtBQUFoQixXQUFiLENBQWhCO0FBQ0E7O0FBQ0YsYUFBSyxNQUFMO0FBQ0UsZUFBS21CLE1BQUwsSUFBZSxLQUFLQSxNQUFMLENBQVk7QUFBRUgsWUFBQUEsTUFBTSxFQUFOQSxNQUFGO0FBQVVELFlBQUFBLElBQUksRUFBSkEsSUFBVjtBQUFnQmYsWUFBQUEsSUFBSSxFQUFKQTtBQUFoQixXQUFaLENBQWY7QUFDQTs7QUFDRixhQUFLLE9BQUw7QUFDRSxlQUFLb0IsT0FBTCxJQUFnQixLQUFLQSxPQUFMLENBQWE7QUFBRUosWUFBQUEsTUFBTSxFQUFOQSxNQUFGO0FBQVVELFlBQUFBLElBQUksRUFBSkEsSUFBVjtBQUFnQmYsWUFBQUEsSUFBSSxFQUFKQTtBQUFoQixXQUFiLENBQWhCO0FBQ0E7O0FBQ0YsYUFBSyxPQUFMO0FBQ0UsZUFBS3BDLFVBQUwsR0FBa0IsUUFBbEI7QUFDQSxlQUFLeUQsT0FBTCxJQUFnQixLQUFLQSxPQUFMLENBQWE7QUFBRUwsWUFBQUEsTUFBTSxFQUFOQSxNQUFGO0FBQVVELFlBQUFBLElBQUksRUFBSkEsSUFBVjtBQUFnQmYsWUFBQUEsSUFBSSxFQUFKQTtBQUFoQixXQUFiLENBQWhCO0FBQ0E7QUFqQko7QUFtQkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBwcm9wT3IgfSBmcm9tICdyYW1kYSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVENQU29ja2V0IHtcbiAgc3RhdGljIG9wZW4gKGhvc3QsIHBvcnQsIG9wdGlvbnMgPSB7fSkge1xuICAgIHJldHVybiBuZXcgVENQU29ja2V0KHsgaG9zdCwgcG9ydCwgb3B0aW9ucyB9KVxuICB9XG5cbiAgY29uc3RydWN0b3IgKHsgaG9zdCwgcG9ydCwgb3B0aW9ucyB9KSB7XG4gICAgdGhpcy5ob3N0ID0gbmV3IFdpbmRvd3MuTmV0d29ya2luZy5Ib3N0TmFtZShob3N0KSAvLyBOQiEgSG9zdE5hbWUgY29uc3RydWN0b3Igd2lsbCB0aHJvdyBvbiBpbnZhbGlkIGlucHV0XG4gICAgdGhpcy5wb3J0ID0gcG9ydFxuICAgIHRoaXMuc3NsID0gcHJvcE9yKGZhbHNlLCAndXNlU2VjdXJlVHJhbnNwb3J0Jykob3B0aW9ucylcbiAgICB0aGlzLmJ1ZmZlcmVkQW1vdW50ID0gMFxuICAgIHRoaXMucmVhZHlTdGF0ZSA9ICdjb25uZWN0aW5nJ1xuICAgIHRoaXMuYmluYXJ5VHlwZSA9IHByb3BPcignYXJyYXlidWZmZXInLCAnYmluYXJ5VHlwZScpKG9wdGlvbnMpXG5cbiAgICBpZiAodGhpcy5iaW5hcnlUeXBlICE9PSAnYXJyYXlidWZmZXInKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ09ubHkgYXJyYXlidWZmZXJzIGFyZSBzdXBwb3J0ZWQhJylcbiAgICB9XG5cbiAgICB0aGlzLl9zb2NrZXQgPSBuZXcgV2luZG93cy5OZXR3b3JraW5nLlNvY2tldHMuU3RyZWFtU29ja2V0KClcblxuICAgIHRoaXMuX3NvY2tldC5jb250cm9sLmtlZXBBbGl2ZSA9IHRydWVcbiAgICB0aGlzLl9zb2NrZXQuY29udHJvbC5ub0RlbGF5ID0gdHJ1ZVxuXG4gICAgdGhpcy5fZGF0YVJlYWRlciA9IG51bGxcbiAgICB0aGlzLl9kYXRhV3JpdGVyID0gbnVsbFxuXG4gICAgLy8gc2V0IHRvIHRydWUgaWYgdXBncmFkaW5nIHdpdGggU1RBUlRUTFNcbiAgICB0aGlzLl91cGdyYWRpbmcgPSBmYWxzZVxuXG4gICAgLy8gY2FjaGUgYWxsIGNsaWVudC5zZW5kIGNhbGxzIHRvIHRoaXMgYXJyYXkgaWYgY3VycmVudGx5IHVwZ3JhZGluZ1xuICAgIHRoaXMuX3VwZ3JhZGVDYWNoZSA9IFtdXG5cbiAgICAvLyBpbml0aWFsIHNvY2tldCB0eXBlLiBkZWZhdWx0IGlzICdwbGFpblNvY2tldCcgKG5vIGVuY3J5cHRpb24gYXBwbGllZClcbiAgICAvLyAndGxzMTInIHN1cHBvcnRzIHRoZSBUTFMgMS4yLCBUTFMgMS4xIGFuZCBUTFMgMS4wIHByb3RvY29scyBidXQgbm8gU1NMXG4gICAgdGhpcy5fcHJvdGVjdGlvbkxldmVsID0gV2luZG93cy5OZXR3b3JraW5nLlNvY2tldHMuU29ja2V0UHJvdGVjdGlvbkxldmVsW3RoaXMuc3NsID8gJ3RsczEyJyA6ICdwbGFpblNvY2tldCddXG5cbiAgICAvLyBJbml0aWF0ZSBjb25uZWN0aW9uIHRvIGRlc3RpbmF0aW9uXG4gICAgdGhpcy5fc29ja2V0XG4gICAgICAuY29ubmVjdEFzeW5jKHRoaXMuaG9zdCwgdGhpcy5wb3J0LCB0aGlzLl9wcm90ZWN0aW9uTGV2ZWwpXG4gICAgICAuZG9uZSgoKSA9PiB7XG4gICAgICAgIHRoaXMuX3NldFN0cmVhbUhhbmRsZXJzKClcbiAgICAgICAgdGhpcy5fZW1pdCgnb3BlbicpXG4gICAgICB9LCBlID0+IHRoaXMuX2VtaXQoJ2Vycm9yJywgZSkpXG4gIH1cblxuICAvKipcbiAgICogSW5pdGlhdGUgUmVhZGVyIGFuZCBXcml0ZXIgaW50ZXJmYWNlcyBmb3IgdGhlIHNvY2tldFxuICAgKi9cbiAgX3NldFN0cmVhbUhhbmRsZXJzICgpIHtcbiAgICB0aGlzLl9kYXRhUmVhZGVyID0gbmV3IFdpbmRvd3MuU3RvcmFnZS5TdHJlYW1zLkRhdGFSZWFkZXIodGhpcy5fc29ja2V0LmlucHV0U3RyZWFtKVxuICAgIHRoaXMuX2RhdGFSZWFkZXIuaW5wdXRTdHJlYW1PcHRpb25zID0gV2luZG93cy5TdG9yYWdlLlN0cmVhbXMuSW5wdXRTdHJlYW1PcHRpb25zLnBhcnRpYWxcblxuICAgIC8vIHNldHVwIHdyaXRlclxuICAgIHRoaXMuX2RhdGFXcml0ZXIgPSBuZXcgV2luZG93cy5TdG9yYWdlLlN0cmVhbXMuRGF0YVdyaXRlcih0aGlzLl9zb2NrZXQub3V0cHV0U3RyZWFtKVxuXG4gICAgLy8gc3RhcnQgYnl0ZSByZWFkZXIgbG9vcFxuICAgIHRoaXMuX3JlYWQoKVxuICB9XG5cbiAgLyoqXG4gICAqIEVtaXQgYW4gZXJyb3IgYW5kIGNsb3NlIHNvY2tldFxuICAgKlxuICAgKiBAcGFyYW0ge0Vycm9yfSBlcnJvciBFcnJvciBvYmplY3RcbiAgICovXG4gIF9lcnJvckhhbmRsZXIgKGVycm9yKSB7XG4gICAgLy8gd2UgaWdub3JlIGVycm9ycyBhZnRlciBjbG9zZSBoYXMgYmVlbiBjYWxsZWQsIHNpbmNlIGFsbCBhYm9ydGVkIG9wZXJhdGlvbnNcbiAgICAvLyB3aWxsIGVtaXQgdGhlaXIgZXJyb3IgaGFuZGxlcnNcbiAgICAvLyB0aGlzIHdpbGwgYWxzbyBhcHBseSB0byBzdGFydHRscyBhcyBhIHJlYWQgY2FsbCBpcyBhYm9ydGVkIGJlZm9yZSB1cGdyYWRpbmcgdGhlIHNvY2tldFxuICAgIGlmICh0aGlzLl91cGdyYWRpbmcgfHwgKHRoaXMucmVhZHlTdGF0ZSAhPT0gJ2Nsb3NpbmcnICYmIHRoaXMucmVhZHlTdGF0ZSAhPT0gJ2Nsb3NlZCcpKSB7XG4gICAgICB0aGlzLl9lbWl0KCdlcnJvcicsIGVycm9yKVxuICAgICAgdGhpcy5jbG9zZSgpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlYWQgYXZhaWxhYmxlIGJ5dGVzIGZyb20gdGhlIHNvY2tldC4gVGhpcyBtZXRob2QgaXMgcmVjdXJzaXZlICBvbmNlIGl0IGVuZHMsIGl0IHJlc3RhcnRzIGl0dGhpc1xuICAgKi9cbiAgX3JlYWQgKCkge1xuICAgIGlmICh0aGlzLl91cGdyYWRpbmcgfHwgKHRoaXMucmVhZHlTdGF0ZSAhPT0gJ29wZW4nICYmIHRoaXMucmVhZHlTdGF0ZSAhPT0gJ2Nvbm5lY3RpbmcnKSkge1xuICAgICAgcmV0dXJuIC8vIGRvIG5vdGhpbmcgaWYgc29ja2V0IG5vdCBvcGVuXG4gICAgfVxuXG4gICAgLy8gUmVhZCB1cCB0byA0MDk2IGJ5dGVzIGZyb20gdGhlIHNvY2tldC4gVGhpcyBpcyBub3QgYSBmaXhlZCBudW1iZXIgKHRoZSBtb2RlIHdhcyBzZXRcbiAgICAvLyB3aXRoIGlucHV0U3RyZWFtT3B0aW9ucy5wYXJ0aWFsIHByb3BlcnR5KSwgc28gaXQgbWlnaHQgcmV0dXJuIHdpdGggYSBzbWFsbGVyXG4gICAgLy8gYW1vdW50IG9mIGJ5dGVzLlxuICAgIHRoaXMuX2RhdGFSZWFkZXIubG9hZEFzeW5jKDQwOTYpLmRvbmUoYXZhaWxhYmxlQnl0ZUNvdW50ID0+IHtcbiAgICAgIGlmICghYXZhaWxhYmxlQnl0ZUNvdW50KSB7XG4gICAgICAgIC8vIG5vIGJ5dGVzIGF2YWlsYWJsZSBmb3IgcmVhZGluZywgcmVzdGFydCB0aGUgcmVhZGluZyBwcm9jZXNzXG4gICAgICAgIHJldHVybiBzZXRJbW1lZGlhdGUodGhpcy5fcmVhZC5iaW5kKHRoaXMpKVxuICAgICAgfVxuXG4gICAgICAvLyB3ZSBuZWVkIGFuIFVpbnQ4QXJyYXkgdGhhdCBnZXRzIGZpbGxlZCB3aXRoIHRoZSBieXRlcyBmcm9tIHRoZSBidWZmZXJcbiAgICAgIHZhciBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoYXZhaWxhYmxlQnl0ZUNvdW50KVxuICAgICAgdGhpcy5fZGF0YVJlYWRlci5yZWFkQnl0ZXMoZGF0YSkgLy8gZGF0YSBhcmd1bWVudCBnZXRzIGZpbGxlZCB3aXRoIHRoZSBieXRlc1xuXG4gICAgICB0aGlzLl9lbWl0KCdkYXRhJywgZGF0YS5idWZmZXIpXG5cbiAgICAgIC8vIHJlc3RhcnQgcmVhZGluZyBwcm9jZXNzXG4gICAgICByZXR1cm4gc2V0SW1tZWRpYXRlKHRoaXMuX3JlYWQuYmluZCh0aGlzKSlcbiAgICB9LCBlID0+IHRoaXMuX2Vycm9ySGFuZGxlcihlKSlcbiAgfVxuXG4gIC8vXG4gIC8vIEFQSVxuICAvL1xuXG4gIGNsb3NlICgpIHtcbiAgICB0aGlzLnJlYWR5U3RhdGUgPSAnY2xvc2luZydcblxuICAgIHRyeSB7XG4gICAgICB0aGlzLl9zb2NrZXQuY2xvc2UoKVxuICAgIH0gY2F0Y2ggKEUpIHtcbiAgICAgIHRoaXMuX2VtaXQoJ2Vycm9yJywgRSlcbiAgICB9XG5cbiAgICBzZXRJbW1lZGlhdGUodGhpcy5fZW1pdC5iaW5kKHRoaXMsICdjbG9zZScpKVxuICB9XG5cbiAgc2VuZCAoZGF0YSkge1xuICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgIT09ICdvcGVuJykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3VwZ3JhZGluZykge1xuICAgICAgdGhpcy5fdXBncmFkZUNhY2hlLnB1c2goZGF0YSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIFdyaXRlIGJ5dGVzIHRvIGJ1ZmZlclxuICAgIHRoaXMuX2RhdGFXcml0ZXIud3JpdGVCeXRlcyhkYXRhKVxuXG4gICAgLy8gRW1pdCBidWZmZXIgY29udGVudHNcbiAgICB0aGlzLl9kYXRhV3JpdGVyLnN0b3JlQXN5bmMoKS5kb25lKCgpID0+IHRoaXMuX2VtaXQoJ2RyYWluJyksIChlKSA9PiB0aGlzLl9lcnJvckhhbmRsZXIoZSkpXG4gIH1cblxuICB1cGdyYWRlVG9TZWN1cmUgKCkge1xuICAgIGlmICh0aGlzLnNzbCB8fCB0aGlzLl91cGdyYWRpbmcpIHJldHVyblxuXG4gICAgdGhpcy5fdXBncmFkaW5nID0gdHJ1ZVxuICAgIHRyeSB7XG4gICAgICAvLyByZWxlYXNlIGN1cnJlbnQgaW5wdXQgc3RyZWFtLiB0aGlzIGlzIHJlcXVpcmVkIHRvIGFsbG93IHNvY2tldCB1cGdyYWRlXG4gICAgICAvLyB3cml0ZSBzdHJlYW0gaXMgbm90IHJlbGVhc2VkIGFzIGFsbCBzZW5kIGNhbGxzIGFyZSBjYWNoZWQgZnJvbSB0aGlzIHBvaW50IG9ud2FyZHNcbiAgICAgIC8vIGFuZCBub3QgcGFzc2VkIHRvIHNvY2tldCB1bnRpbCB0aGUgc29ja2V0IGlzIHVwZ3JhZGVkXG4gICAgICB0aGlzLl9kYXRhUmVhZGVyLmRldGFjaFN0cmVhbSgpXG4gICAgfSBjYXRjaCAoRSkgeyB9XG5cbiAgICAvLyB1cGRhdGUgcHJvdGVjdGlvbiBsZXZlbFxuICAgIHRoaXMuX3Byb3RlY3Rpb25MZXZlbCA9IFdpbmRvd3MuTmV0d29ya2luZy5Tb2NrZXRzLlNvY2tldFByb3RlY3Rpb25MZXZlbC50bHMxMlxuXG4gICAgdGhpcy5fc29ja2V0LnVwZ3JhZGVUb1NzbEFzeW5jKHRoaXMuX3Byb3RlY3Rpb25MZXZlbCwgdGhpcy5ob3N0KS5kb25lKFxuICAgICAgKCkgPT4ge1xuICAgICAgICB0aGlzLl91cGdyYWRpbmcgPSBmYWxzZVxuICAgICAgICB0aGlzLnNzbCA9IHRydWUgLy8gc2VjdXJlZCBjb25uZWN0aW9uIGZyb20gbm93IG9uXG5cbiAgICAgICAgdGhpcy5fZGF0YVJlYWRlciA9IG5ldyBXaW5kb3dzLlN0b3JhZ2UuU3RyZWFtcy5EYXRhUmVhZGVyKHRoaXMuX3NvY2tldC5pbnB1dFN0cmVhbSlcbiAgICAgICAgdGhpcy5fZGF0YVJlYWRlci5pbnB1dFN0cmVhbU9wdGlvbnMgPSBXaW5kb3dzLlN0b3JhZ2UuU3RyZWFtcy5JbnB1dFN0cmVhbU9wdGlvbnMucGFydGlhbFxuICAgICAgICB0aGlzLl9yZWFkKClcblxuICAgICAgICAvLyBlbWl0IGFsbCBjYWNoZWQgcmVxdWVzdHNcbiAgICAgICAgd2hpbGUgKHRoaXMuX3VwZ3JhZGVDYWNoZS5sZW5ndGgpIHtcbiAgICAgICAgICBjb25zdCBkYXRhID0gdGhpcy5fdXBncmFkZUNhY2hlLnNoaWZ0KClcbiAgICAgICAgICB0aGlzLnNlbmQoZGF0YSlcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIChlKSA9PiB7XG4gICAgICAgIHRoaXMuX3VwZ3JhZGluZyA9IGZhbHNlXG4gICAgICAgIHRoaXMuX2Vycm9ySGFuZGxlcihlKVxuICAgICAgfVxuICAgIClcbiAgfVxuXG4gIF9lbWl0ICh0eXBlLCBkYXRhKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gdGhpc1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgY2FzZSAnb3Blbic6XG4gICAgICAgIHRoaXMucmVhZHlTdGF0ZSA9ICdvcGVuJ1xuICAgICAgICB0aGlzLm9ub3BlbiAmJiB0aGlzLm9ub3Blbih7IHRhcmdldCwgdHlwZSwgZGF0YSB9KVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnZXJyb3InOlxuICAgICAgICB0aGlzLm9uZXJyb3IgJiYgdGhpcy5vbmVycm9yKHsgdGFyZ2V0LCB0eXBlLCBkYXRhIH0pXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdkYXRhJzpcbiAgICAgICAgdGhpcy5vbmRhdGEgJiYgdGhpcy5vbmRhdGEoeyB0YXJnZXQsIHR5cGUsIGRhdGEgfSlcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2RyYWluJzpcbiAgICAgICAgdGhpcy5vbmRyYWluICYmIHRoaXMub25kcmFpbih7IHRhcmdldCwgdHlwZSwgZGF0YSB9KVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnY2xvc2UnOlxuICAgICAgICB0aGlzLnJlYWR5U3RhdGUgPSAnY2xvc2VkJ1xuICAgICAgICB0aGlzLm9uY2xvc2UgJiYgdGhpcy5vbmNsb3NlKHsgdGFyZ2V0LCB0eXBlLCBkYXRhIH0pXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG59XG4iXX0=