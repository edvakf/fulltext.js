// fulltext.js
// Version : 0.1.0
// License : The MIT License
//   Copyright (c) 2009 Atsushi Takayama
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
	var FullText = Deferred.WebDatabase.FullText = function(dbName, option) {
		if (!option) option = {};
		option.version = option.version || '1.0';
		option.estimateSize = option.estimateSize || 50*1024*1024; // 50MB

		this.database = new Database(dbName || 'fulltext', option);

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
			date : {
				getter: function(val) {
					if (typeof val == 'undefined') {
						return;
					} else {
						return new Date(val);
					}
				},
				setter: function(val) {
					return val.getTime();
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
	}

	// safe
	FullText.prototype.create = function() {
		var Text = this.Text, Token = this.Token; 
		return db.transaction(function() {
			Text.createTable();
			Token.createTable();
		}
	}

	// unsafe (deletes previously saved records)
	FullText.prototype.dropAndCreate = function() {
		var Text = this.Text, Token = this.Token; 
		var db = this.database;
		return db.transaction(function() {
			Text.dropTable();
			Token.dropTable();
			Text.createTable();
			Token.createTable();
		});
	}

	FullText.prototype.addRecord = function(txt, date) {
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

	FullText.prototype.search = function(query, page, num_per_page) {
		// query like : Shakespear "Romeo and Juliette", where "Romeo and Juliettte" is the exact match
		// page starting from 0 : optional, default 0
		// num_per_page : optional, default 100

		sql = FullText.composeSearchSQL(query);

		num_per_page = Math.max(Math.floor(num_per_page), 0) || 100;
		page = Math.max(Math.floor(page), 0) || 0;
		sql += " ORDER BY txt.date LIMIT " + num_per_page + " OFFSET " + (page * num_per_page) + ";";

		return this.database.execute(sql).next(function(res) {
				var tids = [];
				var rows = res.rows;
				for(var i=0, l=rows.length; i<l; i++) {
					tids.push(rows.item(i).tid);
				}
				return tids;
			});
	};

	FullText.composeSearchSQL = function(query) {
		var tokens = unique( FullText.tokenize(query), function(t) {return t.token} );
		var groups = FullText.groupQuery(query);
		var complexGroups = groups.filter(function (g){return FullText.complex_text.test(g)}); // non-trivial text group

		function joinJoin(tokens) {return tokens.map(function(t) {return t.joinStatement}).join(" ")};
		function joinWhere(tokens) {return tokens.map(function(t) {return t.whereStatement}).join(" AND ")};
		function sqlSelectDistinct(tokens) {return ["SELECT DISTINCT txt.tid FROM",textTable,"txt",joinJoin(tokens),"WHERE",joinWhere(tokens)].join(" ")};

		var sql;
		if (tokens.length === 0) {
			if (groups.length === 0) {
				sql = "SELECT txt.tid FROM "+textTable+" txt";
			} else {
				sql = "SELECT DISTINCT txt.tid FROM "+textTable+" txt WHERE "+groups.map(function(g) {return "txt.text LIKE '%" + sqlEscape(g) + "%'"}).join(" AND ");
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

	FullText.separator = /[\s\0-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u00bf\u3000-\u301b]+/;  // \u3000-\u301b is Japanese specific
	FullText.single_word = /[\d\w\u00c0-\u024f]+/; // indexible by word
	FullText.complex_text = /[^\d\w\u00c0-\u024f]+/; // anything other than above

	FullText.tokenize = function(text) {
		// hybrid of separable-word index and bigram (2-gram)
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

	// utility
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
		return (text+'').replace(/\0/g,'').replace(/'/g, "''");
	}
})();
