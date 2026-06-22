import { Jieba, TfIdf } from '@node-rs/jieba'
import { dict, idf } from '@node-rs/jieba/dict'

const jieba = Jieba.withDict(dict)
const tfidf = TfIdf.withDict(idf)

const VALID_TOKEN = /[a-z0-9\u4e00-\u9fff]/i

export function tokenize(text: string): string[] {
  return jieba
    .cut(text, false)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && VALID_TOKEN.test(t))
}

/** jieba POS tag → graph entity type. nr/ns/nt are jieba's named-entity tags. */
function posToType(pos: string): string {
  switch (pos) {
    case 'nr':
    case 'nrt':
    case 'nrfg':
      return 'person'
    case 'ns':
      return 'location'
    case 'nt':
      return 'organization'
    case 'nz':
      return 'proper-noun'
    case 'eng':
      return 'term'
    case 'vn':
    case 'an':
      return 'concept'
    case 'n':
    default:
      return 'concept'
  }
}

const ENTITY_POS = new Set([
  'n',
  'nr',
  'nrt',
  'nrfg',
  'ns',
  'nt',
  'nz',
  'eng',
  'vn',
  'an',
  'l'
])

// Stop list is intentionally stricter than BM25 tokenization: BM25 wants recall,
// the entity graph wants only meaningful nodes. Filler/connective/pronoun-class
// words must never become graph entities or co-occurrence edges explode.
const STOP_WORDS = new Set([
  '的', '了', '和', '与', '或', '是', '在', '也', '都', '就', '还', '又', '把', '被', '让',
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '这', '那', '这个', '那个', '这些', '那些',
  '一个', '一些', '一种', '一样', '可以', '需要', '应该', '可能', '已经', '正在', '将要', '没有', '不是',
  '什么', '怎么', '为什么', '如何', '哪里', '哪个', '所以', '因为', '但是', '然后', '而且', '或者',
  '由于', '通过', '关于', '对于', '根据', '按照', '从而', '因此',
  '内容', '部分', '方面', '时候', '时间', '问题', '情况', '方式', '方法', '过程', '结果', '原因',
  '上面', '下面', '前面', '后面', '里面', '外面', '左边', '右边'
])

const ALLOWED_POS_FOR_EXTRACT: string[] = Array.from(ENTITY_POS)

export interface ExtractedEntity {
  name: string
  type: string
  weight: number
}

export function extractEntities(text: string, topK = 15): ExtractedEntity[] {
  if (!text || text.length < 2) return []

  const posMap = new Map<string, string>()
  const tagged = jieba.tag(text, true)
  for (const { word, tag } of tagged) {
    const w = word.trim()
    if (w.length < 2) continue
    if (STOP_WORDS.has(w)) continue
    if (!VALID_TOKEN.test(w)) continue
    if (!ENTITY_POS.has(tag)) continue
    if (!posMap.has(w)) {
      posMap.set(w, tag)
    }
  }

  const keywords = tfidf.extractKeywords(jieba, text, topK, ALLOWED_POS_FOR_EXTRACT)

  const out: ExtractedEntity[] = []
  for (const { keyword, weight } of keywords) {
    const name = keyword.trim()
    if (name.length < 2) continue
    if (STOP_WORDS.has(name)) continue
    if (!VALID_TOKEN.test(name)) continue

    // TF-IDF may return a keyword that was never POS-tagged whole (jieba's
    // keyword extractor and tagger don't always agree on segmentation).
    // Fall back to script-based typing so we don't lose those entities.
    const pos = posMap.get(name)
    const type = pos ? posToType(pos) : /^[\x00-\x7f]+$/.test(name) ? 'term' : 'concept'

    out.push({ name, type, weight })
  }

  return out
}
