import { createContext } from 'react'

export interface MarkdownStreamingValue {
  streaming: boolean
  /** Full markdown source being rendered. CodeBlock uses this plus the
   * mdast `node.position` to detect whether a specific fenced block's closing
   * fence has arrived - so MermaidBlock/SvgBlock can render the moment their
   * block closes, without waiting for the whole message to finish streaming. */
  content: string
}

export const MarkdownStreamingContext = createContext<MarkdownStreamingValue>({
  streaming: false,
  content: ''
})
