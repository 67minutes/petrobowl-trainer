export type RandomizerQuestion = {
  id: string;
  assignedTo: string | null;
};

export type RandomizerOptions = {
  count: number;
  seed?: number;
};

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) {
    value += 2147483646;
  }
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function shuffle<T>(items: T[], seed = Date.now()) {
  const random = seededRandom(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function drawBalancedQuestions(
  questions: RandomizerQuestion[],
  options: RandomizerOptions
) {
  const groups = new Map<string, RandomizerQuestion[]>();
  for (const question of questions) {
    const key = question.assignedTo ?? "unowned";
    groups.set(key, [...(groups.get(key) ?? []), question]);
  }

  const shuffledGroups = [...groups.entries()].map(([key, group], index) => ({
    key,
    questions: shuffle(group, (options.seed ?? Date.now()) + index)
  }));

  const drawn: RandomizerQuestion[] = [];
  let cursor = 0;

  while (drawn.length < options.count && shuffledGroups.some((group) => group.questions.length)) {
    const group = shuffledGroups[cursor % shuffledGroups.length];
    const next = group.questions.shift();
    if (next) {
      drawn.push(next);
    }
    cursor += 1;
  }

  return drawn;
}
