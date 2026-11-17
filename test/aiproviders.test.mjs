import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import './ts-resolve.mjs';
const { aiStepWith, toOpenAi, fromOpenAi } = await import('../src/main/ai.ts');

const tools = [{ name: 'get_net', description: 'net', input_schema: { type: 'object', properties: { net: { type: 'string' } } } }];
const convo = {
  system: 'sys',
  tools,
  messages: [
    { role: 'user', content: 'not charging' },
    { role: 'assistant', content: [{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 'c1', name: 'get_net', input: { net: 'VBUS' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: '{"pins":4}' }] },
  ],
};

test('toOpenAi maps tool calls and results', () => {
  const r = toOpenAi(convo);
  assert.equal(r.messages[0].role, 'system');
  assert.equal(r.messages[2].tool_calls[0].function.name, 'get_net');
  assert.deepEqual(JSON.parse(r.messages[2].tool_calls[0].function.arguments), { net: 'VBUS' });
  assert.deepEqual(r.messages[3], { role: 'tool', tool_call_id: 'c1', content: '{"pins":4}' });
  assert.equal(r.tools[0].function.parameters.type, 'object');
});

test('fromOpenAi maps tool calls back', () => {
  const r = fromOpenAi({ model: 'm', choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'x', function: { name: 'get_part', arguments: '{"part":"U1"}' } }] } }] });
  assert.equal(r.stop_reason, 'tool_use');
  assert.deepEqual(r.content[0], { type: 'tool_use', id: 'x', name: 'get_part', input: { part: 'U1' } });
  assert.equal(fromOpenAi({ choices: [{ finish_reason: 'stop', message: { content: 'done' } }] }).stop_reason, 'end_turn');
  assert.equal(fromOpenAi({ choices: [{ finish_reason: 'length', message: { content: 'cut' } }] }).stop_reason, 'max_tokens');
});

test('aiStepWith talks to an OpenAI-compatible server', async () => {
  let seen;
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(b) };
      if (req.headers.authorization === 'Bearer bad') { res.writeHead(401); res.end('{}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ model: 'local', choices: [{ finish_reason: 'stop', message: { content: 'Probe VBUS.' } }] }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/v1/`;
  try {
    const r = await aiStepWith(convo, { provider: 'custom', aiBaseUrl: base, aiApiKey: 'k', aiCustomModel: 'llama' });
    assert.equal(r.content[0].text, 'Probe VBUS.');
    assert.equal(seen.url, '/v1/chat/completions');
    assert.equal(seen.auth, 'Bearer k');
    assert.equal(seen.body.model, 'llama');
    await assert.rejects(aiStepWith(convo, { provider: 'custom', aiBaseUrl: base, aiApiKey: 'bad', aiCustomModel: 'llama' }), /rejected the API key/);
    await assert.rejects(aiStepWith(convo, { provider: 'openai', aiCustomModel: 'x' }), /API key/);
    await assert.rejects(aiStepWith(convo, { provider: 'ollama', aiBaseUrl: 'http://127.0.0.1:1/v1', aiCustomModel: 'x' }), /running on this PC/);
  } finally { srv.close(); }
});
