"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _ramda = require("ramda");

var _net = _interopRequireDefault(require("net"));

var _tls = _interopRequireDefault(require("tls"));

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
    this.ssl = (0, _ramda.propOr)(false, 'useSecureTransport')(options);
    this.bufferedAmount = 0;
    this.readyState = 'connecting';
    this.binaryType = (0, _ramda.propOr)('arraybuffer', 'binaryType')(options);

    if (this.binaryType !== 'arraybuffer') {
      throw new Error('Only arraybuffers are supported!');
    }

    this._socket = this.ssl ? _tls["default"].connect({
      port: this.port,
      host: this.host,
      servername: this.host // SNI

    }, function () {
      return _this._emit('open');
    }) : _net["default"].connect(this.port, this.host, function () {
      return _this._emit('open');
    }); // add all event listeners to the new socket

    this._attachListeners();
  }

  _createClass(TCPSocket, [{
    key: "_attachListeners",
    value: function _attachListeners() {
      var _this2 = this;

      this._socket.on('data', function (nodeBuf) {
        return _this2._emit('data', nodeBuffertoArrayBuffer(nodeBuf));
      });

      this._socket.on('error', function (error) {
        // Ignore ECONNRESET errors. For the app this is the same as normal close
        if (error.code !== 'ECONNRESET') {
          _this2._emit('error', error);
        }

        _this2.close();
      });

      this._socket.on('end', function () {
        return _this2._emit('close');
      });
    }
  }, {
    key: "_removeListeners",
    value: function _removeListeners() {
      this._socket.removeAllListeners('data');

      this._socket.removeAllListeners('end');

      this._socket.removeAllListeners('error');
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
    } //
    // API
    //

  }, {
    key: "close",
    value: function close() {
      this.readyState = 'closing';

      this._socket.end();
    }
  }, {
    key: "send",
    value: function send(data) {
      // convert data to string or node buffer
      this._socket.write(arrayBufferToNodeBuffer(data), this._emit.bind(this, 'drain'));
    }
  }, {
    key: "upgradeToSecure",
    value: function upgradeToSecure() {
      var _this3 = this;

      if (this.ssl) return;

      this._removeListeners();

      this._socket = _tls["default"].connect({
        socket: this._socket
      }, function () {
        _this3.ssl = true;
      });

      this._attachListeners();
    }
  }]);

  return TCPSocket;
}();

exports["default"] = TCPSocket;

var nodeBuffertoArrayBuffer = function nodeBuffertoArrayBuffer(buf) {
  return Uint8Array.from(buf).buffer;
};

var arrayBufferToNodeBuffer = function arrayBufferToNodeBuffer(ab) {
  return Buffer.from(new Uint8Array(ab));
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9ub2RlLXNvY2tldC5qcyJdLCJuYW1lcyI6WyJUQ1BTb2NrZXQiLCJob3N0IiwicG9ydCIsIm9wdGlvbnMiLCJzc2wiLCJidWZmZXJlZEFtb3VudCIsInJlYWR5U3RhdGUiLCJiaW5hcnlUeXBlIiwiRXJyb3IiLCJfc29ja2V0IiwidGxzIiwiY29ubmVjdCIsInNlcnZlcm5hbWUiLCJfZW1pdCIsIm5ldCIsIl9hdHRhY2hMaXN0ZW5lcnMiLCJvbiIsIm5vZGVCdWYiLCJub2RlQnVmZmVydG9BcnJheUJ1ZmZlciIsImVycm9yIiwiY29kZSIsImNsb3NlIiwicmVtb3ZlQWxsTGlzdGVuZXJzIiwidHlwZSIsImRhdGEiLCJ0YXJnZXQiLCJvbm9wZW4iLCJvbmVycm9yIiwib25kYXRhIiwib25kcmFpbiIsIm9uY2xvc2UiLCJlbmQiLCJ3cml0ZSIsImFycmF5QnVmZmVyVG9Ob2RlQnVmZmVyIiwiYmluZCIsIl9yZW1vdmVMaXN0ZW5lcnMiLCJzb2NrZXQiLCJidWYiLCJVaW50OEFycmF5IiwiZnJvbSIsImJ1ZmZlciIsImFiIiwiQnVmZmVyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7SUFFcUJBLFM7Ozt5QkFDTkMsSSxFQUFNQyxJLEVBQW9CO0FBQUEsVUFBZEMsT0FBYyx1RUFBSixFQUFJO0FBQ3JDLGFBQU8sSUFBSUgsU0FBSixDQUFjO0FBQUVDLFFBQUFBLElBQUksRUFBSkEsSUFBRjtBQUFRQyxRQUFBQSxJQUFJLEVBQUpBLElBQVI7QUFBY0MsUUFBQUEsT0FBTyxFQUFQQTtBQUFkLE9BQWQsQ0FBUDtBQUNEOzs7QUFFRCwyQkFBc0M7QUFBQTs7QUFBQSxRQUF2QkYsSUFBdUIsUUFBdkJBLElBQXVCO0FBQUEsUUFBakJDLElBQWlCLFFBQWpCQSxJQUFpQjtBQUFBLFFBQVhDLE9BQVcsUUFBWEEsT0FBVzs7QUFBQTs7QUFDcEMsU0FBS0YsSUFBTCxHQUFZQSxJQUFaO0FBQ0EsU0FBS0MsSUFBTCxHQUFZ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VUFBVSxDQUFDQyxJQUFYLENBQWdCRixHQUFoQixFQUFxQkcsTUFBekI7QUFBQSxDQUFuQzs7QUFDQSxJQUFNUCx1QkFBdUIsR0FBRyxTQUExQkEsdUJBQTBCLENBQUNRLEVBQUQ7QUFBQSxTQUFRQyxNQUFNLENBQUNILElBQVAsQ0FBWSxJQUFJRCxVQUFKLENBQWVHLEVBQWYsQ0FBWixDQUFSO0FBQUEsQ0FBaEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBwcm9wT3IgfSBmcm9tICdyYW1kYSdcbmltcG9ydCBuZXQgZnJvbSAnbmV0J1xuaW1wb3J0IHRscyBmcm9tICd0bHMnXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFRDUFNvY2tldCB7XG4gIHN0YXRpYyBvcGVuIChob3N0LCBwb3J0LCBvcHRpb25zID0ge30pIHtcbiAgICByZXR1cm4gbmV3IFRDUFNvY2tldCh7IGhvc3QsIHBvcnQsIG9wdGlvbnMgfSlcbiAgfVxuXG4gIGNvbnN0cnVjdG9yICh7IGhvc3QsIHBvcnQsIG9wdGlvbnMgfSkge1xuICAgIHRoaXMuaG9zdCA9IGhvc3RcbiAgICB0aGlzLnBvcnQgPSBwb3J0XG4gICAgdGhpcy5zc2wgPSBwcm9wT3IoZmFsc2UsICd1c2VTZWN1cmVUcmFuc3BvcnQnKShvcHRpb25zKVxuICAgIHRoaXMuYnVmZmVyZWRBbW91bnQgPSAwXG4gICAgdGhpcy5yZWFkeVN0YXRlID0gJ2Nvbm5lY3RpbmcnXG4gICAgdGhpcy5iaW5hcnlUeXBlID0gcHJvcE9yKCdhcnJheWJ1ZmZlcicsICdiaW5hcnlUeXBlJykob3B0aW9ucylcblxuICAgIGlmICh0aGlzLmJpbmFyeVR5cGUgIT09ICdhcnJheWJ1ZmZlcicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignT25seSBhcnJheWJ1ZmZlcnMgYXJlIHN1cHBvcnRlZCEnKVxuICAgIH1cblxuICAgIHRoaXMuX3NvY2tldCA9IHRoaXMuc3NsXG4gICAgICA/IHRscy5jb25uZWN0KHtcbiAgICAgICAgcG9ydDogdGhpcy5wb3J0LFxuICAgICAgICBob3N0OiB0aGlzLmhvc3QsXG4gICAgICAgIHNlcnZlcm5hbWU6IHRoaXMuaG9zdCAvLyBTTklcbiAgICAgIH0sICgpID0+IHRoaXMuX2VtaXQoJ29wZW4nKSlcbiAgICAgIDogbmV0LmNvbm5lY3QodGhpcy5wb3J0LCB0aGlzLmhvc3QsICgpID0+IHRoaXMuX2VtaXQoJ29wZW4nKSlcblxuICAgIC8vIGFkZCBhbGwgZXZlbnQgbGlzdGVuZXJzIHRvIHRoZSBuZXcgc29ja2V0XG4gICAgdGhpcy5fYXR0YWNoTGlzdGVuZXJzKClcbiAgfVxuXG4gIF9hdHRhY2hMaXN0ZW5lcnMgKCkge1xuICAgIHRoaXMuX3NvY2tldC5vbignZGF0YScsIG5vZGVCdWYgPT4gdGhpcy5fZW1pdCgnZGF0YScsIG5vZGVCdWZmZXJ0b0FycmF5QnVmZmVyKG5vZGVCdWYpKSlcbiAgICB0aGlzLl9zb2NrZXQub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xuICAgICAgLy8gSWdub3JlIEVDT05OUkVTRVQgZXJyb3JzLiBGb3IgdGhlIGFwcCB0aGlzIGlzIHRoZSBzYW1lIGFzIG5vcm1hbCBjbG9zZVxuICAgICAgaWYgKGVycm9yLmNvZGUgIT09ICdFQ09OTlJFU0VUJykge1xuICAgICAgICB0aGlzLl9lbWl0KCdlcnJvcicsIGVycm9yKVxuICAgICAgfVxuICAgICAgdGhpcy5jbG9zZSgpXG4gICAgfSlcblxuICAgIHRoaXMuX3NvY2tldC5vbignZW5kJywgKCkgPT4gdGhpcy5fZW1pdCgnY2xvc2UnKSlcbiAgfVxuXG4gIF9yZW1vdmVMaXN0ZW5lcnMgKCkge1xuICAgIHRoaXMuX3NvY2tldC5yZW1vdmVBbGxMaXN0ZW5lcnMoJ2RhdGEnKVxuICAgIHRoaXMuX3NvY2tldC5yZW1vdmVBbGxMaXN0ZW5lcnMoJ2VuZCcpXG4gICAgdGhpcy5fc29ja2V0LnJlbW92ZUFsbExpc3RlbmVycygnZXJyb3InKVxuICB9XG5cbiAgX2VtaXQgKHR5cGUsIGRhdGEpIHtcbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzXG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlICdvcGVuJzpcbiAgICAgICAgdGhpcy5yZWFkeVN0YXRlID0gJ29wZW4nXG4gICAgICAgIHRoaXMub25vcGVuICYmIHRoaXMub25vcGVuKHsgdGFyZ2V0LCB0eXBlLCBkYXRhIH0pXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdlcnJvcic6XG4gICAgICAgIHRoaXMub25lcnJvciAmJiB0aGlzLm9uZXJyb3IoeyB0YXJnZXQsIHR5cGUsIGRhdGEgfSlcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2RhdGEnOlxuICAgICAgICB0aGlzLm9uZGF0YSAmJiB0aGlzLm9uZGF0YSh7IHRhcmdldCwgdHlwZSwgZGF0YSB9KVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnZHJhaW4nOlxuICAgICAgICB0aGlzLm9uZHJhaW4gJiYgdGhpcy5vbmRyYWluKHsgdGFyZ2V0LCB0eXBlLCBkYXRhIH0pXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdjbG9zZSc6XG4gICAgICAgIHRoaXMucmVhZHlTdGF0ZSA9ICdjbG9zZWQnXG4gICAgICAgIHRoaXMub25jbG9zZSAmJiB0aGlzLm9uY2xvc2UoeyB0YXJnZXQsIHR5cGUsIGRhdGEgfSlcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICAvL1xuICAvLyBBUElcbiAgLy9cblxuICBjbG9zZSAoKSB7XG4gICAgdGhpcy5yZWFkeVN0YXRlID0gJ2Nsb3NpbmcnXG4gICAgdGhpcy5fc29ja2V0LmVuZCgpXG4gIH1cblxuICBzZW5kIChkYXRhKSB7XG4gICAgLy8gY29udmVydCBkYXRhIHRvIHN0cmluZyBvciBub2RlIGJ1ZmZlclxuICAgIHRoaXMuX3NvY2tldC53cml0ZShhcnJheUJ1ZmZlclRvTm9kZUJ1ZmZlcihkYXRhKSwgdGhpcy5fZW1pdC5iaW5kKHRoaXMsICdkcmFpbicpKVxuICB9XG5cbiAgdXBncmFkZVRvU2VjdXJlICgpIHtcbiAgICBpZiAodGhpcy5zc2wpIHJldHVyblxuXG4gICAgdGhpcy5fcmVtb3ZlTGlzdGVuZXJzKClcbiAgICB0aGlzLl9zb2NrZXQgPSB0bHMuY29ubmVjdCh7IHNvY2tldDogdGhpcy5fc29ja2V0IH0sICgpID0+IHsgdGhpcy5zc2wgPSB0cnVlIH0pXG4gICAgdGhpcy5fYXR0YWNoTGlzdGVuZXJzKClcbiAgfVxufVxuXG5jb25zdCBub2RlQnVmZmVydG9BcnJheUJ1ZmZlciA9IGJ1ZiA9PiBVaW50OEFycmF5LmZyb20oYnVmKS5idWZmZXJcbmNvbnN0IGFycmF5QnVmZmVyVG9Ob2RlQnVmZmVyID0gKGFiKSA9PiBCdWZmZXIuZnJvbShuZXcgVWludDhBcnJheShhYikpXG4iXX0=