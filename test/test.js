Deferred.define();
Deferred.prototype._fire = function (okng, value) {
	var next = "ok";
	try {
		value = this.callback[okng].call(this, value);
	} catch (e) {
		next  = "ng";
		if (Deferred.debug) console.error(e);
		value = e;
	}
	if (value instanceof Deferred) {
		value._next = this._next;
	} else {
		if (this._next) this._next._fire(next, value);
	}
	return this;
}

var p = function() {
	console.log(Array.prototype.slice.call(arguments, 0));
}

var is = function(a, b, mes) {
	equals(a.toString(), b.toString(), mes);
}

Deferred.test = function(name, t, count, wait) {
	var d = new Deferred();
	var search = location.search;
	var func = function() {
		setTimeout(function() {
			var setupDeferred = new Deferred(), teardownDeferred = new Deferred();
			var setup = Deferred.test.setup, teardown = Deferred.test.teardown;
			setupDeferred.next(function() {
				next(function() {
					var args = [name, function() {
						stop(wait || 3000);
						try {
							t(teardownDeferred);
						} catch(e) {
							ok(false, 'test error: ' + e.toString());
							teardownDeferred.call();
						}
					}];
					if (count) args.push(count)
					test.apply(test, args);
				});//, 0);
				return teardownDeferred;
			}).next(function() {
				teardown(d);
			});
			setup(setupDeferred);
		}, 0);
	}
	if (search.indexOf('?') == 0) {
		if (decodeURIComponent(search.substring(1)) != name) {
			setTimeout(function() {
				d.call();
			}, 0);
		} else {
			func();
		}
	} else {
		func();
	}
	return d;
};

// var i = 0;
Deferred.test.setup = function(d) {
//	console.log('setup' + (++i));
	d.call();
};

Deferred.test.teardown = function(d) {
	start(); // XXX
//	console.log('teardown' + i);
	d.call();
};

Deferred.prototype.method = function(name) {
	return d[name]();
};

Deferred.register('test', Deferred.test);

// http://javascript.g.hatena.ne.jp/edvakf/20091215/1260927366
if (!Deferred.prototype._) Deferred.prototype._ = function(obj) {
  var self = this;
  var klass = function() {};
  klass.prototype = obj;
  var delegate = new klass;
  for (var x in obj) if (typeof obj[x] === 'function') (function(x) {
    delegate[x] = function() {
      var args = Array.prototype.slice.call(arguments);
      return self.next(function() {
        return obj[x].apply(obj, args);
      });
    }
  })(x);
  return delegate;
};

Deferred.debug = true;
var Database = Deferred.WebDatabase;
//Database.debugMessage = true;
var FullText = Database.FullText;

var texts = [
 "カツオはサザエの弟", "サザエはワカメの姉", "ワカメはカツオの妹",
 "カツオは長男", "サザエは長女", "ワカメは次女",
 "マスオはサザエの夫", "波平は舟の夫", "タラちゃんのパパはマスオ",
 "サザエとマスオは夫婦", "波平はタラちゃんの祖父", "舟はカツオの母",
 "マスオはカツオの義兄", "カツオはタラちゃんの叔父", "舟はワカメの母"
];

var ft = new FullText();

Deferred.test('tokenize', function(done) {
  equals(FullText.tokenize('').length, 0);
  equals(FullText.tokenize('a').length, 1);
  equals(FullText.tokenize('abc def').length, 2);
  equals(FullText.tokenize('abc def')[0].type, 'word');
  equals(FullText.tokenize('abc.;&*/def').length, 2);
  equals(FullText.tokenize('いろはにほ').length, 5);
  equals(FullText.tokenize('いろはにほ')[0].type, 'bigram');
  equals(FullText.tokenize('い').length, 1);
  equals(FullText.tokenize('い')[0].type, 'bigram-odd');
  equals(FullText.tokenize('http://ja.wikipedia.org/wiki/Unicode一覧_0000-0FFF').length, 10);
  done.call();
}, 10)

.test('group query', function(done) {
  equals(FullText.groupQuery('').length, 0);
  equals(FullText.groupQuery('abc def "ghi"').length, 3);
  equals(FullText.groupQuery('abc "def ghi"').length, 2);
  equals(FullText.groupQuery('abc "def ghi""').length, 3);
  equals(FullText.groupQuery('abc "def ghi"""').length, 2);
  equals(FullText.groupQuery('abc " def ghi "')[1], ' def ghi ');
  equals(FullText.groupQuery('abc いろdefはにほ').length, 2);
  equals(FullText.groupQuery('いろ"はに"ほ').length, 3);
  equals(FullText.groupQuery('い"ろは"に"ほ').length, 3);
  equals(FullText.groupQuery('い"ろは"に"ほ')[2], 'に"ほ');
  equals(FullText.groupQuery('い"ろは"に"ほ"').length, 4);
  done.call();
}, 11)

.test('compose search SQL', function(done) {
  equals(FullText.composeSearchSQL(''), "SELECT txt.tid FROM fulltext_text txt" );

    // next one looks very wrong, but for the moment it is the expected behavior
  equals(FullText.composeSearchSQL('% _ \''), "SELECT DISTINCT txt.tid FROM fulltext_text txt WHERE txt.text LIKE '%%%' AND txt.text LIKE '%_%' AND txt.text LIKE '%''%'" ); 
  equals(FullText.composeSearchSQL('abc'), "SELECT DISTINCT txt.tid FROM fulltext_text txt INNER JOIN fulltext_token tkn0 USING (tid) WHERE tkn0.token = 'abc'" ); 
  equals(FullText.composeSearchSQL('abc def'), "SELECT DISTINCT txt.tid FROM fulltext_text txt INNER JOIN fulltext_token tkn0 USING (tid) INNER JOIN fulltext_token tkn1 USING (tid) WHERE tkn0.token = 'abc' AND tkn1.token = 'def'" ); 
  equals(FullText.composeSearchSQL('"abc def"'), "SELECT DISTINCT txt.tid FROM fulltext_text txt INNER JOIN fulltext_token tkn0 USING (tid) INNER JOIN fulltext_token tkn1 USING (tid) WHERE tkn0.token = 'abc' AND tkn1.token = 'def' AND txt.text LIKE '%abc def%'" ); 

    // trivial (non-bigram) queries are sorted by the token length
  equals(FullText.composeSearchSQL('"ab cde"fghi'), "SELECT DISTINCT txt.tid FROM fulltext_text txt INNER JOIN fulltext_token tkn2 USING (tid) INNER JOIN fulltext_token tkn1 USING (tid) INNER JOIN fulltext_token tkn0 USING (tid) WHERE tkn2.token = 'fghi' AND tkn1.token = 'cde' AND tkn0.token = 'ab' AND txt.text LIKE '%ab cde%'" ); 
  equals(FullText.composeSearchSQL('"abc def"ghi いろは'), "SELECT DISTINCT txt.tid FROM fulltext_text txt INNER JOIN fulltext_token tkn0 USING (tid) INNER JOIN fulltext_token tkn1 USING (tid) INNER JOIN fulltext_token tkn2 USING (tid) INNER JOIN fulltext_token tkn3 USING (tid) INNER JOIN fulltext_token tkn4 USING (tid) WHERE tkn0.token = 'abc' AND tkn1.token = 'def' AND tkn2.token = 'ghi' AND tkn3.token = 'いろ' AND tkn4.token = 'ろは' AND txt.text LIKE '%abc def%' AND txt.text LIKE '%いろは%'" ); 
  done.call();
}, 7)

.test('drop and create table', function(done) {
	return ft.dropAndCreate()
		.next(function() { ok(true, 'new tables are created.') })
		.error(function(e) { console.log(e); ok(false, 'new tables were not created.') })
		.next(function() { done.call(); });
}, 1)

.test('add records', function(done) {
  var n = 0;
	return loop(texts.length, function(i) {
    return ft.addRecord(texts[i])
      .next(function(r) { equals(r, ++n); })
      .error(function(e) { ok(false, 'failed to save : ' + texts[i]) });
		})
		.next(function() { done.call(); });
}, 15)

.test('reindex token table', function(done) {
  return ft.reindex()
    .next(function() {ok(true, 'index for token table was made');})
    .next(function() {done.call();})
}, 1)

.test('search records', function(done) {
  return  ft.search('カツオ').next(function(res) { equals(res.length, 6); })
      ._(ft).search('ワカメ').next(function(res) { equals(res.length, 4); })
      ._(ft).search('サザエ').next(function(res) { equals(res.length, 5); })
  ._(ft).search('タラちゃん').next(function(res) { equals(res.length, 3); })
  .next(function() { done.call() });
}, 4)

.test('finished', function(d) {
	ok(true, 'finished!!!');
	d.call();
}, 1)

.error(function(e) {
	console.log('error' + e.toString());
	throw(e);
});

