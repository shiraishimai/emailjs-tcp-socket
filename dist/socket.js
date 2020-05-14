"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var TCPSocket;

var DummySocket = /*#__PURE__*/function () {
  function DummySocket() {
    _classCallCheck(this, DummySocket);
  }

  _createClass(DummySocket, null, [{
    key: "open",
    value: function open() {
      throw new Error('Runtime does not offer raw sockets!');
    }
  }]);

  return DummySocket;
}();

if (typeof process !== 'undefined') {
  TCPSocket = require('./node-socket');
} else if (typeof chrome !== 'undefined' && (chrome.socket || chrome.sockets)) {
  TCPSocket = require('./chrome-socket');
} else if ((typeof Windows === "undefined" ? "undefined" : _typeof(Windows)) === 'object' && Windows && Windows.Networking && Windows.Networking.Sockets && Windows.Networking.Sockets.StreamSocket) {
  TCPSocket = require('./windows-socket');
} else if ((typeof window === "undefined" ? "undefined" : _typeof(window)) === 'object' && typeof io === 'function') {
  TCPSocket = require('./socketio-socket');
} else {
  TCPSocket = DummySocket;
}

module.exports = TCPSocket;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9zb2NrZXQuanMiXSwibmFtZXMiOlsiVENQU29ja2V0IiwiRHVtbXlTb2NrZXQiLCJFcnJvciIsInByb2Nlc3MiLCJyZXF1aXJlIiwiY2hyb21lIiwic29ja2V0Iiwic29ja2V0cyIsIldpbmRvd3MiLCJOZXR3b3JraW5nIiwiU29ja2V0cyIsIlN0cmVhbVNvY2tldCIsIndpbmRvdyIsImlvIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBLElBQUlBLFNBQUo7O0lBRU1DLFc7Ozs7Ozs7MkJBQ1c7QUFDYixZQUFNLElBQUlDLEtBQUosQ0FBVSxxQ0FBVixDQUFOO0FBQ0Q7Ozs7OztBQUdILElBQUksT0FBT0MsT0FBUCxLQUFtQixXQUF2QixFQUFvQztBQUNsQ0gsRUFBQUEsU0FBUyxHQUFHSSxPQUFPLENBQUMsZUFBRCxDQUFuQjtBQUNELENBRkQsTUFFTyxJQUFJLE9BQU9DLE1BQVAsS0FBa0IsV0FBbEIsS0FBa0NBLE1BQU0sQ0FBQ0MsTUFBUCxJQUFpQkQsTUFBTSxDQUFDRSxPQUExRCxDQUFKLEVBQXdFO0FBQzdFUCxFQUFBQSxTQUFTLEdBQUdJLE9BQU8sQ0FBQyxpQkFBRCxDQUFuQjtBQUNELENBRk0sTUFFQSxJQUFJLFFBQU9JLE9BQVAseUNBQU9BLE9BQVAsT0FBbUIsUUFBbkIsSUFBK0JBLE9BQS9CLElBQTBDQSxPQUFPLENBQUNDLFVBQWxELElBQWdFRCxPQUFPLENBQUNDLFVBQVIsQ0FBbUJDLE9BQW5GLElBQThGRixPQUFPLENBQUNDLFVBQVIsQ0FBbUJDLE9BQW5CLENBQTJCQyxZQUE3SCxFQUEySTtBQUNoSlgsRUFBQUEsU0FBUyxHQUFHSSxPQUFPLENBQUMsa0JBQUQsQ0FBbkI7QUFDRCxDQUZNLE1BRUEsSUFBSSxRQUFPUSxNQUFQLHlDQUFPQSxNQUFQLE9BQWtCLFFBQWxCLElBQThCLE9BQU9DLEVBQVAsS0FBYyxVQUFoRCxFQUE0RDtBQUNqRWIsRUFBQUEsU0FBUyxHQUFHSSxPQUFPLENBQUMsbUJBQUQsQ0FBbkI7QUFDRCxDQUZNLE1BRUE7QUFDTEosRUFBQUEsU0FBUyxHQUFHQyxXQUFaO0FBQ0Q7O0FBRURhLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQmYsU0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyJsZXQgVENQU29ja2V0XG5cbmNsYXNzIER1bW15U29ja2V0IHtcbiAgc3RhdGljIG9wZW4gKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignUnVudGltZSBkb2VzIG5vdCBvZmZlciByYXcgc29ja2V0cyEnKVxuICB9XG59XG5cbmlmICh0eXBlb2YgcHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgVENQU29ja2V0ID0gcmVxdWlyZSgnLi9ub2RlLXNvY2tldCcpXG59IGVsc2UgaWYgKHR5cGVvZiBjaHJvbWUgIT09ICd1bmRlZmluZWQnICYmIChjaHJvbWUuc29ja2V0IHx8IGNocm9tZS5zb2NrZXRzKSkge1xuICBUQ1BTb2NrZXQgPSByZXF1aXJlKCcuL2Nocm9tZS1zb2NrZXQnKVxufSBlbHNlIGlmICh0eXBlb2YgV2luZG93cyA9PT0gJ29iamVjdCcgJiYgV2luZG93cyAmJiBXaW5kb3dzLk5ldHdvcmtpbmcgJiYgV2luZG93cy5OZXR3b3JraW5nLlNvY2tldHMgJiYgV2luZG93cy5OZXR3b3JraW5nLlNvY2tldHMuU3RyZWFtU29ja2V0KSB7XG4gIFRDUFNvY2tldCA9IHJlcXVpcmUoJy4vd2luZG93cy1zb2NrZXQnKVxufSBlbHNlIGlmICh0eXBlb2Ygd2luZG93ID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgaW8gPT09ICdmdW5jdGlvbicpIHtcbiAgVENQU29ja2V0ID0gcmVxdWlyZSgnLi9zb2NrZXRpby1zb2NrZXQnKVxufSBlbHNlIHtcbiAgVENQU29ja2V0ID0gRHVtbXlTb2NrZXRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBUQ1BTb2NrZXRcbiJdfQ==