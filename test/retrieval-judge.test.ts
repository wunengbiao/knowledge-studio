import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseNeedsKb } from '../src/main/services/retrieval-judge-parser.ts'

test('Given strict JSON true, When parsing, Then return true', () => {
  assert.equal(parseNeedsKb('{"needs_kb": true}'), true)
})

test('Given strict JSON false, When parsing, Then return false', () => {
  assert.equal(parseNeedsKb('{"needs_kb": false}'), false)
})

test('Given JSON with surrounding prose, When parsing, Then extract the JSON object', () => {
  assert.equal(parseNeedsKb('根据判断：{"needs_kb": false} 以上是结论。'), false)
  assert.equal(parseNeedsKb('Result: {"needs_kb": true} (end)'), true)
})

test('Given string-valued needs_kb, When parsing, Then coerce to boolean', () => {
  assert.equal(parseNeedsKb('{"needs_kb": "true"}'), true)
  assert.equal(parseNeedsKb('{"needs_kb": "false"}'), false)
})

test('Given keyword-style response without JSON braces, When parsing, Then fall back to keyword match', () => {
  assert.equal(parseNeedsKb('"needs_kb": false'), false)
  assert.equal(parseNeedsKb('"needs_kb": true'), true)
})

test('Given empty content, When parsing, Then default to true (safe retrieval)', () => {
  assert.equal(parseNeedsKb(''), true)
})

test('Given ambiguous content, When parsing, Then default to true (safe retrieval)', () => {
  assert.equal(parseNeedsKb('I think the user wants to chat.'), true)
  assert.equal(parseNeedsKb('也许需要，也许不需要'), true)
})

test('Given malformed JSON that fails to parse, When parsing, Then fall back to keyword match then default', () => {
  // Malformed JSON without a usable boolean keyword → default true
  assert.equal(parseNeedsKb('{needs_kb: }'), true)
  // Malformed JSON but with the false keyword present → false
  assert.equal(parseNeedsKb('{needs_kb: false}'), false)
})
