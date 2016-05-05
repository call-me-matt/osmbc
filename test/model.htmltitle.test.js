"use strict";

var should = require('should');

var htmltitle = require('../model/htmltitle.js');


describe("model/htmltitle",function() {
  describe("linkFrom",function(){
    let linkFrom = htmltitle.fortestonly.linkFrom;
    it("should recognize http sources",function(){
      should(linkFrom("http://twitter.com/irgendwas","twitter.com")).be.True();
      should(linkFrom("http://forum.openstreetmap.org/viewtopic.php?id=54487","forum.openstreetmap.org")).be.True();
      should(linkFrom("http://forum.openstreetmap.org/viewtopic.php?id=54487","witter.com")).be.False();
      should(linkFrom("http://forum.openstreetmap.org/viewtopic.php?id=54487","google.de")).be.False();
    });
    it("should recognize https sources",function(){
      should(linkFrom("https://twitter.com/irgendwas","twitter.com")).be.True();
      should(linkFrom("https://forum.openstreetmap.org/viewtopic.php?id=54487","forum.openstreetmap.org")).be.True();
      should(linkFrom("https://forum.openstreetmap.org/viewtopic.php?id=54487","witter.com")).be.False();
      should(linkFrom("https://forum.openstreetmap.org/viewtopic.php?id=54487","google.de")).be.False();
    });
  });
  it('should get title a forum link',function(bddone){
    htmltitle.getTitle("http://forum.openstreetmap.org/viewtopic.php?id=54487",function(err,result){
      should.not.exist(err);
      should(result).eql("Bridges which aren't on any Way? / Questions and Answers");
      bddone();
    });
  });
  it('should get title from twitter',function(bddone){
    htmltitle.getTitle("https://twitter.com/WeeklyOSM/status/726026930479370241",function(err,result){
      should.not.exist(err);
      should(result).eql('“The weekly issue #301 now available in *English* the news from the #openstreetmap #osm world https://t.co/RImR8Bb4T5”');
      bddone();
    });
  });
  it('should get title from mapoftheweek',function(bddone){
    htmltitle.getTitle("http://mapoftheweek.blogspot.ch/2016/04/mapping-playgrounds.html",function(err,result){
      should.not.exist(err);
      should(result).eql('Map of the Week: Mapping the Playgrounds');
      bddone();
    });
  });
  it('should get title from Media Wiki',function(bddone){
    htmltitle.getTitle("https://www.mediawiki.org/wiki/Maps/Conversation_about_interactive_map_use",function(err,result){
      should.not.exist(err);
      should(result).eql('Maps/Conversation about interactive map use - MediaWiki');
      bddone();
    });
  });
});






