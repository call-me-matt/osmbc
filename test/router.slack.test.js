"use strict";

var should    = require('should');
var http      = require('http');
var request   = require('request');
var async     = require('async');
var nock      = require('nock');

var testutil  = require('./testutil.js');

var config    = require('../config.js');
var app       = require('../app.js');

var slackRouter = require('../routes/slack.js');
var articleModule = require('../model/article.js');
var logModule = require('../model/logModule.js');


describe('router/slack',function(){
  var link;
  var server;
  var user_name;
  var user_id;

  function talk(query,answer,cb) {
    should.exist(user_name);
    should.exist(user_id);
    var opts = {
      url: link, method: 'post',
      json: {token: "testtoken", user_name: user_name, user_id: user_id, text: query}
    };
    request(opts, function (err, res, body) {
      should.not.exist(err);

      console.log(body);

      should(res.statusCode).eql(200);
      should(res.body.token).eql("testtoken");
      should(res.body.user_id).eql(user_id);
      should(res.body.user_name).eql(user_name);
      should(res.body.username).eql("testbc");
      should(res.body.text).eql(answer);
      cb();
    });
  }
  function findArticle(a,cb) {
    articleModule.find(a,function(err,result){
      //console.dir(result);
      should.not.exist(err);
      should.exist(result);
      should(result.length).eql(1);
      cb();
    });
  }
  function findLog(l,cb) {
    logModule.find(l,function(err,logs){

      should.not.exist(err);
      if (logs.length!==1) {
        should(l).eql("NOT FOUND IN LOGS");
      }
      cb();
    });
  }


  before(function() {
    server = http.createServer(app).listen(config.getServerPort());
    link = 'http://localhost:' + config.getServerPort() + config.getValue("htmlroot") + "/slack/create/wn";

    nock('https://hooks.slack.com/')
      .post(/\/services\/.*/)
      .times(999)
      .reply(200,"ok");
    testutil.nockHtmlPages();

    process.env.TZ = 'Europe/Amsterdam';
  });
  after(function(){
    server.close();
    testutil.nockHtmlPagesClear();
    nock.cleanAll();
  });
  beforeEach(function (bddone) {


    async.series([
      testutil.importData.bind(null, {
        clear: true,
        user: [{OSMUser: "TestInteractive", SlackUser: "TestSlackInteractive", slackMode: "interactive"},
          {OSMUser: "ExistsTwice1", SlackUser: "ExistsTwice", slackMode: "interactive"},
          {OSMUser: "ExistsTwice2", SlackUser: "ExistsTwice", slackMode: "interactive"},
          {OSMUser: "TestUseTBC", SlackUser: "TestSlackUseTBC", slackMode: "useTBC"}],
        blog:[{name:"blog",status:"open"}]
      })
    ], bddone);
  });
  describe("searchUrlInSlack",function(){
    it('should extract different urls',function(){
      let s = slackRouter.fortestonly.searchUrlInSlack;
      should(s("<https://www.google.de>")).eql("https://www.google.de");
      should(s("text before <https://www.google.de> after")).eql("https://www.google.de");
      should(s("<https://www.google.de> only text after")).eql("https://www.google.de");
      should(s("<https://twitter.com/pascal_n/status/726503865298894849>")).eql("https://twitter.com/pascal_n/status/726503865298894849");
      should(s("<https://linkExists.org/already>")).eql("https://linkExists.org/already");
    });
  });
  describe("extractTextWithoutUrl",function(){
    it('should extract different texts',function(){
      let s = slackRouter.fortestonly.extractTextWithoutUrl;
      should(s("<https://www.google.de>")).eql("");
      should(s("text before <https://www.google.de> after")).eql("text before  after");
      should(s("<https://www.google.de> only text after")).eql(" only text after");
    });
  });
  describe("unauthorised access",function() {
    it("should ignore request with wrong API Key", function (bddone) {
      var opts = {url: link, method: 'post'};
      request(opts, function (err, res) {
        should.not.exist(err);
        should(res.statusCode).eql(401);
        // if server returns an actual error
        bddone();
      });
    });
    it("should ignore request without known user", function (bddone) {
      user_name = "NotThere";
      user_id = "33";
      talk("Hello Boy", "<@33> I never heard from you. Please enter your Slack Name in <https://testosm.bc/usert/self|OSMBC>", bddone);
    });
    it("should give a hint if user is not unique", function (bddone) {
      user_name = "ExistsTwice";
      user_id = "33";
      talk("Hello Boy", "<@33> is registered more than once in <https://testosm.bc/usert/self|OSMBC>", bddone);
    });
  });
  describe("useTBC Mode",function(){
    it("should store an URL",function(bddone) {
      user_name = "TestSlackUseTBC";
      user_id = "55";
      async.series([
        talk.bind(null,"<http://forum.openstreetmap.org/viewtopic.php?id=53173>", "<https://testosm.bc/article/1|Internationale Admingrenzen 2016 / users: Germany> created.\n"),

        // search for the already exists article, that only should exist ONCE
        findArticle.bind(null,{title:"Internationale Admingrenzen 2016 / users: Germany",collection:"http://forum.openstreetmap.org/viewtopic.php?id=53173",blog:"TBC"})
      ],bddone);
    });
    it("should store an URL",function(bddone) {
      user_name = "TestSlackUseTBC";
      user_id = "55";
      async.series([
        talk.bind(null,"This text comes with a title <http://forum.openstreetmap.org/viewtopic.php?id=53173>", "<https://testosm.bc/article/1|This text comes with a title> created.\n"),

        // search for the already exists article, that only should exist ONCE
        findArticle.bind(null,{title:"This text comes with a title",collection:"http://forum.openstreetmap.org/viewtopic.php?id=53173",blog:"TBC"}),
        findLog.bind(null,{table:"article",user:"TestUseTBC",property:"collection",to:"http://forum.openstreetmap.org/viewtopic.php?id=53173"}),
        findLog.bind(null,{table:"article",user:"TestUseTBC",property:"title",to:"This text comes with a title"})
      ],bddone);
    });
    it("should store only store urls",function(bddone) {
      user_name = "TestSlackUseTBC";
      user_id = "55";
      async.series([
        talk.bind(null,"Text without a title", "<@55> Please enter an url.")
     ],bddone);
    });
  });
});




