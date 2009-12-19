
var Database = Deferred.WebDatabase;
var db = new Database('wikipedia');

var ft = new Database.FullText();
var Article = new Database.Model({
	table: 'article',
	primaryKeys: ['tid'],
	fields : {
		tid: 'INTEGER PRIMARY KEY',
		title : 'TEXT'
	}
}, db);

function $(id){return document.getElementById(id)};

var _query;
var _time;
var _page = 0;

window.onload = function() {
  var searchbox = $('searchbox');
  searchbox.addEventListener('keyup', function(e) {
    var query = searchbox.value;
    if (query == _query) return;
    _query = query;

    return search(query, 0);
  }, false);
}

function findTexts(query, page) {
  var t = new Date;
  _page = page||0;
  return ft.search(query, page, 10)
  .next(function(res) {
    _time = new Date - t;
    return res;
  })
}

function findArticles(texts) {
  return Deferred.parallel(
    texts.map(function(text) {
      return Article.findFirst({where : {tid : text.tid}})
        .next(function(a) {return {title: a.title, text: text.text};})
    })
  )
}

function showResults(query, articles) {
  if (_query != query) return;
  var results = $('results');
  results.style.display = 'none';
  results.innerHTML = '';
  articles.forEach(function(a) {
    var titlebox = $('results-template').querySelector('.title').cloneNode(true);
    var textbox = $('results-template').querySelector('.text').cloneNode(true);
    titlebox.firstChild.textContent = a.title;
    titlebox.firstChild.href = 'http://ja.wikipedia.org/'+a.title;
    textbox.textContent = a.text;
    results.appendChild(titlebox);
    results.appendChild(textbox);
  });
  var len = articles.length;
  if (len == 10) {
    var info = 'Results <b>'+ (_page*10) + ' - ' + (_page+1)*10 + '</b> for <b>' + query.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '<b>. (<b>' + _time + ' ms</b>) <a href="javascript:search(_query, _page+1)">Show Next</a>';
  } else if (len) {
    var info = 'Results <b>'+ (_page*10) + ' - ' + (_page*10+len) + '</b> for <b>' + query.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '<b>. (<b>' + _time + ' ms</b>)';
  } else {
    var info = 'No results for ' + query.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  var div = document.createElement('div');
  div.className = 'info';
  div.innerHTML = info;
  results.insertBefore(div, results.firstChild);
  results.style.display = 'block';
}

function search(query, page) {
  return findTexts(query, page).next(findArticles).next(function(articles) {
    showResults(query, articles);
  }).error(function(e){console.log(e)});
}
