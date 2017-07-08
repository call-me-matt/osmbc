"use strict";
// Exported Functions and prototypes are defined at end of file

var async    = require("async");
var config   = require("../config.js");
var logger   = require("../config.js").logger;
var markdown = require("markdown-it")()
          .use(require("markdown-it-sup"))
          .use(require("markdown-it-imsize"), { autofill: true });

var mdFigCaption = require("mdfigcaption");
markdown.use(mdFigCaption);

var should   = require("should");
var moment   = require("moment");

var articleModule       = require("../model/article.js");
var configModule        = require("../model/config.js");
var logModule           = require("../model/logModule.js");
var messageCenter       = require("../notification/messageCenter.js");
var userModule          = require("../model/user.js");
var schedule            = require("node-schedule");

var pgMap = require("./pgMap.js");
var debug = require("debug")("OSMBC:model:blog");








function Blog(proto) {
  debug("Blog");
  this.id = 0;
  if (!proto || (proto && !proto.categories)) {
    this.categories = configModule.getConfig("categorytranslation");
  }
  if (proto) {
    for (var k in proto) {
      this[k] = proto[k];
    }
  }
}

Blog.prototype.getTable = function getTable() {
  return "blog";
};

function create (proto) {
  debug("create");
  return new Blog(proto);
}


// setAndSave(user,data,callback)
// user: actual username for logging purposes
// data: json with values that has to be changed
// Function will change the given values and create for every field,
// where the value differes from representation in memory a log entry.
// at the end, the blog value is written in total
// This is may be relevant for concurrent save
// as there is no locking with version numbers yet.
Blog.prototype.setAndSave = function setAndSave(user, data, callback) {
  debug("setAndSave");
  should(typeof (user)).eql("object");
  var self = this;
  delete self.lock;
  articleModule.removeOpenBlogCache();
  async.series([
    function checkID(cb) {
      if (self.id === 0) {
        self.save(cb);
      } else cb();
    },
    function logit(cb) {
      messageCenter.global.updateBlog(user, self, data, cb);
    },

    function(cb) {
      should.exist(self.id);
      should(self.id).not.equal(0);
      for (var key in data) {
        var value = data[key];
        if (typeof (value) === "undefined") continue;
        if (value === self[key]) continue;
        if (value === "" && typeof (self[key]) === "undefined") continue;
        if (Blog.prototype.hasOwnProperty(key)) {
          logger.info("WARNING: Do not store " + data[key] + " for property " + key + " for Blog ID " + self.id);
          continue;
        }
        if (typeof (value) === "object") {
          if (JSON.stringify(value) === JSON.stringify(self[key])) continue;
        }
        self[key] = value;
      }
      cb();
    }], function(err) {
    if (err) return callback(err);
    self.startCloseTimer();
    self.save(callback);
  }
  );
};



Blog.prototype.setReviewComment = function setReviewComment(lang, user, data, callback) {
  debug("reviewComment");
  var self = this;
  var rc = "reviewComment" + lang;
  var exported = "exported" + lang;
  should(typeof (user)).eql("object");
  async.series([
    function checkID(cb) {
      if (self.id === 0) {
        self.save(cb);
      } else cb();
    }
  ], function() {
    should.exist(self.id);
    should(self.id).not.equal(0);
    if (typeof (data) === "undefined") return callback();
    if (typeof (self[rc]) === "undefined" || self[rc] === null) {
      self[rc] = [];
    }
    for (var i = 0; i < self[rc].length; i++) {
      if (self[rc][i].user === user && self[rc][i].text === data) return callback();
    }
    async.series([
      function logInformation(cb) {
        debug("setReviewComment->logInformation");
        messageCenter.global.sendLanguageStatus(user, self, lang, data, cb);
          // This is the old log and has to be moved to the messageCenter (logReceiver)
          // messageCenter.global.sendInfo({oid:self.id,blog:self.name,user:user,table:"blog",property:rc,from:"Add",to:data},callback);
      },
      function checkSpecialCommands(cb) {
        debug("setReviewComment->checkSpecialCommands");
        var date = new Date();
        if (data === "startreview") {
            // Start Review, check wether review is done in WP or not
          if (self[rc].length === 0) {
            self[rc].push({user: user.OSMUser, text: data, timestamp: date});
          }
          if (config.getValue("ReviewInWP").indexOf(lang) >= 0) {
            self[exported] = true;
              // Write Startreview to the review Array, do document Start in Blog


              // Review is set on WP, so the blog can be marked as exoprted
            messageCenter.global.sendLanguageStatus(user, self, lang, "markexported", cb);
              // This is the old log, that has to be moved to the messageCenter
              // messageCenter.global.sendInfo({oid:self.id,blog:self.name,user:user,table:"blog",property:rc,from:"Add",to:"markexported"},cb);
            return;
          }
            // nothing has to be written to the review comments
          return cb();
        }
        if (data === "markexported") {
          self[exported] = true;
            // nothing has to be written to review Comment
          return cb();
        }
        for (let i = 0; i < self[rc].length; i++) {
          if (self[rc][i].text === "reviewing..." && self[rc][i].user === user.OSMUser) {
            self[rc][i].text = data;
            self[rc][i].editstamp = date;
            return cb();
          }
        }
        self[rc].push({user: user.OSMUser, text: data, timestamp: date});
        return cb();
      }
    ], function(err) {
      debug("setReviewComment->FinalFunction");
      if (err) return callback(err);
      self.save(callback);
    });
  });
};


Blog.prototype.editReviewComment = function editReviewComment(lang, user, index, data, callback) {
  debug("reviewComment");
  var self = this;
  var rc = "reviewComment" + lang;
  should(typeof (user)).eql("object");
  async.series([
    function checkID(cb) {
      if (self.id === 0) {
        self.save(cb);
      } else cb();
    }
  ], function() {
    should.exist(self.id);
    should(self.id).not.equal(0);
    if (typeof (data) === "undefined") return callback();
    if (typeof (self[rc]) === "undefined" || self[rc] === null) {
      self[rc] = [];
    }
    // Index out of range, just
    if (index < 0 || index >= self[rc].length) return callback(new Error("Edit Review Comment, Index out of Range"));


    if (self[rc][index].user !== user.OSMUser) return callback(new Error(">" + user.OSMUser + "< is not allowed to change review"));

    // nothing to change.
    if (self[rc][index].text === data) return callback();

    async.series([
      function logInformation(cb) {
        debug("editReviewComment->logInformation");
        messageCenter.global.sendLanguageStatus(user, self, lang, data, cb);
        // This is the old log and has to be moved to the messageCenter (logReceiver)
        // messageCenter.global.sendInfo({oid:self.id,blog:self.name,user:user,table:"blog",property:rc,from:"Add",to:data},callback);
      },
      function setValues(cb) {
        debug("editReviewComment->setValues");
        var date = new Date();

        self[rc][index].text = data;
        self[rc][index].editstamp = date;
        return cb();
      }
    ], function(err) {
      debug("setReviewComment->FinalFunction");
      if (err) return callback(err);
      self.save(callback);
    });
  });
};


Blog.prototype.closeBlog = function closeBlog(lang, user, status, callback) {
  debug("closeBlog");
  should(typeof (user)).eql("object");
  var self = this;
  var closeField = "close" + lang;

  if (self[closeField] === status) return callback();
  async.series([
    function checkID(cb) {
      if (self.id === 0) {
        self.save(cb);
      } else cb();
    }
  ], function() {
    should.exist(self.id);
    should(self.id).not.equal(0);
    async.series([
      function logEntry(callback) {
        messageCenter.global.sendCloseStatus(user, self, lang, status, callback);
      },
      function setCloseField(callback) {
        self[closeField] = status;
        callback();
      },
      function removeReview(callback) {
          // Blog is reopened, so delete any review information
          // e.g. that review is started.
          // if there is some "substantial" review information (a review comment),
          // keep it and do not delete anythingx
        if (status === false) {
          if (self["reviewComment" + lang] && self["reviewComment" + lang].length === 0) {
            delete self["reviewComment" + lang];
          }
          if (self["reviewComment" + lang] && self["reviewComment" + lang].length === 1) {
            if (self["reviewComment" + lang][0].text === "startreview") {
              delete self["reviewComment" + lang];
            }
          }
          self["exported" + lang] = false;
        }
        callback();
      }
    ], function finalFunction(err) {
      if (err) return callback(err);
      self.save(callback);
    });
  });
};

// find(object,order,callback)
// object (optional) find Objects, that conform with all values in the object
// order (optional)  field to sort by
module.exports.find = function find(obj1, obj2, callback) {
  debug("find");
  pgMap.find({table: "blog", create: create}, obj1, obj2, callback);
};

// find(id,callback)
// id find Objects with ID
module.exports.findById = function findById(id, callback) {
  debug("findById %s", id);
  pgMap.findById(id, {table: "blog", create: create}, callback);
};

// findOne(object,order,callback)
module.exports.findOne = function findOne(obj1, obj2, callback) {
  debug("findOne");
  pgMap.findOne({table: "blog", create: create}, obj1, obj2, callback);
};

// Create a blog in the database,
// createNewBlog(proto,callback)
// for parameter see create
// proto is not allowed to have an id, this is generated by the database
// and stored into the object
function createNewBlog(user, proto, callback, noArticle) {
  debug("createNewBlog");
  should(typeof (user)).eql("object");
  if (typeof (proto) === "function") {
    callback = proto;
    proto = null;
  }
  if (proto) should.not.exist(proto.id);

  exports.findOne(" where data->>'name' like 'WN%'", {column: "name", desc: true}, function(err, result) {
    if (err) return callback(err);
    var blog = create();
    var name = "WN250";
    var endDate = new Date();
    if (result) {
      if (result.name.substring(0, 2) === "WN") {
        name = result.name;
        if (result.endDate && typeof (result.endDate) !== "undefined") {
          endDate = new Date(result.endDate);
        }
      }
    }
    debug("Maximum Blog Name in DB: %s", name);
    var wnId = name.substring(2, 99);
    var newWnId = parseInt(wnId) + 1;
    var newName = "WN" + newWnId;
    var startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() + 1);
    endDate.setDate(endDate.getDate() + 7);
    blog.name = newName;
    blog.status = "open";
    blog.startDate = startDate.toISOString();
    blog.endDate = endDate.toISOString();
    for (var k in proto) {
      blog[k] = proto[k];
    }
    var change = {};
    change.name = blog.name;
    change.status = blog.status;
    change.startDate = blog.startDate;
    change.endDate = blog.endDate;
    // create an Empty blog and simualte an id != 0
    var emptyBlog = exports.create();
    emptyBlog.id = -1;

    async.series([
      function createCalendar(cb) {
        if (noArticle) return cb();
        articleModule.createNewArticle({blog: blog.name, categoryEN: "Upcoming Events", title: blog.name + " Upcoming Events"}, cb);
      },
      function createCalendar(cb) {
        if (noArticle) return cb();
        articleModule.createNewArticle({blog: blog.name, categoryEN: "Picture", title: blog.name + " Picture"}, cb);
      }
    ],
      function finalFunction(err) {
        if (err) return callback(err);
        blog.save(function feedback(err, savedblog) {
          if (err) return callback(err);
          emptyBlog.id = savedblog.id;
          messageCenter.global.updateBlog(user, emptyBlog, change, function(err) {
            if (err) {
              return callback(err);
            }
            return callback(null, savedblog);
          });
        });
      }
    );
  });
}

Blog.prototype.autoClose = function autoClose(cb) {
  debug("autoClose");
  if (!this.endDate) return cb();

  var time = new Date().getTime();
  var endDateBlog = (new Date(this.endDate)).getTime();
  if (endDateBlog <= time) {
    var changes = {status: "edit"};
    this.setAndSave({OSMUser: "autoclose"}, changes, function(err) {
      cb(err);
    });
  } else cb();
};

var _autoCloseRunning = false;



function autoCloseBlog(callback) {
  debug("autoCloseBlog");
  // Do not run this function twice !
  if (_autoCloseRunning) return callback();
  _autoCloseRunning = true;




  exports.find({status: "open"}, {column: "endDate", desc: false}, function(err, result) {
    if (err) {
      _autoCloseRunning = false;
      return callback(err);
    }
    if (!result) {
      _autoCloseRunning = false;
      return callback();
    }
    async.series([
      function closeAllBlogs(cb) {
        async.each(result, function(data, cb) {
          data.autoClose(cb);
        }, function finish() { cb(); });
      },
      function createNewBlog(cb) {
        exports.findOne({status: "open"}, function(err, result) {
          if (err) return cb(err);
          if (!result) {
            exports.createNewBlog({OSMUser: "autocreate"}, cb);
            return;
          }
          cb();
        });
      }
    ], function(err) {
      _autoCloseRunning = false;
      callback(err);
    });
  });
}

function convertLogsToTeamString(logs, lang, users) {
  debug("convertLogsToTeamString");
  var editors = [];
  function addEditors(property, min) {
    for (var user in logs[property]) {
      if (logs[property][user] >= min) {
        if (editors.indexOf(user) < 0) {
          editors.push(user);
        }
      }
    }
  }
  addEditors("collection", 3);
  addEditors("markdown" + lang, 2);
  addEditors("reviewComment" + lang, 1);
  editors.sort();
  if (users && lang === "DE") {
    for (var i = 0; i < editors.length; i++) {
      for (var j = 0; j < users.length; j++) {
        if (editors[i] === users[j].OSMUser) {
          // Ignore the editor, if he wants to be anonymous
          if (users[j].WNAuthor && users[j].WNAuthor === "anonymous") {
            editors.splice(i,i+1);
            i=i-1;
            j=9999;
            continue;
          }
          if (users[j].WNAuthor && users[j].WNPublicAuthor && users[j].WNPublicAuthor !== "Not Found") {
            editors[i] = '<a href="http://blog.openstreetmap.de/blog/author/' + users[j].WNAuthor + '">' + users[j].WNPublicAuthor + "</a>";
          }
        }
      }
    }
  }
  var editorsString = "";
  if (editors.length >= 1) editorsString = editors[0];
  for (var i2 = 1; i2 < editors.length; i2++) {
    editorsString += ", " + editors[i2];
  }

  var editorStrings = configModule.getConfig("editorstrings");
  if (editorStrings[lang]) return editorStrings[lang].replace("##team##", editorsString);
  return "";
}


Blog.prototype.createTeamString = function createTeamString(lang, callback) {
  debug("createTeamString");
  should(typeof (lang)).eql("string");
  should(typeof (callback)).eql("function");
  var self = this;
  var logs;
  var users = null;
  async.series([
    function readLogs(cb) {
      logModule.countLogsForBlog(self.name, function (err, result) {
        if (err) return cb(err);
        logs = result;
        return (cb(null));
      });
    }, function readusers(cb) {
      userModule.find({}, function(err, result) {
        if (err) return cb(err);
        users = result;
        cb();
      });
    }], function finalFunction(err) {
    if (err) return callback(err);
    var result = convertLogsToTeamString(logs, lang, users);
    return callback(null, result);
  });
};



/* Sort a list of articles with predecessorId Help
Input: array or articles
Output: Array of articles, that has the same order than input
but respecting the predecessorId requirenment.
If several articles have the same predecessorId the result is undefined
Output: an array of articles.
 */
function sortArticles(listOfArticles) {
  debug("sortArticles");
  var result = [];
  var laterUse = [];
  listOfArticles.sort(function(a, b) {
    return ((a.title) ? a.title : "").localeCompare((b.title) ? b.title : "");
  });
  for (let p = 0; p < listOfArticles.length; p++) {
    if (listOfArticles[p].predecessorId) {
      laterUse.push(listOfArticles[p].id);
    }
  }
  while (listOfArticles.length > 0) {
    let searchfor = "0";
    if (result.length > 0) searchfor = result[result.length - 1].id;
    let found = false;
    for (let p = 0; p < listOfArticles.length; p++) {
      if (listOfArticles[p].predecessorId === searchfor) {
        let a = listOfArticles[p];
        listOfArticles.splice(p, 1);
        result.push(a);
        found = true;
        break;
      }
    }
    if (!found) {
      for (let p = 0; p < listOfArticles.length; p++) {
        if (laterUse.indexOf(listOfArticles[p].id) < 0) {
          let a = listOfArticles[p];
          listOfArticles.splice(p, 1);
          result.push(a);
          found = true;
          break;
        }
      }
    }
    if (!found) {
      let a = listOfArticles[0];
      listOfArticles.splice(0, 1);
      result.push(a);
    }
  }
  return result;
}

function calculateDependend(article, cb) {
  debug("calculateDependend");

  async.series([
    article.calculateDerivedFromChanges.bind(article),
    article.calculateDerivedFromSourceId.bind(article)
  ], cb);
}
// Generate Articles and Category for rendering a preview by a JADE Template
Blog.prototype.getPreviewData = function getPreviewData(options, callback) {
  debug("getPreviewData");
  should(typeof (options)).eql("object");
  should(typeof (callback)).eql("function");
  var lang = options.lang;
  var self = this;


  var articles = {};
  var teamString = "";

  var futureArticles;

  var articleList = null;
  var containsEmptyArticlesWarning = false;

  async.series([
    function readFuture(cb) {
      debug("readFuture");
      articleModule.find({blog: "Future"}, {column: "title"}, function(err, result) {
        if (err) return cb(err);
        if (result) futureArticles = result;
        return cb();
      });
    },
    function readArticlesWithCollector(cb) {
      debug("readArticlesWithCollector");
      articleModule.find({blog: self}, {column: "title"}, function (err, result) {
        if (err) return cb(err);
        if (options.collectors) {
          async.each(result, calculateDependend, function finalFunction(err) {
            if (err) return cb(err);
            articleList = result;
            return cb();
          });
        } else {
          articleList = result;
          return cb();
        }
      });
    },
    function organiseArticles(cb) {
      debug("organiseArticles");



      var i; // often used iterator, declared here because there is no block scope in JS.
      for (i = 0; i < articleList.length; i++) {
        var r = articleList[i];

        // remove no translation article, if wanted
        if (options.disableNotranslation && r["markdown" + options.lang] === "no translation") continue;
        if (options.errorOnEmptyMarkdown && r.categoryEN !== "--unpublished--" &&
          (!r["markdown" + options.lang] || r["markdown" + options.lang].trim() === "")) {
          return cb(new Error("Article >>" + r.title + "<< contains no text for language " + options.lang + "."));
        }
        if (options.warningOnEmptyMarkdown && r.categoryEN !== "--unpublished--" &&
          (!r["markdown" + options.lang] || r["markdown" + options.lang].trim() === "")) {
          containsEmptyArticlesWarning = true;
        }
        if (typeof (articles[r.categoryEN]) === "undefined") {
          articles[r.categoryEN] = [];
        }
        articles[r.categoryEN].push(r);
      }
      for (let c in articles) {
        let r = sortArticles(articles[c]);
        articles[c] = r;
      }
      cb(null);
    },
    function createTeam(cb) {
      debug("createTeam");
      if (options.createTeam && lang) {
        self.createTeamString(lang, function (err, result) {
          if (err) return cb(err);
          teamString = result;
          return cb();
        });
      } else return cb();
    }

  ], function finalFunction(err) {
    debug("finalFunction");

    if (err) return callback(err);
    var result = {};
    result.teamString = teamString;
    result.articles = articles;
    result.futureArticles = {};
    futureArticles.forEach(function (a) {
      if (!result.futureArticles[a.categoryEN]) result.futureArticles[a.categoryEN] = [];
      result.futureArticles[a.categoryEN].push(a);
    });

    if (containsEmptyArticlesWarning) result.containsEmptyArticlesWarning = true;
    callback(null, result);
  });
};

Blog.prototype.calculateTimeToClose = function calculateTimeToClose(callback) {
  debug("Blog.prototype.calculateTimeToClose");
  if (this._timeToClose) return callback();
  var self = this;
  self._timeToClose = {};
  logModule.find(" where data->>'blog' ='" + self.name + "' and data->>'property' like 'close%'", function(err, result) {
    if (err) return callback(err);
    if (!result) return callback();
    var endDate = moment(self.endDate);
    for (var i = 0; i < result.length; i++) {
      var lang = (result[i].property).substring(5, 7);
      var time = moment(result[i].timestamp);
      var timeToClose = time.diff(endDate, "days");
      if (!self._timeToClose[lang] || timeToClose > self._timeToClose[lang]) self._timeToClose[lang] = timeToClose;
    }
    return callback();
  });
};

Blog.prototype.calculateDerived = function calculateDerived(user, callback) {
  debug("countUneditedMarkdown");
  should.exist(user);
  // already done, nothing to do.
  if (this._countUneditedMarkdown) return callback();
  var self = this;

  self._countUneditedMarkdown = {};
  self._countExpectedMarkdown = {};
  self._countNoTranslateMarkdown = {};

  self._userMention = [];
  self._mainLangMention = [];
  self._secondLangMention = [];

  self._tbcOwnArticleNumber = 0;

  self._unsolvedComments = {};

  self._usedLanguages = {};
  self._upcomingEvents = null;
  var mainLang = user.mainLang;
  var secondLang = user.secondLang;
  var i, j;

  articleModule.find({blog: self}, function (err, result) {
    if (err) return callback(err);


    for (i = 0; i < config.getLanguages().length; i++) {
      var l = config.getLanguages()[i];
      if (!result) {
        self._countUneditedMarkdown[l] = 99;
        self._countExpectedMarkdown[l] = 99;
        self._countNoTranslateMarkdown[l] = 99;
        self._unsolvedComments[l] = 99;
      } else {
        self._countUneditedMarkdown[l] = 0;
        self._countExpectedMarkdown[l] = 0;
        self._countNoTranslateMarkdown[l] = 0;
        self._unsolvedComments[l] = 0;
        for (j = 0; j < result.length; j++) {
          let article = result[j];
          var c = article.categoryEN;
          if (c === "Upcoming Events") self._upcomingEvents = article;
          if (c === "--unpublished--") continue;
          self._countExpectedMarkdown[l] += 1;
          var m = article["markdown" + l];
          if (m === "no translation") {
            self._countNoTranslateMarkdown[l] += 1;
          } else {
            if (!m || m === "" || c === "-- no category yet --") {
              self._countUneditedMarkdown[l] += 1;
            }
          }
          // check, wether language is used in blog
          if (m && m !== "no translation") self._usedLanguages[l] = true;
          if (article.commentList && article.commentStatus === "open") {
            if (!m || m !== "no translation") self._unsolvedComments[l] += 1;
          }
        }
      }
    }
    if (!result) return callback();
    for (i = 0; i < result.length; i++) {
      if (self.name === "TBC") {
        if (result[i].firstCollector === user.OSMUser) {
          self._tbcOwnArticleNumber += 1;
        }
      }
      if (result[i].commentList) {
        if (result[i].commentStatus === "solved") continue;
        for (j = 0; j < result[i].commentList.length; j++) {
          var comment = result[i].commentList[j].text;

          if (comment.search(new RegExp("@" + user.OSMUser, "i")) >= 0) {
            self._userMention.push(result[i]);
            break;
          }
          if ((comment.search(new RegExp("@" + mainLang, "i")) >= 0) ||
            (comment.search(new RegExp("@all", "i")) >= 0) ||
            (comment.search(new RegExp("@all", "i")) >= 0)) {
            self._mainLangMention.push(result[i]);
            break;
          }
          if ((comment.search(new RegExp("@" + secondLang, "i")) >= 0) ||
            (comment.search(new RegExp("@all", "i")) >= 0) ||
            (comment.search(new RegExp("@all", "i")) >= 0)) {
            self._secondLangMention.push(result[i]);
            break;
          }
        }
      }
    }
    return callback();
  });
};


function translateCategories(cat) {
  debug("translateCategories");
  var languages = config.getLanguages();
  var categoryTranslation = configModule.getConfig("categorytranslation");
  for (var i = 0; i < cat.length; i++) {
    for (var l = 0; l < languages.length; l++) {
      var lang = languages[l];
      if (cat[i][lang]) continue;
      if (categoryTranslation[cat[i].EN]) {
        cat[i][lang] = categoryTranslation[cat[i].EN][lang];
      }


      if (!cat[i][lang]) cat[i][lang] = cat[i].EN;
    }
  }
}


function getGlobalCategories() {
  return configModule.getConfig("categorytranslation");
}

Blog.prototype.getCategories = function getCategories() {
  debug("getCategories");

  var result = getGlobalCategories();
  if (this.categories) {
    translateCategories(this.categories);
    result = this.categories;
  }

  return result;
};



var pgObject = {};

pgObject.createString = "CREATE TABLE blog (  id bigserial NOT NULL,  data json,  \
                  CONSTRAINT blog_pkey PRIMARY KEY (id) ) WITH (  OIDS=FALSE);";

pgObject.indexDefinition = {
  "blog_status_idx": "CREATE INDEX blog_status_idx ON blog USING btree (((data ->> 'status'::text)))"
};

pgObject.viewDefinition = {};
pgObject.table = "blog";

module.exports.pg = pgObject;



Blog.prototype.isEditable = function isEditable(lang) {
  debug("isEditabe");
  var result = true;
  if (this["exported" + lang]) {
    result = false;
  }
  var closeLANG = this["close" + lang];
  if (typeof (closeLANG) !== "undefined") {
    if (closeLANG) result = false;
  }
  return result;
};


var _allTimer = {};

Blog.prototype.startCloseTimer = function startCloseTimer() {
  debug("startCloseTimer");

  // if there is a timer, stop it frist, than decide a new start
  if (_allTimer[this.id]) {
    _allTimer[this.id].cancel();
    _allTimer[this.id] = null;
  }
  if (this.status !== "open") return;
  if (this.endDate) {
    var date = new Date(this.endDate);
    _allTimer[this.id] = schedule.scheduleJob(date, function() {
      exports.autoCloseBlog(function() {});
    });
  }
};

exports.startAllTimers = function startAllTimers(callback) {
  debug("startAllTimers");
  exports.find({status: "open"}, function(err, result) {
    if (err) return callback(err);
    if (!result) return callback();
    for (var i = 0; i < result.length; i++) {
      result[i].startCloseTimer();
    }
    exports.autoCloseBlog(callback);
  });
};


module.exports.getTBC = function() {
  debug("getTBC");
  let blog = create({name: "TBC", version: -1, status: "Action List"});
  return blog;
};


Blog.prototype.getBlogName = function(lang) {
  if (lang === "DE") return "Wochennotiz";
  return "Weekly";
};


Blog.prototype.getStatus = function(lang) {
  let status = this.status;
  if (this["reviewComment" + lang]) status = "Review " + lang;
  if (this["exported" + lang]) status = "Export " + lang;
  if (this["close" + lang]) status = "Close " + lang;
  return status;
};

Blog.prototype.save = pgMap.save;

// Define it on BlogModule level to (for no Blog Specified)
module.exports.getCategories = getGlobalCategories;

// Creation Functions

// Create a blog in memory with a given prototype
// create(proto)
// proto: (optional) JSON Data, to copy for the new object
//         the copy is a flat copy
module.exports.create = create;

module.exports.createNewBlog = createNewBlog;

module.exports.autoCloseBlog = autoCloseBlog;

// sort article
module.exports.sortArticles = sortArticles;

