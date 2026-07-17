/**
 * lancedb 0.17.0 FTS + jieba 预分词 + Hybrid RRF 验证脚本
 *
 * 目标:验证在不升级 lancedb 的前提下,用 jieba 预分词 + whitespace tokenizer
 *      实现 BM25 全文检索,并与 dense vector 做 RRF 融合。
 *
 * 运行:node scripts/verify-lancedb-fts.mjs
 * 不依赖 Electron,使用 /tmp 临时目录。
 */

import * as lancedb from '@lancedb/lancedb'
import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 匹配项目现有 tokenize 行为(tokenizer.ts:jieba.cut(text, false) 精确模式)
const jieba = Jieba.withDict(dict)
const segment = (text) => jieba.cut(text, false).join(' ')

// 测试数据:中英混合,覆盖纯中文/中英混合/纯英文/无关文档
const docs = [
  {
    id: '1',
    text: '机器学习是人工智能的一个分支,通过数据训练模型',
    vector: [0.1, 0.2, 0.3, 0.4]
  },
  {
    id: '2',
    text: '深度学习使用神经网络,是机器学习的重要组成部分',
    vector: [0.15, 0.25, 0.35, 0.45]
  },
  {
    id: '3',
    text: 'natural language processing deals with text',
    vector: [0.9, 0.8, 0.7, 0.6]
  },
  {
    id: '4',
    text: '今天天气不错,适合出去散步',
    vector: [0.5, 0.5, 0.5, 0.5]
  },
  {
    id: '5',
    text: '向量数据库 vector database 用于存储和检索 embedding',
    vector: [0.2, 0.3, 0.4, 0.5]
  }
]

const results = []
function check(name, cond, detail = '') {
  const status = cond ? 'PASS' : 'FAIL'
  results.push({ name, status, detail })
  console.log(`[${status}] ${name}${detail ? ' - ' + detail : ''}`)
}

const dbDir = mkdtempSync(join(tmpdir(), 'lancedb-fts-verify-'))
console.log(`\n临时目录: ${dbDir}\n`)

try {
  // ============ 1. 建表(含 text_segmented 列)============
  console.log('--- 步骤 1:建表 + jieba 预分词 ---')
  const data = docs.map((d) => ({
    id: d.id,
    text: d.text,
    text_segmented: segment(d.text),
    vector: d.vector
  }))
  console.log('分词示例:')
  for (const d of data) {
    console.log(`  [${d.id}] "${d.text}" -> "${d.text_segmented}"`)
  }

  const db = await lancedb.connect(dbDir)
  const table = await db.createTable('docs', data, { mode: 'overwrite' })
  check('建表成功', !!table)

  // ============ 2. 建 FTS 索引 ============
  console.log('\n--- 步骤 2:建 FTS 索引(whitespace tokenizer)---')
  await table.createIndex('text_segmented', {
    config: lancedb.Index.fts({
      baseTokenizer: 'whitespace',
      stem: false,
      removeStopWords: false,
      asciiFolding: false
    }),
    replace: true
  })
  check('FTS 索引创建成功', true)

  // ============ 3. optimize(让新行进入 FTS 索引)============
  console.log('\n--- 步骤 3:optimize ---')
  await table.optimize()
  check('optimize 成功', true)

  // ============ 4. FTS BM25 查询:中文 ============
  console.log('\n--- 步骤 4:FTS BM25 查询(中文"机器学习")---')
  const cnQuery = segment('机器学习')
  console.log(`  查询分词: "${cnQuery}"`)
  const cnResults = await table.search(cnQuery, 'fts').limit(5).toArray()
  console.log('  结果:')
  for (const r of cnResults) {
    console.log(`    id=${r.id} _score=${r._score?.toFixed(4)} text="${r.text}"`)
  }

  const cnHitIds = cnResults.map((r) => r.id)
  check(
    '中文 BM25 命中含"机器学习"的文档(id=1,2)',
    cnHitIds.includes('1') && cnHitIds.includes('2'),
    `命中: ${cnHitIds.join(',')}`
  )
  check(
    '中文 BM25 排除无关文档(id=4 天气)',
    !cnHitIds.includes('4'),
    `命中: ${cnHitIds.join(',')}`
  )
  check('BM25 分数 > 0', cnResults.every((r) => r._score > 0))

  // ============ 5. FTS BM25 查询:英文 ============
  console.log('\n--- 步骤 5:FTS BM25 查询(英文"language processing")---')
  const enQuery = segment('language processing')
  console.log(`  查询分词: "${enQuery}"`)
  const enResults = await table.search(enQuery, 'fts').limit(5).toArray()
  console.log('  结果:')
  for (const r of enResults) {
    console.log(`    id=${r.id} _score=${r._score?.toFixed(4)} text="${r.text}"`)
  }
  check(
    '英文 BM25 命中含"language processing"的文档(id=3)',
    enResults.map((r) => r.id).includes('3'),
    `命中: ${enResults.map((r) => r.id).join(',')}`
  )

  // ============ 6. FTS BM25 查询:中英混合 ============
  console.log('\n--- 步骤 6:FTS BM25 查询(中英混合"向量 database")---')
  const mixQuery = segment('向量 database')
  console.log(`  查询分词: "${mixQuery}"`)
  const mixResults = await table.search(mixQuery, 'fts').limit(5).toArray()
  console.log('  结果:')
  for (const r of mixResults) {
    console.log(`    id=${r.id} _score=${r._score?.toFixed(4)} text="${r.text}"`)
  }
  check(
    '中英混合 BM25 命中 id=5',
    mixResults.map((r) => r.id).includes('5'),
    `命中: ${mixResults.map((r) => r.id).join(',')}`
  )

  // ============ 7. Hybrid RRF 查询 ============
  console.log('\n--- 步骤 7:Hybrid RRF 查询(dense + FTS)---')
  const rrf = await lancedb.rerankers.RRFReranker.create(60)
  // 用接近 doc 1 的向量 + 中文 FTS 查询,验证融合
  const hybridQuery = segment('机器学习')
  const hybridResults = await table
    .query()
    .nearestTo([0.12, 0.22, 0.32, 0.42])
    .fullTextSearch(hybridQuery)
    .rerank(rrf)
    .select(['id', 'text'])
    .limit(5)
    .toArray()
  console.log('  结果:')
  for (const r of hybridResults) {
    console.log(
      `    id=${r.id} _relevance_score=${r._relevance_score?.toFixed(4)} text="${r.text}"`
    )
  }
  check(
    'Hybrid RRF 返回结果',
    hybridResults.length > 0,
    `${hybridResults.length} 条结果`
  )
  check(
    'Hybrid 结果含 _relevance_score',
    hybridResults.every((r) => typeof r._relevance_score === 'number')
  )
  check(
    'Hybrid 融合命中相关文档(id=1 或 2)',
    ['1', '2'].some((id) => hybridResults.map((r) => r.id).includes(id)),
    `命中: ${hybridResults.map((r) => r.id).join(',')}`
  )

  // ============ 8. 纯 vector 查询(对照)============
  console.log('\n--- 步骤 8:纯 vector 查询(对照)---')
  const vecResults = await table
    .query()
    .nearestTo([0.12, 0.22, 0.32, 0.42])
    .select(['id', 'text'])
    .limit(5)
    .toArray()
  console.log('  结果:')
  for (const r of vecResults) {
    console.log(`    id=${r.id} _distance=${r._distance?.toFixed(4)} text="${r.text}"`)
  }
  check('纯 vector 查询返回结果', vecResults.length > 0)
} catch (e) {
  console.error('\n❌ 脚本异常:', e)
  results.push({ name: '脚本执行', status: 'FAIL', detail: e?.message || String(e) })
} finally {
  rmSync(dbDir, { recursive: true, force: true })
}

// ============ 总结 ============
console.log('\n========== 验证总结 ==========')
const passed = results.filter((r) => r.status === 'PASS').length
const failed = results.filter((r) => r.status === 'FAIL').length
console.log(`PASS: ${passed}  FAIL: ${failed}`)
if (failed > 0) {
  console.log('\n失败项:')
  for (const r of results.filter((r) => r.status === 'FAIL')) {
    console.log(`  - ${r.name}: ${r.detail}`)
  }
  process.exit(1)
} else {
  console.log('\n✅ 全部通过,lancedb 0.17.0 FTS + jieba 预分词方案可行')
}
