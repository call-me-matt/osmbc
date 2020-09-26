"use strict";


let markdown_it_emoji = require("markdown-it-emoji");


///// require('markdown-it-regexp'); nutzen evtl einfacher

function install(md, options) {
  console.dir(options);
  md.use(markdown_it_emoji,options);
  md.renderer.rules.emoji = function(token, idx) {
    console.info("token ---- ");
    console.info(token);
    console.info("idx -----");
    console.info(idx);
    return "blabla"
  }
}

module.exports = install;
