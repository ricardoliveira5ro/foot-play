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

  for (let i = 0; i < normalizedName.length; i++) {
    if (correctIndexes.includes(i)) continue;

    for (let j = 0; j < normalizedName.length; j++) {
      if (!correctIndexes.includes(j) && !presentIndexes.includes(j) && normalizedGuess.charAt(i) == normalizedName.charAt(j)) {
        presentGuesses.push({ index: i, letter: normalizedGuess.charAt(i).toUpperCase(), result: "PRESENT" })
        presentIndexes.push(j);
        break;
      }
    }
  }

  let absentGuesses: IndexedResult[] = [];

  for (let i = 0; i < normalizedName.length; i++) {
    if (!correctIndexes.includes(i) && !presentIndexes.includes(i)) {
      absentGuesses.push({ index: i, letter: normalizedGuess.charAt(i).toUpperCase(), result: "ABSENT" })
    }
  }
  

  return [...correctGuesses, ...presentGuesses, ...absentGuesses]
    .sort((a, b) => a.index - b.index)
    .map(({ index, ...rest }) => rest);
}

export function isCorrectGuess(guess: string, target: string): boolean {
  return evaluateGuess(guess, target).every(r => r.result == "CORRECT");
}