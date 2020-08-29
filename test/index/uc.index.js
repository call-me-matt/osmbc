"use strict";

/* jshint ignore:start */

var async = require("async");
var testutil = require("../testutil.js");
var should  = require("should");
var nock = require("nock");

var userModule = require("../../model/user.js");
var articleModule = require("../../model/article.js");
var blogModule = require("../../model/blog.js");

var mockdate = require("mockdate");
const puppeteer = require('puppeteer');






describe("uc/index", function() {
  this.timeout(20000);
  this.retries(3);
  let browser;
  let pageTheFive;
  let theFiveContext;
  nock("https://hooks.slack.com/")
    .post(/\/services\/.*/)
    .times(999)
    .reply(200, "ok");
  before(async function() {
    let headless = true;
    if (process.env.PUPPETEER_HEADLESS === "FALSE") headless = false;
    browser = await puppeteer.launch({headless:headless}); //{headless:false,slowMo: 250}
  });
  after(async function(){
    if (browser && (process.env.PUPPETEER_HEADLESS !== "FALSE")) {
      await browser.close();
    }
  })
  beforeEach(async function() {
    mockdate.set(new Date("2016-05-25T20:00"));
    await testutil.clearDB();
    await userModule.createNewUser({OSMUser: "TheFive", access: "full", language: "DE", email: "a@b.c"});
    await userModule.createNewUser({OSMUser: "OldUser", access: "full", lang: "EN", email: "d@e.f", lastAccess: "2016-02-25T20:00"});
    await userModule.createNewUser({OSMUser: "OldUserAway", access: "denied", email: "g@h.i", lastAccess: "2016-02-25T20:00"});
    await articleModule.createNewArticle({blog: "blog", collection: "test", markdownEN: "test"});
    await blogModule.createNewBlog({OSMUser: "test"}, {name: "blog", status: "edit"});


    testutil.startServerSync();


    let theFiveContext = await browser.createIncognitoBrowserContext("TheFive");
    pageTheFive = await browser.newPage();
    testutil.fakeNextPassportLogin("TheFive");
    let response = await pageTheFive.goto(testutil.expandUrl("/auth/openstreetmap"));

  });

  afterEach(async function() {
    if (theFiveContext) theFiveContext.close();
    theFiveContext = null;
    mockdate.reset();
    await testutil.stopServer();
    await testutil.waitMilliseconds(1000);
  });

  describe("Known User", function() {
    describe("Admin Homepage", function() {
      it("should show Admin Homepage", async function() {
        await pageTheFive.goto(testutil.expandUrl("/osmbc/admin"));
        await testutil.expectHtmlSync(pageTheFive,"index", "admin_home");
      });
    });
    describe("Homepage", function() {
      it("should find welcome text on Homepage", async function() {
        await pageTheFive.goto(testutil.expandUrl("/osmbc"));
        let header = await pageTheFive.$("h2");
        let text = await pageTheFive.evaluate(e => e.innerText,header);
        should(text).eql( "Welcome to OSM BC");
      });
      it("should have bootstrap.js loaded", async function() {
        await pageTheFive.goto(testutil.expandUrl("/osmbc"));
        let result = await pageTheFive.evaluate(() => (typeof $().modal == 'function') , true);
        should(result).be.True();
      });
    });

    describe("Not Defined Page", function() {
      it("should throw an error message for not defined pages", async function() {
        let response = await pageTheFive.goto(testutil.expandUrl("/notdefined.html"));
        should(response.status()).eql(404);
        let header = await pageTheFive.$("h1");
        let text = await pageTheFive.evaluate(e => e.innerText,header);
        should(text).eql("Page Not Found");
      });
    });
    describe("LanguageSetter", function() {
      it("should set the language different languages", async function() {
        await pageTheFive.goto(testutil.expandUrl("/osmbc"));

        // Open Language Menu with a click
        await pageTheFive.click(".btn.dropdown-toggle.osmbcbadge-lang");

        // Change language (expecting page reload)
        await Promise.all([
          pageTheFive.waitForNavigation(),
          pageTheFive.click("a#lang_EN")
        ]);


        // Open Language Menu with a click
        await pageTheFive.click(".btn.dropdown-toggle.osmbcbadge-lang2");
          // Change language (expecting page reload)

        await Promise.all([
          pageTheFive.waitForNavigation(),
          pageTheFive.click("a#lang2_DE")
        ]);

        testutil.expectHtmlSync(browser,"index", "switchedToEnglishAndGerman");
      });
      it("should set the language both equal", async function() {
        await pageTheFive.goto(testutil.expandUrl("/osmbc"));

        // Open Language Menu with a click
        await pageTheFive.click(".btn.dropdown-toggle.osmbcbadge-lang");

        await Promise.all([
          pageTheFive.waitForNavigation(),
          pageTheFive.click("a#lang_EN")
        ]);

        // Open Language Menu with a click
        await pageTheFive.click(".btn.dropdown-toggle.osmbcbadge-lang2");

        await Promise.all([
          pageTheFive.waitForNavigation(),
          pageTheFive.click("a#lang2_EN")
        ]);
        testutil.expectHtmlSync(pageTheFive,"index", "switchedToEnglishAndEnglish");
      });
    });
  });
  describe("Unkown User", function() {

    it("should throw an error if user not exits", async function() {
      let unkownUserContext = await browser.createIncognitoBrowserContext();
      let unkownUserPage = await browser.newPage();
      testutil.fakeNextPassportLogin("TheFiveNotExist");
      await unkownUserPage.goto(testutil.expandUrl("/auth/openstreetmap"));

      await unkownUserPage.goto(testutil.expandUrl("/osmbc"));
      let content = await unkownUserPage.content();
      content.should.containEql("You are logged in as guest");
    });
    it("should throw an error if user is denied", async function() {
      let deniedUserContext = await browser.createIncognitoBrowserContext();
      let deniedUserPage = await browser.newPage();
      testutil.fakeNextPassportLogin("OldUserAway");
      await deniedUserPage.goto(testutil.expandUrl("/auth/openstreetmap"));

      await Promise.all([
        pageTheFive.waitForNavigation(),
        deniedUserPage.goto(testutil.expandUrl("/osmbc"))
      ]);
      testutil.expectHtmlSync(deniedUserPage,"index", "denied user");
      //browser.html().should.containEql("OSM User &gt;OldUserAway&lt; has no access rights");
    });
  });
});
/* jshint ignore:end */
