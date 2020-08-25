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






describe("uc/index", function() {
  this.timeout(20000);
  this.retries(4);
  let browser;
  nock("https://hooks.slack.com/")
    .post(/\/services\/.*/)
    .times(999)
    .reply(200, "ok");
  beforeEach(async function() {
    mockdate.set(new Date("2016-05-25T20:00"));
    await testutil.clearDB();
    await userModule.createNewUser({OSMUser: "TheFive", access: "full", language: "DE", email: "a@b.c"});
    await userModule.createNewUser({OSMUser: "OldUser", access: "full", lang: "EN", email: "d@e.f", lastAccess: "2016-02-25T20:00"});
    await userModule.createNewUser({OSMUser: "OldUserAway", access: "denied", email: "g@h.i", lastAccess: "2016-02-25T20:00"});
    testutil.startServerSync();

    browser = await testutil.getNewBrowser("TheFive");
    await articleModule.createNewArticle({blog: "blog", collection: "test", markdownEN: "test"});
    await blogModule.createNewBlog({OSMUser: "test"}, {name: "blog", status: "edit"});
  });

  afterEach(async function() {
    mockdate.reset();
    if (browser) {
      await browser.cookies.clear();
      await browser.close();
    }
    browser = null;
    await testutil.stopServer();
    await testutil.waitMilliseconds(1000);
  });

  describe("Known User", function() {
    describe("Homepage", function() {
      it("should find welcome text on Homepage", async function() {
        await browser.open(testutil.expandUrl("/osmbc"));
        await browser.assert.text("h2", "Welcome to OSM BC");
      });
      it("should have bootstrap.js loaded", async function() {
        await browser.open(testutil.expandUrl("/osmbc"));
        let result = await browser.evaluate("(typeof $().modal == 'function'); ");
        should(result).be.True();
      });
    });
    describe("Admin Homepage", function() {
      it("should show it", async function() {
        await browser.open(testutil.expandUrl("/osmbc/admin"));
        testutil.expectHtmlSync(browser,"index", "admin_home");
      });
    });
    describe("Not Defined Page", function() {
      it("should throw an error message", async function() {
        await browser.open(testutil.expandUrl("/notdefined.html"));
        await browser.assert.requests.status(404);
        await browser.assert.text("h1", "Page Not Found");
      });
    });
    describe("LanguageSetter", function() {
      it("should set the language", async function() {
        await browser.open(testutil.expandUrl("/osmbc"));

        // Open Language Menu with a click
        await browser.click(".btn.dropdown-toggle.osmbcbadge-lang");

        // Change language (expecting page reload)
        await browser.clickAndWaitForNavigation("a#lang_EN");

        // Open Language Menu with a click
        await browser.click(".btn.dropdown-toggle.osmbcbadge-lang2");
          // Change language (expecting page reload)
        await browser.clickAndWaitForNavigation("a#lang2_DE");

        testutil.expectHtmlSync(browser,"index", "switchedToEnglishAndGerman");
      });
      it("should set the language both equal", async function() {
        await browser.open(testutil.expandUrl("/osmbc"));

        // Open Language Menu with a click
        await browser.click(".btn.dropdown-toggle.osmbcbadge-lang");

        await browser.clickAndWaitForNavigation("a#lang_EN");

        // Open Language Menu with a click
        await browser.click(".btn.dropdown-toggle.osmbcbadge-lang2");

        await browser.clickAndWaitForNavigation("a#lang2_EN");
        testutil.expectHtmlSync(browser,"index", "switchedToEnglishAndEnglish");
      });
    });
  });
  describe("Unkown User", function() {
    it("should throw an error if user not exits", async function() {
      browser = await testutil.getNewBrowser("TheFiveNotExist");

      await browser.open(testutil.expandUrl("/osmbc"));
      browser.html().should.containEql("You are logged in as guest");
    });
    it("should throw an error if user is denied", async function() {
      try {
        browser = await testutil.getNewBrowser("OldUserAway");
        await browser.visit("/osmbc");
      } catch (err) {
        // ignore error, expect is a 403 error, but the
        // browser html has to be tested
      }
      testutil.expectHtmlSync(browser,"index", "denied user");
      browser.html().should.containEql("OSM User &gt;OldUserAway&lt; has no access rights");
    });
  });
});
/* jshint ignore:end */
