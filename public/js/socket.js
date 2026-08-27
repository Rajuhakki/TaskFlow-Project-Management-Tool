/**
 * FlowBoard Socket.io Shared Client Manager
 */
(function (window) {
  let socketInstance = null;

  function getAppSocket() {
    if (!socketInstance) {
      if (window.socket) {
        socketInstance = window.socket;
      } else if (typeof io !== 'undefined') {
        socketInstance = io();
        window.socket = socketInstance;
      }
    }
    return socketInstance;
  }

  function setAppSocket(sock) {
    socketInstance = sock;
    window.socket = sock;
  }

  window.getAppSocket = getAppSocket;
  window.setAppSocket = setAppSocket;
})(window);

