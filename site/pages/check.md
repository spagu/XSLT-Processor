---
title: "Will your XSLT survive Chrome 158?"
description: "Drop your project's files, a folder or a .zip and see what breaks when Chrome removes native XSLT. The check runs in your browser; nothing is uploaded."
slug: check
link: /check/
status: publish
type: page
layout: check
---
Chrome 158 stops running XSLT on 17 November 2026. Give this page your
project's scripts, templates, XML documents and stylesheets, and it tells you
which of them depend on the browser's XSLT, how much of that the one-line
migration covers, and what to install.

**Nothing is uploaded.** This page reads the files in your browser, runs the
same analysis as `npx xslt-migrate-check .` and forgets them when you close
the tab. You can disconnect from the network once the page has loaded.
