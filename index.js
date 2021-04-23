const AbortController = require('abort-controller')

module.exports = tokenSource;
module.exports.empty = tokenSource().token;

function tokenSource() {
  var data = {
    reason: null,
    isCancelled: false,
    listeners: []
  };

  var abortController = new AbortController()

  function cancel(reason) {
    data.isCancelled = true;

    reason = reason || 'Operation Cancelled';
    if (typeof reason == 'string') {
      reason = new Error(reason);
      reason.code = 'OperationCancelled';
    }
    data.reason = reason;

    setTimeout(function () {
      for (var i = 0; i < data.listeners.length; i++) {
        if (typeof data.listeners[i] === 'function') {
          data.listeners[i](reason);
        }
      }
    }, 0);

    abortController.abort()
  }

  return {
    cancel: cancel,
    token: token(data, abortController.signal)
  };
}

function token(data, signal) {
  var exports = {};

  exports.isCancelled = isCancelled;
  function isCancelled() {
    return data.isCancelled;
  }

  exports.throwIfCancelled = throwIfCancelled;
  function throwIfCancelled() {
    if (isCancelled()) {
      throw data.reason;
    }
  }

  exports.onCancelled = onCancelled;
  function onCancelled(cb) {
    if (isCancelled()) {
      var listener = function () {
        cb(data.reason);
      }
      var timeout = setTimeout(listener, 0);
      return function () {
        clearTimeout(timeout)
      }
    } else {
      data.listeners.push(cb);
      return function () {
        var index = data.listeners.indexOf(cb)
        if (index > -1) {
          data.listeners[index] = null
        }
      }
    }
  }

  exports.signal = signal

  return exports;
}

tokenSource.race = function (cancelTokens) {
  const racing = tokenSource()
  const onParentCancel = function (reason) {
    racing.cancel(reason)
    unregisters.forEach(function (unregister) {
      if (unregister) {
        unregister()
      }
    })
  }

  const unregisters = cancelTokens.map(function (cancelToken) {
    return cancelToken ? cancelToken.onCancelled(onParentCancel) : null
  })

  return {
    signal: racing.token.signal,
    onCancelled: racing.token.onCancelled,
    isCancelled: function () {
      return (
        racing.token.isCancelled() ||
        cancelTokens.some(function (cancelToken) {
          return Boolean(cancelToken && cancelToken.isCancelled())
        })
      )
    },
    throwIfCancelled: function () {
      racing.token.throwIfCancelled()
      cancelTokens.forEach(function (cancelToken) {
        if (cancelToken) {
          cancelToken.throwIfCancelled()
        }
      })
    },
  }
}

tokenSource.fromSignal = function (signal) {
  const { token, cancel } = tokenSource()
  const handleAbort = function () {
    cancel()
  }

  signal.addEventListener('abort', handleAbort, { once: true })

  return token
}
