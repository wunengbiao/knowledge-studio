import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict'

const jieba = Jieba.withDict(dict)

const VALID_TOKEN = /[a-z0-9\u4e00-\u9fff]/i
function tokenize(text) {
  return jieba
    .cut(text, false)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && VALID_TOKEN.test(t))
}

const cases = [
  ['知识库管理系统', '中文整句'],
  ['知识库', '短中文查询'],
  ['RAG 知识库管理系统', '中英混合'],
  ['how does BM25 work', '英文'],
  ['BM25算法', '中英混合无空格'],
  ['机器学习在推荐系统中的应用', '长中文'],
  ['中华人民共和国万岁', '专有名词'],
  ['如何使用 Electron 开发桌面应用', '技术文档'],
  ['自然语言处理与信息检索', '学术'],
]

console.log('=== jieba 分词效果 ===\n')
for (const [text, desc] of cases) {
  console.log(`输入: "${text}"  (${desc})`)
  console.log(`  分词: ${JSON.stringify(tokenize(text))}`)
  console.log()
}

console.log('=== BM25 查询匹配模拟 ===')
const docs = [
  { id: 'd1', content: '知识库管理系统的设计与实现' },
  { id: 'd2', content: '机器学习在推荐系统中的应用' },
  { id: 'd3', content: '深度学习模型优化方法研究' },
  { id: 'd4', content: '基于自然语言处理的知识图谱构建' },
  { id: 'd5', content: 'Knowledge base management system' },
]
const queries = ['知识库', '机器学习', '自然语言']

for (const q of queries) {
  const qTokens = new Set(tokenize(q))
  console.log(`\n查询: "${q}" → tokens: ${[...qTokens].join(', ')}`)
  for (const d of docs) {
    const dTokens = new Set(tokenize(d.content))
    const hits = [...qTokens].filter(t => dTokens.has(t))
    console.log(`  ${d.id} "${d.content}" → ${hits.length ? '命中: ' + hits.join(', ') : '未命中'}`)
  }
}
