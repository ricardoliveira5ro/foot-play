interface GuessResult {
  letter: string;
  result: "CORRECT" | "PRESENT" | "ABSENT";
}

type IndexedResult = GuessResult & { index: number };

export function normalize(name: string): string {
  return name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-']/g, '');
}

export function getWordBoundaries(name: string): number[] {
  const boundaries: number[] = [];
  let normalizedIndex = 0;

  for (const char of name) {
    if (char === ' ' || char === '-' || char === "'") {
      if (boundaries[boundaries.length - 1] !== normalizedIndex) {
        boundaries.push(normalizedIndex);
      }

    } else if (/[\u0300-\u036f]/.test(char)) {
      continue;

    } else {
      normalizedIndex++;
    }
  }
  
  return boundaries;
}

export function evaluateGuess(guess: string, target: string): GuessResult[]{
  const normalizedName = normalize(target);
  const normalizedGuess = normalize(guess);

  let correctGuesses: IndexedResult[] = [];
  const correctIndexes: number[] = [];

  for (let i = 0; i < normalizedName.length; i++) {
    if (normalizedGuess.charAt(i) == normalizedName.charAt(i)) {
      correctGuesses.push({ index: i, letter: normalizedGuess.charAt(i).toUpperCase(), result: "CORRECT" })
      correctIndexes.push(i)
    }
  }

  let presentGuesses: IndexedResult[] = [];
  const presentIndexes: number[] = [];
  const presentGuessIndexes: number[] = [];

  for (let i = 0; i < normalizedName.length; i++) {
    if (correctIndexes.includes(i)) continue;

    for (let j = 0; j < normalizedName.length; j++) {
      if (!correctIndexes.includes(j) && !presentIndexes.includes(j) && normalizedGuess.charAt(i) == normalizedName.charAt(j)) {
        presentGuesses.push({ index: i, letter: normalizedGuess.charAt(i).toUpperCase(), result: "PRESENT" })
        presentIndexes.push(j);
        presentGuessIndexes.push(i);
        break;
      }
    }
  }

  let absentGuesses: IndexedResult[] = [];

  for (let i = 0; i < normalizedName.length; i++) {
    if (!correctIndexes.includes(i) && !presentGuessIndexes.includes(i)) {
      absentGuesses.push({ index: i, letter: normalizedGuess.charAt(i).toUpperCase(), result: "ABSENT" })
    }
  }
  

  return [...correctGuesses, ...presentGuesses, ...absentGuesses]
    .sort((a, b) => a.index - b.index)
    .map(({ index, ...rest }) => rest);
}

export function evaluateGuessWithResult(guess: string, target: string): { results: GuessResult[], isCorrect: boolean } {
  const results = evaluateGuess(guess, target);

  return { results, isCorrect: results.every(r => r.result == "CORRECT") };
}