/**
 * Jest global test setup.
 *
 * jsdom does not implement `CSS.escape` — polyfill it so dashboard.js and
 * any other module that uses CSS.escape works correctly in unit tests.
 *
 * @jest-environment jsdom
 */

if (typeof globalThis.CSS === 'undefined') {
  globalThis.CSS = {};
}

if (typeof globalThis.CSS.escape !== 'function') {
  // Minimal CSS.escape polyfill per the CSS spec
  globalThis.CSS.escape = (value) => {
    const str = String(value);
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      const ch = str[i];

      if (code === 0) {
        result += '\uFFFD';
      } else if ((code >= 0x1 && code <= 0x1f) || code === 0x7f) {
        result += `\\${code.toString(16)} `;
      } else if (
        i === 0 &&
        code >= 0x30 &&
        code <= 0x39 // leading digit
      ) {
        result += `\\${code.toString(16)} `;
      } else if (
        i === 1 &&
        code >= 0x30 &&
        code <= 0x39 &&
        str.charCodeAt(0) === 0x2d // second digit after leading hyphen
      ) {
        result += `\\${code.toString(16)} `;
      } else if (
        code >= 0x80 ||
        code === 0x2d || // -
        code === 0x5f || // _
        (code >= 0x30 && code <= 0x39) || // 0-9
        (code >= 0x41 && code <= 0x5a) || // A-Z
        (code >= 0x61 && code <= 0x7a)    // a-z
      ) {
        result += ch;
      } else {
        result += `\\${ch}`;
      }
    }
    return result;
  };
}
