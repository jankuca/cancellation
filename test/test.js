var Promise = require('promise');
var tokenSource = require('../');
var assert = require('better-assert');

function delay(timeout, cancellationToken) {
  cancellationToken = cancellationToken || tokenSource.empty;
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, timeout);
    cancellationToken.onCancelled(reject);
  });
}
function delay2(timeout, cancellationToken) {
  cancellationToken = cancellationToken || tokenSource.empty;
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, timeout);
    setTimeout(function () {
      if (cancellationToken.isCancelled())
        reject(new Error('Operation Cancelled'));
    }, timeout / 4);
  });
}
function delay3(timeout, cancellationToken) {
  cancellationToken = cancellationToken || tokenSource.empty;
  return delay(timeout/4)
    .then(function () {
      cancellationToken.throwIfCancelled();
      return delay(timeout/4);
    })
    .then(function () {
      cancellationToken.throwIfCancelled();
      return delay(timeout/4);
    })
    .then(function () {
      cancellationToken.throwIfCancelled();
      return delay(timeout/4);
    });
}

function cascade(cancellationToken) {
  return delay(500, cancellationToken)
    .then(function () {
      return delay(500, cancellationToken);
    })
    .then(function () {
      return delay(500, cancellationToken);
    });
}

describe('Default token source', function () {
  it('doesn\'t get cancelled', function () {
    return delay(10);
  });
});

describe('Cancelling with a token', function () {
  it('rejects the promise in the next turn of the event loop', function () {
    var source = tokenSource();
    var waitedTillNextTurn = false;
    var timeout;
    source.cancel('Test Cancel');
    waitedTillNextTurn = true;
    timeout = setTimeout(function () {
      throw new Error('Didn\'t cancel fast enough');
    }, 100);

    return delay(20000, source.token)
      .then(function () {
        throw new Error('Should\'ve been cancelled');
      }, function (reason) {
        assert(waitedTillNextTurn);
        assert(reason instanceof Error);
        assert(reason.message === 'Test Cancel');
        assert(reason.code === 'OperationCancelled');
        clearTimeout(timeout);
      });
  });

  it('rejects without adding code=OperationCancelled ' +
      'to a custom cancellation reason error', function () {
    var source = tokenSource();
    source.cancel(new Error('Custom Cancel'));

    return delay(20000, source.token)
      .then(function () {
        throw new Error('Should\'ve been cancelled');
      }, function (reason) {
        assert(reason.code !== 'OperationCancelled');
      });
  });

  it('does not call an unregistered cancellation listener', function (callback) {
    var source = tokenSource();
    var timeout = setTimeout(callback, 100)
    var listener = function () {
      callback(new Error('Should not have been called'))
    }
    var unregister = source.token.onCancelled(listener)
    unregister()
    source.cancel()
  })

  it('does not call a cancellation listener unregistered between ' +
      'cancellation and async listener calls', function (callback) {
    var source = tokenSource();
    var timeout = setTimeout(callback, 100)
    var listener = function () {
      callback(new Error('Should not have been called'))
    }
    var unregister = source.token.onCancelled(listener)
    source.cancel()
    unregister()
  })

  it('does not call a cancellation listener registered and unregistered between ' +
      'cancellation and async listener calls', function (callback) {
    var source = tokenSource();
    var timeout = setTimeout(callback, 100)
    var listener = function () {
      callback(new Error('Should not have been called'))
    }
    source.cancel()
    var unregister = source.token.onCancelled(listener)
    unregister()
  })
});

describe('Polling for cancellation', function () {
  describe('using `.isCancelled()`', function () {
    it('works', function () {
      var source = tokenSource();
      var timeout;
      source.cancel('Test Cancel');
      timeout = setTimeout(function () {
        throw new Error('Didn\'t cancel fast enough');
      }, 30);
      return delay2(40, source.token)
        .then(function () {
          throw new Error('Should\'ve been cancelled');
        }, function (reason) {
          clearTimeout(timeout);
        });
    });
  });
  describe('using `.throwIfCancelled()`', function () {
    it('works', function () {
      var source = tokenSource();
      var timeout;
      source.cancel('Test Cancel');
      timeout = setTimeout(function () {
        throw new Error('Didn\'t cancel fast enough');
      }, 30);
      return delay3(40, source.token)
        .then(function () {
          throw new Error('Should\'ve been cancelled');
        }, function (reason) {
          clearTimeout(timeout);
        });
    });
  });
});

describe('Cascading cancellation', function () {
  it('works', function () {
    var source = tokenSource();
    var waitedTillNextTurn = false;
    var timeout;
    source.cancel('Test Cancel');
    waitedTillNextTurn = true;
    timeout = setTimeout(function () {
      throw new Error('Didn\'t cancel fast enough');
    }, 20);
    return cascade(source.token)
      .then(function () {
        throw new Error('Should\'ve been cancelled');
      }, function (reason) {
        assert(waitedTillNextTurn);
        assert(reason instanceof Error);
        assert(reason.message === 'Test Cancel');
        assert(reason.code === 'OperationCancelled');
        clearTimeout(timeout);
      });
  });
});

describe('Token racing', function () {
  it('should claim it is not cancelled ' +
      'when none of the parent tokens are cancelled', function () {
    var source1 = tokenSource()
    var source2 = tokenSource()
    var racingToken = tokenSource.race([ source1.token, source2.token ])

    assert(racingToken.isCancelled() === false)
  })

  it('should claim it is cancelled ' +
      'when one of the parent tokens is cancelled', function (callback) {
    var source1 = tokenSource()
    var source2 = tokenSource()
    source1.token.onCancelled(function () {
      assert(racingToken.isCancelled() === true)
      callback()
    })

    var racingToken = tokenSource.race([ source1.token, source2.token ])
    source1.cancel()
  })

  it('should claim it is cancelled ' +
      'when one of the parent tokens had already been cancelled', function () {
    var source1 = tokenSource()
    var source2 = tokenSource()
    source1.cancel()

    var racingToken = tokenSource.race([ source1.token, source2.token ])
    assert(racingToken.isCancelled() === true)
  })

  it('should throw when one of the parent tokens is cancelled', function (callback) {
    var source1 = tokenSource()
    var source2 = tokenSource()
    source1.token.onCancelled(function () {
      try {
        racingToken.throwIfCancelled()
      } catch (reason) {
        callback()
        return
      }
      callback(new Error('Did not throw'))
    })

    var racingToken = tokenSource.race([ source1.token, source2.token ])
    source1.cancel()
  })

  it('should throw when one of the parent tokens had already been cancelled', function () {
    var source1 = tokenSource()
    var source2 = tokenSource()
    source1.cancel()

    var racingToken = tokenSource.race([ source1.token, source2.token ])
    try {
      racingToken.throwIfCancelled()
    } catch (reason) {
      return
    }
    throw new Error('Did not throw')
  })

  it('should call onCancelled() listeners ' +
      'when one of the parent tokens had already been cancelled', function (callback) {
    var source1 = tokenSource()
    var source2 = tokenSource()
    var racingToken = tokenSource.race([ source1.token, source2.token ])

    source1.cancel()
    racingToken.onCancelled(function () {
      callback()
    })
  })

  it('should call onCancelled() listeners ' +
      'when one of the parent tokens gets cancelled', function (callback) {
    var source1 = tokenSource()
    var source2 = tokenSource()
    var racingToken = tokenSource.race([ source1.token, source2.token ])

    racingToken.onCancelled(function () {
      callback()
    })
    source1.cancel()
  })

  it('should pass the first cancellation reason to onCancelled()', function (callback) {
    var source1 = tokenSource()
    var source2 = tokenSource()
    var racingToken = tokenSource.race([ source1.token, source2.token ])

    racingToken.onCancelled(function (reason) {
      assert(reason.message.indexOf('Expected reason') > -1)
      callback()
    })
    source1.cancel(new Error('Expected reason'))
  })

  it('should not add code=OperationCancelled to a custom cancellation ' +
      'reason error passed to onCancelled()', function (callback) {
    var source1 = tokenSource()
    var source2 = tokenSource()
    var racingToken = tokenSource.race([ source1.token, source2.token ])

    racingToken.onCancelled(function (reason) {
      assert(reason.code !== 'OperationCancelled')
      callback()
    })
    source1.cancel(new Error('Expected reason'))
  })

  it('should not call onCancelled() listeners on further parent cancellations ' +
      'after one parent token has been cancelled', function (callback) {
    var source1 = tokenSource()
    var source2 = tokenSource()
    var racingToken = tokenSource.race([ source1.token, source2.token ])

    var cancelCount = 0
    racingToken.onCancelled(function () {
      cancelCount += 1
      if (cancelCount === 1) {
        setTimeout(callback, 100)
      } else {
        callback(new Error('onCancelled() called multiple times.'))
      }
    })

    source1.cancel()
    source2.cancel()
  })
})
