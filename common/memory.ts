import gpt from 'gpt-3-encoder'
import { AppSchema } from '../srv/db/schema'
import { AIAdapter } from './adapters'
import { defaultPresets, getFallbackPreset } from './presets'
import { BOT_REPLACE, SELF_REPLACE } from './prompt'

type MemoryOpts = {
  chat: AppSchema.Chat
  char: AppSchema.Character
  settings?: Partial<AppSchema.UserGenPreset>
  book?: AppSchema.MemoryBook
  lines: string[]
  members: AppSchema.Profile[]
}

type Match = {
  /** The order in which is was found in the book's entry list */
  id: number

  /** The position within the prompt that it was found. Larger means closer to the end */
  index: number

  entry: AppSchema.MemoryEntry

  tokens: number

  text: string
}

/**
 * When determine the insertion order of an entry:
 * - Highest priority wins
 * - If there is a priority tie, entry that is "most recently referred to" wins
 * - If there is a tie due to using the same keyword, the earliest entry in the book wins
 */

export function getMemoryPrompt({ chat, book, settings, ...opts }: MemoryOpts) {
  if (!book?.entries) return
  const sender = opts.members.find((mem) => mem.userId === chat.userId)?.handle || 'You'

  const depth = settings?.memoryDepth || defaultPresets.basic.memoryDepth
  const memoryBudget = settings?.memoryContextLimit || defaultPresets.basic.memoryContextLimit
  const reveseWeight = settings?.memoryReverseWeight ?? defaultPresets.basic.memoryReverseWeight

  if (isNaN(depth) || depth <= 0) return

  const matches: Match[] = []

  let id = 0
  const combinedText = opts.lines.join(' ').toLowerCase()
  const baseText = `${opts.char.name}'s Memory: `

  for (const entry of book.entries) {
    let index = -1
    for (const keyword of entry.keywords) {
      const match = combinedText.lastIndexOf(keyword.toLowerCase())
      if (match === -1 || match < index) continue
      index = match
    }

    if (index > -1) {
      const text = entry.entry.replace(BOT_REPLACE, opts.char.name).replace(SELF_REPLACE, sender)
      const tokens = gpt.encode(text).length
      matches.push({ index, entry, id: ++id, tokens, text })
    }
  }

  matches.sort(byPriorityThenIndex)

  const entries = matches.reduce(
    (prev, curr) => {
      if (prev.budget >= memoryBudget) return prev
      if (prev.budget + curr.tokens > memoryBudget) return prev

      prev.budget += curr.tokens
      prev.list.push(curr)
      return prev
    },
    { list: [] as Match[], budget: gpt.encode(baseText).length }
  )

  const prompt = entries.list
    .map(({ text }) => text)
    .reverse()
    .join('\n')

  return {
    prompt: `${baseText}${prompt}`,
    entries,
    tokens: entries.budget,
  }
}

function byPriorityThenIndex(
  { id: lid, index: li, entry: l }: Match,
  { id: rid, index: ri, entry: r }: Match
) {
  if (l.weight !== r.weight) return l.weight > r.weight ? 1 : -1
  if (li !== ri) return li > ri ? 1 : -1
  return lid > rid ? 1 : lid === rid ? 0 : -1
}
