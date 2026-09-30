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

| Browser | Deprecation Warning | Full Removal |
|---------|---------------------|--------------|
| Chrome | v143 (2026) | v164 (August 2027) |
| Edge | v143 (2026) | v164 (August 2027) |
| Other Chromium | v143 (2026) | v164 (August 2027) |

## Feature Detection

```javascript
import { isNativeXSLTSupported, installGlobal } from '@tradik/xslt-processor';

// Check native support and auto-install polyfill
if (!isNativeXSLTSupported()) {
  installGlobal();
  console.log('Using JavaScript XSLT polyfill');
}
```
