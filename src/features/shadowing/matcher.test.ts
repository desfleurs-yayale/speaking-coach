// Self-check for the word matcher. No test runner needed (Node 22.18+ strips the types):
//   node src/features/shadowing/matcher.test.ts
// Throws (exit code 1) when a case fails.
import {
  isComplete,
  matchTranscript,
  normalizeToken,
  scorableCount,
  similarity,
  splitWords,
  tokenizeSentence,
} from './matcher.ts'

let failed = 0
let passed = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++
  else {
    failed++
    console.error(`✗ ${name}${detail ? `\n    ${detail}` : ''}`)
  }
}

/** Display words of `sentence` that were not hit after hearing `heard`. */
function missed(sentence: string, heard: string): string[] {
  const words = tokenizeSentence(sentence)
  const hits = matchTranscript(words, heard)
  return words.filter((w) => w.units.length > 0 && !hits.has(w.index)).map((w) => w.display)
}

function expectMissed(sentence: string, heard: string, want: string[]) {
  const got = missed(sentence, heard)
  check(`"${sentence}" <- "${heard}"`, JSON.stringify(got) === JSON.stringify(want), `missed ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

// normalisation and splitting
check('normalize punctuation', normalizeToken('"Morning!"') === 'morning')
check('normalize curly apostrophe', normalizeToken('I’m') === "i'm")
check('normalize diacritics', normalizeToken('Café') === 'cafe')
check('split dash', JSON.stringify(splitWords('Wait—what? Hmm...okay')) === JSON.stringify(['Wait—', 'what?', 'Hmm...', 'okay']))
check('punctuation-only token is not scored', scorableCount(tokenizeSentence('Wait — what?')) === 2)
check('similarity', Math.abs(similarity('kitten', 'sitting') - 4 / 7) < 1e-9)

// plain reading, skipped words, fillers
expectMissed('Good morning! Can I get a large latte, please?', 'good morning can I get a large latte please', [])
expectMissed('Good morning! Can I get a large latte, please?', 'good morning can I get large latte please', ['a'])
expectMissed('Good morning! Can I get a large latte, please?', 'um good uh morning', ['Can', 'I', 'get', 'a', 'large', 'latte,', 'please?'])
expectMissed('Could you make it with oat milk?', 'could you make it with out milk', ['oat'])

// contractions both ways
expectMissed("I'm fine, it's okay.", 'I am fine it is ok', [])
expectMissed('I am happy that it is sunny.', "I'm happy that it's sunny", [])
expectMissed("We can't stay, but we won't leave.", 'we cannot stay but we will not leave', [])
expectMissed("I'm gonna try.", 'I am going to try', [])
expectMissed('I am going to try.', "I'm gonna try", [])
expectMissed("Let's go!", 'lets go', [])
expectMissed("You're right.", 'your right', [])
expectMissed('Is this your bag?', "is this you're bag", [])
expectMissed("It's raining.", 'its raining', [])
expectMissed('Put it over there.', "put it over they're", [])
expectMissed("This is Tom's car.", 'this is toms car', [])
expectMissed('I’m here.', "I'm here", [])

// numbers, okay, homophones, compounds
expectMissed('I have two cats and twelve eggs.', 'I have 2 cats and 12 eggs', [])
expectMissed('Room 7, please.', 'room seven please', [])
expectMissed('OK, see you at 100 Main Street.', 'okay see you at 100 main street', [])
expectMissed('I want to come too.', 'I want two come to', [])
expectMissed('I go there every day.', 'I go there everyday', [])
expectMissed('This is my everyday bag.', 'this is my every day bag', [])
expectMissed('It is a well-known café.', 'it is a well known cafe', [])
expectMissed('Salt & pepper', 'salt and pepper', [])

// fuzzy matching: long words only, similarity >= 0.75
expectMissed('What a beautiful afternoon!', 'what a beautifull afternon', [])
expectMissed('My cat is cute.', 'my cap is cute', ['cat'])
expectMissed('I love latte art.', 'I love lady art', ['latte'])
expectMissed('They are comfortable shoes.', 'they are comfortably shoes', [])

// look-ahead and jumps
expectMissed('Alpha bravo charlie delta echo foxtrot golf.', 'alpha echo foxtrot golf', ['bravo', 'charlie', 'delta'])
expectMissed('Alpha bravo charlie delta echo foxtrot golf.', 'alpha golf', ['bravo', 'charlie', 'delta', 'echo', 'foxtrot'])
expectMissed('I saw a big red fox and a cat.', 'I cat', ['saw', 'a', 'big', 'red', 'fox', 'and', 'a', 'cat.'])
// re-reading a phrase picks up a word missed on the first pass
expectMissed('I would like a cup of hot chocolate.', 'I would like a cop of hot chocolate a cup of', [])
// words said in the wrong order do not hit short words far away
expectMissed('The cat sat on the mat.', 'mat the cat', ['sat', 'on', 'the', 'mat.'])

// completion
{
  const words = tokenizeSentence('Wait — what?')
  check('complete ignores punctuation', isComplete(words, matchTranscript(words, 'wait what')))
  check('incomplete', !isComplete(words, matchTranscript(words, 'wait')))
  check('empty sentence is never complete', !isComplete(tokenizeSentence('—'), new Set()))
}

console.log(`matcher self-check: ${passed} passed, ${failed} failed`)
if (failed) throw new Error(`${failed} matcher check(s) failed`)
