import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildChatCompletionPayload } from '../src/main/services/model-params.ts'
import type { AssistantModelParams } from '../src/shared/types.ts'

const baseParams: AssistantModelParams = {
  temperatureEnabled: true,
  temperature: 0.7,
  topPEnabled: false,
  topP: 1,
  maxTokensEnabled: false,
  maxTokens: 2048,
  customParameters: []
}

const messages = [{ role: 'user' as const, content: 'hello' }]

test('Given disabled built-in model params, When building chat payload, Then omit disabled values', () => {
  const payload = buildChatCompletionPayload({
    model: 'mistral-large-latest',
    messages,
    modelParams: {
      ...baseParams,
      temperatureEnabled: false,
      temperature: 0.9,
      topPEnabled: false,
      topP: 0.5,
      maxTokensEnabled: false,
      maxTokens: 4096
    }
  })

  assert.deepEqual(payload, {
    model: 'mistral-large-latest',
    messages,
    stream: true
  })
})

test('Given enabled built-in model params, When building chat payload, Then use OpenAI-compatible parameter names', () => {
  const payload = buildChatCompletionPayload({
    model: 'custom-model',
    messages,
    modelParams: {
      ...baseParams,
      temperatureEnabled: true,
      temperature: 0.2,
      topPEnabled: true,
      topP: 0.8,
      maxTokensEnabled: true,
      maxTokens: 1024
    }
  })

  assert.equal(payload.temperature, 0.2)
  assert.equal(payload.top_p, 0.8)
  assert.equal(payload.max_tokens, 1024)
})

test('Given custom parameters, When building chat payload, Then include string number boolean and parsed JSON values', () => {
  const payload = buildChatCompletionPayload({
    model: 'custom-model',
    messages,
    modelParams: {
      ...baseParams,
      customParameters: [
        { name: 'reasoning_effort', type: 'string', value: 'high' },
        { name: 'seed', type: 'number', value: 42 },
        { name: 'safe_mode', type: 'boolean', value: true },
        { name: 'metadata', type: 'json', value: '{"source":"assistant","tags":["rag"]}' }
      ]
    }
  })

  assert.equal(payload.reasoning_effort, 'high')
  assert.equal(payload.seed, 42)
  assert.equal(payload.safe_mode, true)
  assert.deepEqual(payload.metadata, { source: 'assistant', tags: ['rag'] })
})

test('Given blank names and invalid JSON custom parameters, When building chat payload, Then skip blank names and keep invalid JSON as text', () => {
  const payload = buildChatCompletionPayload({
    model: 'custom-model',
    messages,
    modelParams: {
      ...baseParams,
      customParameters: [
        { name: '   ', type: 'string', value: 'ignored' },
        { name: 'raw_json', type: 'json', value: '{invalid' }
      ]
    }
  })

  assert.equal(Object.hasOwn(payload, '   '), false)
  assert.equal(payload.raw_json, '{invalid')
})

test('Given custom parameter collides with enabled built-in parameter, When building chat payload, Then built-in parameter wins', () => {
  const payload = buildChatCompletionPayload({
    model: 'custom-model',
    messages,
    modelParams: {
      ...baseParams,
      temperatureEnabled: true,
      temperature: 0.3,
      customParameters: [{ name: 'temperature', type: 'number', value: 1.5 }]
    }
  })

  assert.equal(payload.temperature, 0.3)
}
)
