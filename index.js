const AbortController = require('abort-controller')

module.exports = tokenSource;
module.exports.empty = tokenSource().token;

function tokenSource() {
  var data = {
    reason: null,
    isCancelled: false,
    isDisposed: false,
    listeners: []
  };

  var cancelController = new AbortController()
  var disposeController = new AbortController()

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

    cancelController.abort()
  }

  function dispose() {
    data.isDisposed = true
    data.reason = null

    for (var index = 0; index < data.listeners.length; index += 1) {
      data.listeners[index] = null
    }

    if (typeof cancelController.signal.removeAllListeners === 'function') {
      cancelController.signal.removeAllListeners()
    }

    disposeController.abort()
  }

  return {
    cancel: cancel,
    dispose: dispose,
    token: token(data, cancelController.signal, disposeController.signal)
  };
}

function token(data, cancelSignal, disposeSignal) {
  var exports = {};

  exports.isCancelled = isCancelled;
  function isCancelled() {
    return data.isCancelled;
  }

  exports.isDisposed = isDisposed;
  function isDisposed() {
    return data.isDisposed;
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

  exports.onDisposed = onDisposed;
  function onDisposed(cb) {
    if (isDisposed()) {
      var listener = function () {
        cb();
      }
      var timeout = setTimeout(listener, 0);
      return function () {
        clearTimeout(timeout)
      }
    } else {
      const abortListener = function () {
        cb()
      }
      disposeSignal.addEventListener('abort', abortListener, { once: true })
      return function () {
        disposeSignal.removeEventListener('abort', abortListeenr)
      }
    }
  }

  exports.signal = cancelSignal

  return exports;
}

tokenSource.race = function (cancelTokens) {
  const racing = tokenSource()

  const onParentCancel = function (reason) {
    racing.cancel(reason)
    cancelUnregisters.forEach(function (unregister) {
      if (unregister) {
        unregister()
      }
    })
  }
  const onParentDispose = function () {
    racing.dispose()
    disposeUnregisters.forEach(function (unregister) {
      if (unregister) {
        unregister()
      }
    })
  }

  const cancelUnregisters = cancelTokens.map(function (cancelToken) {
    return cancelToken ? cancelToken.onCancelled(onParentCancel) : null
  })
  const disposeUnregisters = cancelTokens.map(function (cancelToken) {
    return cancelToken ? cancelToken.onDisposed(onParentDispose) : null
  })

  return {
    signal: racing.token.signal,
    onCancelled: racing.token.onCancelled,
    onDisposed: racing.token.onDisposed,
    isCancelled: function () {
      return (
        racing.token.isCancelled() ||
        cancelTokens.some(function (cancelToken) {
          return Boolean(cancelToken && cancelToken.isCancelled())
        })
      )
    },
    isDisposed: function () {
      return (
        racing.token.isDisposed() ||
        cancelTokens.some(function (cancelToken) {
          return Boolean(cancelToken && cancelToken.isDisposed())
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
  const { token, cancel, dispose: disposeToken } = tokenSource()

  const handleAbort = function () {
    cancel()
  }
  signal.addEventListener('abort', handleAbort, { once: true })

  const dispose = function () {
    signal.removeEventListener('abort', handleAbort)
    disposeToken()
  }

  return { token, dispose }
}
