/**
 * XSLTProcessor Tests
 *
 * Tests for JavaScript XSLTProcessor implementation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { XSLTProcessor, isNativeXSLTSupported, installGlobal } from './XSLTProcessor.js';

// Setup JSDOM environment
function setupDOM() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    contentType: 'text/html'
  });

  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  global.XMLSerializer = dom.window.XMLSerializer;

  return dom;
}

function parseXML(xmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, 'application/xml');
}

describe('XSLTProcessor', () => {
  beforeEach(() => {
    setupDOM();
  });

  describe('Constructor', () => {
    it('should create a new XSLTProcessor instance', () => {
      const processor = new XSLTProcessor();
      assert.ok(processor instanceof XSLTProcessor);
    });
  });

  describe('importStylesheet', () => {
    it('should import a valid XSLT stylesheet', () => {
      const processor = new XSLTProcessor();
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <html><body>Hello</body></html>
          </xsl:template>
        </xsl:stylesheet>
      `);

      assert.doesNotThrow(() => {
        processor.importStylesheet(xslt);
      });
    });

    it('should throw when no argument provided', () => {
      const processor = new XSLTProcessor();
      assert.throws(() => {
        processor.importStylesheet();
      }, /1 argument required/);
    });

    it('should throw for invalid node type', () => {
      const processor = new XSLTProcessor();
      assert.throws(() => {
        processor.importStylesheet(document.createTextNode('text'));
      }, /not a Document or Element/);
    });
  });

  describe('transformToFragment', () => {
    it('should transform XML to fragment', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <div class="result">
              <xsl:value-of select="/root/item"/>
            </div>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(`<?xml version="1.0"?>
        <root>
          <item>Hello World</item>
        </root>
      `);

      processor.importStylesheet(xslt);
      const fragment = processor.transformToFragment(xml, document);

      assert.ok(fragment);
      assert.ok(fragment.nodeType === 11); // DocumentFragment
    });

    it('should throw when no stylesheet imported', () => {
      const processor = new XSLTProcessor();
      const xml = parseXML('<root/>');

      assert.throws(() => {
        processor.transformToFragment(xml, document);
      }, /No stylesheet/);
    });

    it('should throw when missing arguments', () => {
      const processor = new XSLTProcessor();
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);

      assert.throws(() => {
        processor.transformToFragment();
      }, /2 arguments required/);
    });
  });

  describe('transformToDocument', () => {
    it('should transform XML to document', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result>
              <xsl:value-of select="/root/item"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(`<?xml version="1.0"?>
        <root>
          <item>Test</item>
        </root>
      `);

      processor.importStylesheet(xslt);
      const result = processor.transformToDocument(xml);

      assert.ok(result);
    });

    it('should throw when no stylesheet imported', () => {
      const processor = new XSLTProcessor();
      const xml = parseXML('<root/>');

      assert.throws(() => {
        processor.transformToDocument(xml);
      }, /No stylesheet/);
    });
  });

  describe('Parameters', () => {
    it('should set and get parameter', () => {
      const processor = new XSLTProcessor();

      processor.setParameter(null, 'myParam', 'myValue');
      const value = processor.getParameter(null, 'myParam');

      assert.strictEqual(value, 'myValue');
    });

    it('should set parameter with namespace', () => {
      const processor = new XSLTProcessor();

      processor.setParameter('http://example.com', 'param', 'value');
      const value = processor.getParameter('http://example.com', 'param');

      assert.strictEqual(value, 'value');
    });

    it('should return empty string for unset parameter', () => {
      const processor = new XSLTProcessor();
      const value = processor.getParameter(null, 'nonexistent');
      assert.strictEqual(value, '');
    });

    it('should remove parameter', () => {
      const processor = new XSLTProcessor();

      processor.setParameter(null, 'param', 'value');
      processor.removeParameter(null, 'param');
      const value = processor.getParameter(null, 'param');

      assert.strictEqual(value, '');
    });

    it('should clear all parameters', () => {
      const processor = new XSLTProcessor();

      processor.setParameter(null, 'param1', 'value1');
      processor.setParameter(null, 'param2', 'value2');
      processor.clearParameters();

      assert.strictEqual(processor.getParameter(null, 'param1'), '');
      assert.strictEqual(processor.getParameter(null, 'param2'), '');
    });

    it('should throw when setParameter has insufficient arguments', () => {
      const processor = new XSLTProcessor();
      assert.throws(() => {
        processor.setParameter(null, 'param');
      }, /3 arguments required/);
    });

    it('should throw when getParameter has insufficient arguments', () => {
      const processor = new XSLTProcessor();
      assert.throws(() => {
        processor.getParameter(null);
      }, /2 arguments required/);
    });
  });

  describe('reset', () => {
    it('should reset processor state', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);
      processor.setParameter(null, 'param', 'value');
      processor.reset();

      assert.strictEqual(processor.getParameter(null, 'param'), '');

      const xml = parseXML('<root/>');
      assert.throws(() => {
        processor.transformToFragment(xml, document);
      }, /No stylesheet/);
    });
  });

  describe('XSLT Features', () => {
    it('should handle xsl:value-of', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <p><xsl:value-of select="/root/text"/></p>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(`<root><text>Hello</text></root>`);

      processor.importStylesheet(xslt);
      const fragment = processor.transformToFragment(xml, document);

      assert.ok(fragment);
      const p = fragment.querySelector('p');
      assert.ok(p);
      assert.strictEqual(p.textContent, 'Hello');
    });

    it('should handle xsl:for-each', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <ul>
              <xsl:for-each select="/root/item">
                <li><xsl:value-of select="."/></li>
              </xsl:for-each>
            </ul>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(`
        <root>
          <item>One</item>
          <item>Two</item>
          <item>Three</item>
        </root>
      `);

      processor.importStylesheet(xslt);
      const fragment = processor.transformToFragment(xml, document);

      const items = fragment.querySelectorAll('li');
      assert.strictEqual(items.length, 3);
    });

    it('should handle xsl:if', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:if test="/root/show">
              <p>Visible</p>
            </xsl:if>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xmlWithShow = parseXML(`<root><show/></root>`);
      const xmlWithoutShow = parseXML(`<root></root>`);

      processor.importStylesheet(xslt);

      const fragment1 = processor.transformToFragment(xmlWithShow, document);
      assert.ok(fragment1.querySelector('p'));

      const fragment2 = processor.transformToFragment(xmlWithoutShow, document);
      assert.ok(!fragment2.querySelector('p'));
    });

    it('should handle xsl:choose', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:choose>
              <xsl:when test="/root/type = 'a'">
                <p>Type A</p>
              </xsl:when>
              <xsl:when test="/root/type = 'b'">
                <p>Type B</p>
              </xsl:when>
              <xsl:otherwise>
                <p>Unknown</p>
              </xsl:otherwise>
            </xsl:choose>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(`<root><type>b</type></root>`);

      processor.importStylesheet(xslt);
      const fragment = processor.transformToFragment(xml, document);

      const p = fragment.querySelector('p');
      assert.strictEqual(p.textContent, 'Type B');
    });

    it('should handle xsl:apply-templates', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <div><xsl:apply-templates select="/root/item"/></div>
          </xsl:template>
          <xsl:template match="item">
            <span><xsl:value-of select="."/></span>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(`
        <root>
          <item>A</item>
          <item>B</item>
        </root>
      `);

      processor.importStylesheet(xslt);
      const fragment = processor.transformToFragment(xml, document);

      const spans = fragment.querySelectorAll('span');
      assert.strictEqual(spans.length, 2);
    });

    it('should handle xsl:call-template', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:call-template name="greeting">
              <xsl:with-param name="name" select="/root/name"/>
            </xsl:call-template>
          </xsl:template>
          <xsl:template name="greeting">
            <xsl:param name="name"/>
            <p>Hello, <xsl:value-of select="$name"/>!</p>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(`<root><name>World</name></root>`);

      processor.importStylesheet(xslt);
      const fragment = processor.transformToFragment(xml, document);

      const p = fragment.querySelector('p');
      assert.ok(p.textContent.includes('Hello'));
      assert.ok(p.textContent.includes('World'));
    });

    it('should handle xsl:copy-of', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <div>
              <xsl:copy-of select="/root/content/*"/>
            </div>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(`
        <root>
          <content>
            <p>Paragraph</p>
            <span>Span</span>
          </content>
        </root>
      `);

      processor.importStylesheet(xslt);
      const fragment = processor.transformToFragment(xml, document);

      assert.ok(fragment.querySelector('p'));
      assert.ok(fragment.querySelector('span'));
    });

    it('should handle xsl:attribute', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <div>
              <xsl:attribute name="class">
                <xsl:value-of select="/root/className"/>
              </xsl:attribute>
              Content
            </div>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(`<root><className>my-class</className></root>`);

      processor.importStylesheet(xslt);
      const fragment = processor.transformToFragment(xml, document);

      const div = fragment.querySelector('div');
      assert.strictEqual(div.getAttribute('class'), 'my-class');
    });

    it('should handle attribute value templates', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <a href="/item/{/root/id}">Link</a>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(`<root><id>123</id></root>`);

      processor.importStylesheet(xslt);
      const fragment = processor.transformToFragment(xml, document);

      const a = fragment.querySelector('a');
      assert.strictEqual(a.getAttribute('href'), '/item/123');
    });

    it('should handle xsl:sort', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <ul>
              <xsl:for-each select="/root/item">
                <xsl:sort select="@name"/>
                <li><xsl:value-of select="@name"/></li>
              </xsl:for-each>
            </ul>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(`
        <root>
          <item name="Charlie"/>
          <item name="Alice"/>
          <item name="Bob"/>
        </root>
      `);

      processor.importStylesheet(xslt);
      const fragment = processor.transformToFragment(xml, document);

      const items = fragment.querySelectorAll('li');
      assert.strictEqual(items[0].textContent, 'Alice');
      assert.strictEqual(items[1].textContent, 'Bob');
      assert.strictEqual(items[2].textContent, 'Charlie');
    });
  });

  describe('Utility Functions', () => {
    it('isNativeXSLTSupported should return boolean', () => {
      const result = isNativeXSLTSupported();
      assert.strictEqual(typeof result, 'boolean');
    });

    it('installGlobal with force should work', () => {
      const result = installGlobal(true);
      assert.strictEqual(typeof result, 'boolean');
    });

    it('installGlobal without force when native not supported', () => {
      // Save original
      const original = globalThis.XSLTProcessor;
      delete globalThis.XSLTProcessor;

      const result = installGlobal(false);

      // Restore
      if (original) {
        globalThis.XSLTProcessor = original;
      }

      assert.strictEqual(typeof result, 'boolean');
    });

    it('isNativeXSLTSupported should return true with working mock native', () => {
      // Save original
      const original = globalThis.XSLTProcessor;

      // Create a mock native XSLTProcessor that works
      class MockNativeXSLTProcessor {
        importStylesheet() {}
        transformToFragment() {
          // Return a mock fragment with childNodes
          const fragment = document.createDocumentFragment();
          fragment.appendChild(document.createElement('test'));
          return fragment;
        }
      }

      globalThis.XSLTProcessor = MockNativeXSLTProcessor;

      const result = isNativeXSLTSupported();

      // Restore
      globalThis.XSLTProcessor = original;

      assert.strictEqual(result, true);
    });

    it('isNativeXSLTSupported should return false when native throws', () => {
      // Save original
      const original = globalThis.XSLTProcessor;

      // Create a mock that throws
      class MockThrowingXSLTProcessor {
        importStylesheet() {
          throw new Error('Mock error');
        }
      }

      globalThis.XSLTProcessor = MockThrowingXSLTProcessor;

      const result = isNativeXSLTSupported();

      // Restore
      globalThis.XSLTProcessor = original;

      assert.strictEqual(result, false);
    });

    it('isNativeXSLTSupported should return false when transformToFragment returns null', () => {
      // Save original
      const original = globalThis.XSLTProcessor;

      // Create a mock that returns null
      class MockNullResultXSLTProcessor {
        importStylesheet() {}
        transformToFragment() {
          return null;
        }
      }

      globalThis.XSLTProcessor = MockNullResultXSLTProcessor;

      const result = isNativeXSLTSupported();

      // Restore
      globalThis.XSLTProcessor = original;

      assert.strictEqual(result, false);
    });

    it('isNativeXSLTSupported should return false when transformToFragment returns empty fragment', () => {
      // Save original
      const original = globalThis.XSLTProcessor;

      // Create a mock that returns empty fragment
      class MockEmptyResultXSLTProcessor {
        importStylesheet() {}
        transformToFragment() {
          return document.createDocumentFragment();
        }
      }

      globalThis.XSLTProcessor = MockEmptyResultXSLTProcessor;

      const result = isNativeXSLTSupported();

      // Restore
      globalThis.XSLTProcessor = original;

      assert.strictEqual(result, false);
    });

    it('installGlobal should return false when native is supported and force is false', () => {
      // Save original
      const original = globalThis.XSLTProcessor;

      // Create a working mock native
      class MockNativeXSLTProcessor {
        importStylesheet() {}
        transformToFragment() {
          const fragment = document.createDocumentFragment();
          fragment.appendChild(document.createElement('test'));
          return fragment;
        }
      }

      globalThis.XSLTProcessor = MockNativeXSLTProcessor;

      const result = installGlobal(false);

      // Restore
      globalThis.XSLTProcessor = original;

      assert.strictEqual(result, false);
    });
  });

  describe('importStylesheet error cases', () => {
    it('should throw for stylesheet with parse errors', () => {
      const processor = new XSLTProcessor();

      // Create document with parsererror element
      const doc = document.implementation.createDocument(null, null, null);
      const root = doc.createElement('root');
      const parseError = doc.createElement('parsererror');
      parseError.textContent = 'XML parsing error';
      root.appendChild(parseError);
      doc.appendChild(root);

      assert.throws(() => {
        processor.importStylesheet(doc);
      }, /parse errors/);
    });
  });

  describe('setParameter with existing engine', () => {
    it('should update engine parameters after stylesheet import', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:param name="myParam" select="'default'"/>
          <xsl:template match="/">
            <result><xsl:value-of select="$myParam"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);
      processor.setParameter(null, 'myParam', 'updated');

      // Verify the parameter was set
      const value = processor.getParameter(null, 'myParam');
      assert.strictEqual(value, 'updated');
    });

    it('should apply pre-set parameters when importing stylesheet', () => {
      const processor = new XSLTProcessor();

      // Set parameter before importing stylesheet
      processor.setParameter(null, 'presetParam', 'presetValue');

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:param name="presetParam"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);

      const value = processor.getParameter(null, 'presetParam');
      assert.strictEqual(value, 'presetValue');
    });
  });

  describe('transformToFragment error handling', () => {
    it('should throw when output is missing', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);
      const xml = parseXML('<root/>');

      assert.throws(() => {
        processor.transformToFragment(xml);
      }, /2 arguments required/);
    });

    it('should throw for invalid source node type', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);

      // Text node is not valid source
      const textNode = document.createTextNode('text');

      assert.throws(() => {
        processor.transformToFragment(textNode, document);
      }, /not a valid node type/);
    });

    it('should throw for invalid output document type', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);
      const xml = parseXML('<root/>');

      // Element is not a document
      const element = document.createElement('div');

      assert.throws(() => {
        processor.transformToFragment(xml, element);
      }, /not a Document/);
    });

    it('should return null on transformation error', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:message terminate="yes">Force error</xsl:message>
          </xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);
      const xml = parseXML('<root/>');

      const result = processor.transformToFragment(xml, document);
      assert.strictEqual(result, null);
    });
  });

  describe('transformToDocument error handling', () => {
    it('should throw when source is missing', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);

      assert.throws(() => {
        processor.transformToDocument();
      }, /1 argument required/);
    });

    it('should throw for invalid source node type', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);
      const textNode = document.createTextNode('text');

      assert.throws(() => {
        processor.transformToDocument(textNode);
      }, /not a valid node type/);
    });

    it('should return null on transformation error', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:message terminate="yes">Force error</xsl:message>
          </xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);
      const xml = parseXML('<root/>');

      const result = processor.transformToDocument(xml);
      assert.strictEqual(result, null);
    });
  });

  describe('setParameter validation', () => {
    it('should throw for non-string localName', () => {
      const processor = new XSLTProcessor();

      assert.throws(() => {
        processor.setParameter(null, 123, 'value');
      }, /non-empty string/);
    });

    it('should throw for empty localName', () => {
      const processor = new XSLTProcessor();

      assert.throws(() => {
        processor.setParameter(null, '', 'value');
      }, /non-empty string/);
    });
  });

  describe('getParameter validation', () => {
    it('should throw for non-string localName', () => {
      const processor = new XSLTProcessor();

      assert.throws(() => {
        processor.getParameter(null, 123);
      }, /must be a string/);
    });
  });

  describe('removeParameter validation', () => {
    it('should throw when arguments missing', () => {
      const processor = new XSLTProcessor();

      assert.throws(() => {
        processor.removeParameter();
      }, /2 arguments required/);
    });

    it('should throw for non-string localName', () => {
      const processor = new XSLTProcessor();

      assert.throws(() => {
        processor.removeParameter(null, 123);
      }, /must be a string/);
    });

    it('should remove parameter from engine', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);
      processor.setParameter(null, 'testParam', 'value');
      processor.removeParameter(null, 'testParam');

      assert.strictEqual(processor.getParameter(null, 'testParam'), '');
    });
  });

  describe('clearParameters with engine', () => {
    it('should clear parameters from engine', () => {
      const processor = new XSLTProcessor();

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      processor.importStylesheet(xslt);
      processor.setParameter(null, 'param1', 'value1');
      processor.setParameter(null, 'param2', 'value2');
      processor.clearParameters();

      assert.strictEqual(processor.getParameter(null, 'param1'), '');
      assert.strictEqual(processor.getParameter(null, 'param2'), '');
    });
  });
});
