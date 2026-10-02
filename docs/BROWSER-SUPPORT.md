# Browser Compatibility

The bundles are built for ES2022 without transpiling and use `Object.hasOwn()`
and `Array.prototype.at()`, which set the minimum browser versions below.

## Polyfill Support

| Environment | Minimum Version | Status |
|-------------|-----------------|--------|
| Chrome | 93+ | Supported |
| Edge | 93+ | Supported |
| Firefox | 92+ | Supported |
| Safari | 15.4+ | Supported |
| Opera | 79+ | Supported |
| Samsung Internet | 17+ | Supported |
| Node.js | 20.19+ (`engines`) | Supported; CI tests 22, 24 and 26. Needs a DOM such as `jsdom` |

## Native XSLT Deprecation Timeline

From [Chrome's announcement](https://developer.chrome.com/docs/web-platform/deprecating-xslt) (updated 29 October 2025):

| Browser | Deprecated | Off in stable | Off for everyone |
|---------|------------|---------------|------------------|
| Chrome | 143 (2 December 2025) | 158 (17 November 2026) | 176 (17 August 2027), when the origin trial and enterprise policy end |
| Edge and other Chromium browsers | follow Chromium | follow Chromium | follow Chromium |
| Chrome WebView (Android) | | off by default in Canary, Dev and Beta from 154 (22 September 2026) | |
| Firefox | positive standards position, tracking [bug 1990759](https://bugzilla.mozilla.org/show_bug.cgi?id=1990759) | no date | no date |
| Safari (WebKit) | supports the removal | no date | no date |

## Feature Detection

```javascript
import { isNativeXSLTSupported, installGlobal } from '@tradik/xslt-processor';

// Check native support and auto-install polyfill
if (!isNativeXSLTSupported()) {
  installGlobal();
  console.log('Using JavaScript XSLT polyfill');
}
```
