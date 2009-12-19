// fulltext.js
// Version : 0.2.0
// License : The MIT License
//   Copyright (c) 2009 Atsushi Takayama (taka.atsushi (a) gmail.com)
// Depends on :
//   jsdeferred.js <http://github.com/cho45/jsdeferred>
//   jsdeferred-webdatabase <http://github.com/hotchpotch/jsdeferred-webdatabase>

(function() {
	if (!window.Deferred || !window.Deferred.WebDatabase) return;

	var Database = Deferred.WebDatabase;
	var Model = Database.Model;

	// table names are not changeable, in order to avoid SQL injection
	var textTable = 'fulltext_text';
	var tokenTable = 'fulltext_token';

	// supply Deferred.Database instance or else it will create a database
	var FullText = Deferred.WebDatabase.FullText = function(dbName, options) {
		if (!options) options = {};
		options.version = options.version || '1.0';
		options.estimateSize = options.estimateSize || 50*1024*1024; // 50MB

		this.database = new Database(dbName || 'fulltext', options);

		this.Text = Model({
			table : textTable,
			primaryKeys : ['tid'],
			fields : {
				tid  : 'INTEGER PRIMARY KEY',
				text : 'TEXT',
				date : 'INTEGER NOT NULL',
			}
		}, this.database);

		this.Text.proxyColumns({
			date: 'Date',
			text : {
				getter: function(val) {
					if (typeof val == 'undefined') {
						return;
					} else {
						return sqlLikeUnescape(val);
					}
				},
				setter: function(val) {
					return sqlLikeEscape(val);
				}
			}
		});

		this.Token = Model({
			table : tokenTable,
			primaryKeys : ['id'],
			fields : {
				id    : 'INTEGER PRIMARY KEY',
				token : 'TEXT COLLATE NOCASE',
				tid   : 'INTEGER'
			}
		}, this.database);

		this.Text.proxyColumns({
			token : {
				getter: function(val) {
					if (typeof val == 'undefined') {
						return;
					} else {
						return sqlLikeUnescape(val);
					}
				},
				setter: function(val) {
					return sqlLikeEscape(val);
				}
			}
		});
	}

	// safe
	FullText.prototype.createTable = function() {
		var Text = this.Text, Token = this.Token; 
		return db.transaction(function() {
			Text.createTable();
			Token.createTable();
		});
	}

	// unsafe (deletes previously saved records)
	FullText.prototype.dropAndCreateTable = function() {
		var Text = this.Text, Token = this.Token; 
		var db = this.database;
		return db.transaction(function() {
			Text.dropTable();
			Token.dropTable();
			Text.createTable();
			Token.createTable();
		});
	}

	// createRecord passes the text id of the created text to the next Deferred
	FullText.prototype.createRecord = function(txt, date) {
		var Text = this.Text, Token = this.Token;
		var db = this.database;
		var tid = null;
		if (!(date instanceof Date)) date = new Date;
		return db.transaction(function(tx) {
			return new Text({ text : txt, date : date }).save()
			.next(function(t) {
				tid = t.tid;
				var tokens = unique( FullText.tokenize(txt), function(t) {return t.token} );
				tokens.forEach(function(token) {
					tx.next(function() {
						new Token({ token : token.token, tid : tid }).save();
					});
				});
			});
		}).next(function() {
			return tid;
		});
	};

	FullText.prototype.deleteRecord = function(tid) {
		var Text = this.Text, Token = this.Token; 
		return this.database.transaction(function() {
			Text.destroy({ tid : tid });
			Token.destroy({ tid : tid });
		});
	};

	FullText.prototype.reIndex = function() {
		var SQLdrop = "DROP INDEX IF EXISTS fulltext_token_index;";
		var SQLcreate = "CREATE INDEX fulltext_token_index ON "+ tokenTable +" (token);";
		return this.database.transaction(function(tx) {
			tx.execute(SQLdrop);
			tx.execute(SQLcreate);
		});
	}

	// search passes an array instances of the Text model to the next Deferred
	FullText.prototype.search = function(query, page, num_per_page) {
		// query like : Shakespear "Romeo and Juliette", where "Romeo and Juliettte" is the exact match
		// page starting from 0 : optional, default 0
		// num_per_page : optional, default 100

		var Text = this.Text;
		var sql = FullText.composeSearchSQL(query);

		num_per_page = Math.max(Math.floor(num_per_page), 0) || 100;
		page = Math.max(Math.floor(page), 0) || 0;
		sql += " ORDER BY txt.date DESC LIMIT " + num_per_page + " OFFSET " + (page * num_per_page) + ";";

		return this.database.execute(sql).next(function(res) {
			return Text.resultSetInstance(res);
		});
	};

	FullText.composeSearchSQL = function(query) {
		var tokens = unique( FullText.tokenize(query), function(t) {return t.token} );
		var groups = FullText.groupQuery(query);
		var complexGroups = groups.filter(function (g){return FullText.complex_text.test(g)}); // non-trivial text group

		function joinJoin(tokens) {return tokens.map(function(t) {return t.joinStatement}).join(" ")};
		function joinWhere(tokens) {return tokens.map(function(t) {return t.whereStatement}).join(" AND ")};
		function sqlSelectDistinct(tokens) {return ["SELECT DISTINCT txt.* FROM",textTable,"txt",joinJoin(tokens),"WHERE",joinWhere(tokens)].join(" ")};

		var sql;
		if (tokens.length === 0) {
			if (groups.length === 0) {
				sql = "SELECT txt.* FROM "+textTable+" txt";
			} else {
				sql = "SELECT DISTINCT txt.* FROM "+textTable+" txt WHERE "+groups.map(function(g) {return "txt.text LIKE '%" + sqlEscape(g) + "%'"}).join(" AND ");
			}
		} else if (tokens.every(function(t) {return t.type === 'bigram-odd'})) {
			// all tokens are single letter
			tokens.forEach(function(t, i) {
				t.joinStatement = "INNER JOIN "+tokenTable+" tkn"+i+" USING (tid)";
				t.whereStatement = "tkn"+i+".token LIKE '"+sqlEscape(t.token)+"%'";
			});
			sql = sqlSelectDistinct(tokens);
		} else {
			tokens = tokens.filter(function(t) {return t.type !== 'bigram-odd'});
			tokens.forEach(function(t, i) {
				t.joinStatement = "INNER JOIN "+tokenTable+" tkn"+i+" USING (tid)";
				t.whereStatement = "tkn"+i+".token = '"+sqlEscape(t.token)+"'";
			});
			var bigrams = tokens.filter(function(t) {return t.type === 'bigram'});
			var words = tokens.filter(function(t) {return t.type === 'word'}).sort(function(a,b) {return b.token.length - a.token.length});
			tokens = words.concat(bigrams);
			sql = sqlSelectDistinct(tokens);
			if (complexGroups.length) {
				sql += " AND " + complexGroups.map(function(g) {return "txt.text LIKE '%" + sqlEscape(g) + "%'"}).join(" AND ");
			}
		}

		return sql;
	};

	// useful constant regexps
	FullText.separator = /[\s\0-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u00bf\u3000-\u301b]+/;  // \u3000-\u301b is Japanese specific
	FullText.single_word = /[\d\w\u00c0-\u024f]+/; // indexible by word
	FullText.complex_text = /[^\d\w\u00c0-\u024f]+/; // anything other than above

	FullText.tokenize = function(text) {
		// hybrid of spece-separable-word index and bigram (2-gram)
		var tokens = [];
		var n = 0;
		var words = text.split(FullText.separator);
		words.forEach(function(word) {
			word.split(/\b/).forEach(function(segment) {
				if (!segment) return;
				if (FullText.single_word.test(segment)) {
					tokens.push({ token : segment, type : 'word', order : n++ });
				} else {
					for (var i=1, l=segment.length; i<l; i++) {
						tokens.push({ token : segment.substr(i-1, 2), type : 'bigram', order : n++ });
					}
					tokens.push({ token : segment[l-1], type : 'bigram-odd', order : n++ });
				}
			});
		});
		return tokens;
	};

	// groups query by first double-quotations, then by spaces
	FullText.groupQuery = function(query) {
		var group = /(".*?")/;
		return Array.prototype.concat.apply([],
			query.split(group).map(function (s){
				if (group.test(s)) {
					return [RegExp.$1.slice(1, -1)];
				} else {
					return s.split(/\s+/);
				}
			})
		).filter(function(s) {return s !== ''});
	}

	// utilities
	function unique(ary, func) {
		if (!func) return ary.filter(function(value, i) {
			return ary.indexOf(value) == i;
		});
		var props = ary.map(func);
		return ary.filter(function(value, i) {
			return props.indexOf(props[i]) == i;
		});
	}

	sqlEscape = function(text) {
		return sqlLikeEscape((text+'').replace(/\0/g,'').replace(/'/g, "''"));
	}
	sqlLikeEscape = function(text) {
		return (text+'').replace(/&/g,'&#36;').replace(/%/g,'&#37;').replace(/_/g,'&#95;') // compatible with HTML numeric character reference
	}
	sqlLikeUnescape = function(text) {
		return (text+'').replace(/&#95;/g,'_').replace(/&#37;/g,'%').replace(/&#36;/g,'&')
	}
})();
