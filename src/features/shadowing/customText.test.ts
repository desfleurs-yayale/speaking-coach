// Self-check for the pasted-text parser:  node src/features/shadowing/customText.test.ts
import { estimateLevel, parseCustomText, splitSentences } from './customText.ts'

let failed = 0
let passed = 0

function same(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) passed++
  else {
    failed++
    console.error(`✗ ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
  }
}

const pairs = (input: string) => parseCustomText(input).map((s) => [s.text, s.zh])

same('one sentence per line', pairs('Hello there.\nHow are you?\n'), [
  ['Hello there.', ''],
  ['How are you?', ''],
])
same('english + chinese lines', pairs('Good morning!\n早上好！\n\nCan I help you?\n需要帮忙吗？'), [
  ['Good morning!', '早上好！'],
  ['Can I help you?', '需要帮忙吗？'],
])
same('mixed line', pairs('See you tomorrow. 明天见。'), [['See you tomorrow.', '明天见。']])
same('paragraph is split', pairs('I woke up early. The sky was blue! Did you see it? Mr. Smith did.'), [
  ['I woke up early.', ''],
  ['The sky was blue!', ''],
  ['Did you see it?', ''],
  ['Mr. Smith did.', ''],
])
same('paragraph with matching translation', pairs('I am tired. Let us go home.\n我累了。我们回家吧。'), [
  ['I am tired.', '我累了。'],
  ['Let us go home.', '我们回家吧。'],
])
same('chinese without english is ignored', pairs('只是一些中文。\nOkay then.'), [['Okay then.', '']])
same('lowercase after period does not split', splitSentences('It costs 3.5 dollars. ok fine.'), ['It costs 3.5 dollars. ok fine.'])
same('quotes', splitSentences('"Hi!" She smiled. "Bye."'), ['"Hi!"', 'She smiled.', '"Bye."'])
same(
  'long sentence split at comma',
  splitSentences(
    'When I finally arrived at the little station after a very long and tiring day of travelling across the country, I sat down on a bench and watched the sun slowly go down behind the hills.',
  ).length,
  2,
)
same('ids', parseCustomText('A b.\nC d.').map((s) => s.id), ['s1', 's2'])
same('level', estimateLevel(parseCustomText('Hi there.\nHow are you?')), 1)

console.log(`customText self-check: ${passed} passed, ${failed} failed`)
if (failed) throw new Error(`${failed} customText check(s) failed`)
