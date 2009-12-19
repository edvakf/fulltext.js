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
var db = new Database('wikipedia');
//Database.debugMessage = true;

var ft = new Database.FullText();
var Article = new Database.Model({
	table: 'article',
	primaryKeys: ['tid'],
	fields : {
		tid: 'INTEGER PRIMARY KEY',
		title : 'TEXT'
	}
}, db);

Deferred

.test('drop and create table', function(done) {
	return Article.dropTable()
		._(Article).createTable()
		._(ft).dropAndCreateTable()
		.next(function() { ok(true, 'new tables are created.') })
		.error(function(e) { ok(false, 'new tables were not created.') })
		.next(function() { done.call(); });
}, 1)

.test('create records', function(done) {
	var n = 0;
	var t = new Date;
	return loop(articles.length, function(i) {
		a = articles[i];
		return ft.createRecord(a.text)
			.next(function(tid) {
				return new Article({tid: tid, title: a.title}).save();
			})
			.next(function() {
				if (++n % 50 == 0) console.log(n + ' articles stored in ' + Math.floor((new Date - t)/100)/10 + ' sec.');
			})
	})
	.next(function() { ok(true, articles.lenght + ' articles stored in ' + Math.floor((new Date - t)/100)/10 + ' sec.') })
	.next(function() { done.call(); });
}, 1, 150000) // wait for 150 seconds

.test('re-index token table', function(done) {
	var t = new Date;
	return ft.reIndex()
		.next(function() {ok(true, 'index created in ' + (new Date - t) + ' ms.');})
		.next(function() {done.call();})
}, 1, 3000) // wait for 3 seconds

.test('search records', function(done) {
	var queries = ['学問', '資本', '資本主義', 'である。', 'プログラミング 文法', 'computer'];
	return Deferred.loop(queries.length, function(i) {
		var query = queries[i];
		var t = new Date;
		return ft.search(query)
		.next(function(res) {
			var len = res.length;
			if (len == 100) len = 'more than 100'
			ok(true, 'Search for : \'' + query + '\'. Results : ' + len + '. Time : ' + (new Date - t) + ' ms.' );
			return res
		})
		.next(function(texts) {
			return Deferred.parallel(
				texts.map(function(text) {
					return Article.findFirst({where : {tid : text.tid}})
						.next(function(a) {return {title: a.title, text: text.text};})
				})
			)
			.next(function(res) {
				ok(true, (res || []).map(function(a) {return a.title}).join(', '))
			}) 
		})
	})
	.next(function() { done.call() });
}, null, 100000)

.test('finished', function(d) {
	ok(true, 'finished!!!');
	d.call();
}, 1)

.error(function(e) {
	console.log('error' + e.toString());
	throw(e);
});

