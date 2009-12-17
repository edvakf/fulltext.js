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

Deferred.prototype.peek = function() {
	return this.next(function(r) {
		console.log(r)
		return r;
	})
}

Deferred.debug = true;
var Database = Deferred.WebDatabase;
//Database.debugMessage = true;
var FullText = Database.FullText;

var texts = [
	'', 'abcdefg', 'abc def', 'ab "cde fgh"', '1st, 2nd, 3rd',
	'AbcDefG', 'AB.CDE', 'A,B and C', 'Don\'t panic!', 'Don Corleone', 
	'I\'m 100% sure.', '100000 people', '$100',
	'アイウエオ', 'あいうえお', 'いろはにほへと　ちりぬるを',
	'いろは歌', 'いろはかるた', 'ヴァイオリン', 'バイオリン', 
	'本日休業', '本日は休業します', '漢字とalphabetがspaceなしで混在',
];

var textids = [];

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
	equals(FullText.composeSearchSQL('100%'), "SELECT DISTINCT txt.tid FROM fulltext_text txt INNER JOIN fulltext_token tkn0 USING (tid) WHERE tkn0.token = '100' AND txt.text LIKE '%100%%'" ); 
	equals(FullText.composeSearchSQL('abc'), "SELECT DISTINCT txt.tid FROM fulltext_text txt INNER JOIN fulltext_token tkn0 USING (tid) WHERE tkn0.token = 'abc'" ); 
	equals(FullText.composeSearchSQL('abc def'), "SELECT DISTINCT txt.tid FROM fulltext_text txt INNER JOIN fulltext_token tkn0 USING (tid) INNER JOIN fulltext_token tkn1 USING (tid) WHERE tkn0.token = 'abc' AND tkn1.token = 'def'" ); 
	equals(FullText.composeSearchSQL('"abc def"'), "SELECT DISTINCT txt.tid FROM fulltext_text txt INNER JOIN fulltext_token tkn0 USING (tid) INNER JOIN fulltext_token tkn1 USING (tid) WHERE tkn0.token = 'abc' AND tkn1.token = 'def' AND txt.text LIKE '%abc def%'" ); 

		// trivial (non-bigram) queries are sorted by the token length
	equals(FullText.composeSearchSQL('"ab cde"fghi'), "SELECT DISTINCT txt.tid FROM fulltext_text txt INNER JOIN fulltext_token tkn2 USING (tid) INNER JOIN fulltext_token tkn1 USING (tid) INNER JOIN fulltext_token tkn0 USING (tid) WHERE tkn2.token = 'fghi' AND tkn1.token = 'cde' AND tkn0.token = 'ab' AND txt.text LIKE '%ab cde%'" ); 
	equals(FullText.composeSearchSQL('"abc def"ghi いろは'), "SELECT DISTINCT txt.tid FROM fulltext_text txt INNER JOIN fulltext_token tkn0 USING (tid) INNER JOIN fulltext_token tkn1 USING (tid) INNER JOIN fulltext_token tkn2 USING (tid) INNER JOIN fulltext_token tkn3 USING (tid) INNER JOIN fulltext_token tkn4 USING (tid) WHERE tkn0.token = 'abc' AND tkn1.token = 'def' AND tkn2.token = 'ghi' AND tkn3.token = 'いろ' AND tkn4.token = 'ろは' AND txt.text LIKE '%abc def%' AND txt.text LIKE '%いろは%'" ); 
	done.call();
}, 8)

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
			.next(function(r) { textids.push(r); equals(r, ++n); })
			.error(function(e) { ok(false, 'failed to save : ' + texts[i]) });
	})
	.next(function() { done.call(); });
}, texts.length)

.test('reindex token table', function(done) {
	return ft.reIndex()
		.next(function() {ok(true, 'index for token table was made');})
		.next(function() {done.call();})
}, 1)

.test('search records', function(done) {
	return  ft.search('')
	.next(function(res) { equals(res.length, texts.length); })
	._(ft).search('\'')
	.next(function(res) { equals(res.length, 2); })
	._(ft).search('abcdefg')
	.next(function(res) { equals(res.length, 2); })
	._(ft).search('A,"B and C"')
	.next(function(res) { equals(res.length, 1); })
	._(ft).search('Don\'')
	.next(function(res) { equals(res.length, 1); })
	._(ft).search('100%')
	.next(function(res) { equals(res.length, 2); })  // this is the current behavior, but needs fixed
	._(ft).search('アイウエオ')
	.next(function(res) { equals(res.length, 1); })
	._(ft).search('いろは')
	.next(function(res) { equals(res.length, 3); })
	._(ft).search('バイオリン')
	.next(function(res) { equals(res.length, 1); })  // maybe 2 in the future?
	._(ft).search('本日休業')
	.next(function(res) { equals(res.length, 1); })  // maybe 2 in the future?
	._(ft).search('漢字とalpha')
	.next(function(res) { equals(res.length, 0); })
	._(ft).search('漢字とalphabet')
	.next(function(res) { equals(res.length, 1); })
	.next(function() { done.call() });
}, 12)

.test('delete records', function(done) {
	return loop(texts.length, function(i) {
		return ft.deleteRecord(textids[i])
	})
	._(ft.Text).count()
	.next(function(res) { equals(res, 0) })
	._(ft.Token).count()
	.next(function(res) { equals(res, 0) })
	.next(function() { done.call(); });
}, 2)

.test('finished', function(d) {
	ok(true, 'finished!!!');
	d.call();
}, 1)

.error(function(e) {
	console.log('error' + e.toString());
	throw(e);
});

