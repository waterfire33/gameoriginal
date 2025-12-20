/*
SYSTEM PROMPT: CEFR-LEVEL DEFINITIONS WITH CONCRETE USAGE

You are an AI vocabulary assistant for an educational game. Your task is to provide **vocabulary definitions and examples** that match the CEFR English level selected by the teacher. Follow these rules strictly. Breaking these rules is not allowed.

---

GENERAL RULES FOR ALL LEVELS:
1. Never include Latin, etymology, IPA pronunciation, or dictionary-style wording.
2. Never use advanced or abstract words unless the CEFR level allows them.
3. Do NOT provide incomplete or vague definitions. Every definition must be **a full, understandable sentence**.
4. Always provide **a short example sentence** showing the word in context.
5. Use **plain English written by you**, not copied from online dictionaries.

---

CEFR LEVEL RULES:

A1 – Beginner
- Maximum sentence length: 7–10 words.
- Only everyday, concrete words.
- No abstract ideas or figurative language.
- Only one sentence for the definition.
- Example sentence must show a clear, relatable situation.
- Format:
Definition: <one complete, simple sentence>
Example: <one simple sentence showing the word in context>

Sample:
Word: "follow up"
Definition: "I call my friend again to check the homework."
Example: "I follow up with my friend about the homework."

---

A2 – Elementary
- Maximum sentence length: 12–15 words.
- Simple everyday language.
- Simple past tense allowed.
- No abstract/academic words.
- 1–2 sentences for the definition.
- Example sentence must show a clear situation.
- Format:
Definition: <1–2 simple sentences>
Example: <1 example sentence showing usage>

Sample:
Word: "follow up"
Definition: "After the meeting, I send an email to continue the task."
Example: "I follow up with my teacher after class."

---

B1 – Intermediate
- Maximum sentence length: 18–20 words.
- May include opinions or reasons.
- No academic or technical terms unless very common.
- Definition must be clear and contextual.
- Example sentence must show realistic usage.
- Format:
Definition: <1–2 sentences>
Example: <1 sentence showing context>

Sample:
Word: "follow up"
Definition: "I follow up on my project by checking the results next week."
Example: "She followed up with her manager after the presentation."

---

B2 – Upper-Intermediate
- Maximum sentence length: 25 words.
- May include abstract or slightly technical ideas.
- Avoid very rare academic words.
- Definitions must be complete sentences.
- Example sentence must illustrate real-life usage.

Sample:
Word: "flexible"
Definition: "Although both options have advantages, I believe online classes are more flexible for students."
Example: "He has a flexible schedule at work."

---

C1 – Advanced
- Maximum sentence length: 40 words.
- May include academic or professional language.
- No Latin or dictionary-style etymology.
- Definitions must be precise and clear.
- Example sentence must show professional, academic, or nuanced usage.

Sample:
Word: "intervention"
Definition: "The data suggests a significant improvement in performance following the intervention, demonstrating the strategy’s effectiveness."
Example: "The government implemented an intervention to reduce pollution levels."

---

ADDITIONAL INSTRUCTIONS:
- When a teacher selects a CEFR level (A1, A2, B1, B2, C1), always **strictly follow that level’s rules**.
- Do not search or copy definitions from online dictionaries.
- Ensure definitions are **concrete, complete, and readable** for students at that level.
- Always provide **both a definition and an example sentence**.
- Reject any definition that is vague, incomplete, abstract, or includes forbidden content (Latin, etymology, IPA, advanced terms for lower levels).

---

END OF SYSTEM PROMPT
*/

// Vocabulary Matching Game
const gameDiv = document.getElementById('game')!;
gameDiv.style.fontFamily = 'Arial, sans-serif';
gameDiv.style.maxWidth = '800px';
gameDiv.style.margin = '0 auto';
gameDiv.style.padding = '20px';

const CEFR_LEVELS = {
  "A1": {
    "name": "Beginner",
    "description": "Basic ability to understand short, simple words and phrases.",
    "skills": [
      "Understand very basic vocabulary",
      "Introduce themselves",
      "Answer simple personal questions",
      "Understand slow, clear speech"
    ],
    "definition_rules": {
      "max_sentence_length": 8,
      "max_word_length": 8,
      "allowed_concepts": ["basic nouns", "basic verbs", "everyday objects", "simple adjectives"],
      "avoid": ["abstract ideas", "technical terms", "complex grammar"],
      "language_style": "simple, slow, concrete"
    }
  },
  "A2": {
    "name": "Elementary",
    "description": "Can understand common phrases and describe simple events.",
    "skills": [
      "Understand everyday expressions",
      "Describe past and present events",
      "Communicate simple needs"
    ],
    "definition_rules": {
      "max_sentence_length": 12,
      "max_word_length": 10,
      "allowed_concepts": ["daily routines", "shopping", "family", "school", "simple past actions"],
      "avoid": ["advanced vocabulary", "figurative language"],
      "language_style": "familiar, simple, short sentences"
    }
  },
  "B1": {
    "name": "Intermediate",
    "description": "Can understand main ideas of clear speech and handle common situations.",
    "skills": [
      "Understand straightforward conversations",
      "Write simple paragraphs",
      "Discuss opinions and plans"
    ],
    "definition_rules": {
      "max_sentence_length": 18,
      "max_word_length": 12,
      "allowed_concepts": ["opinions", "dreams", "plans", "work situations", "travel situations"],
      "avoid": ["specialized academic words", "complex idioms"],
      "language_style": "clear, direct, everyday English"
    }
  },
  "B2": {
    "name": "Upper Intermediate",
    "description": "Can understand more complex texts and interact fluently.",
    "skills": [
      "Understand abstract or technical topics",
      "Speak fluently with native speakers",
      "Write detailed essays",
      "Argue a point of view"
    ],
    "definition_rules": {
      "max_sentence_length": 25,
      "max_word_length": 14,
      "allowed_concepts": ["abstract ideas", "academic topics", "nuance"],
      "avoid": ["very rare vocabulary"],
      "language_style": "fluent, precise, well-structured"
    }
  },
  "C1": {
    "name": "Advanced",
    "description": "Can use English naturally, fluently, and with academic/professional tone.",
    "skills": [
      "Understand complex, long texts",
      "Use academic or professional vocabulary",
      "Express ideas naturally and precisely",
      "Write advanced, structured texts"
    ],
    "definition_rules": {
      "max_sentence_length": 40,
      "max_word_length": 20,
      "allowed_concepts": ["academic language", "professional terms", "complex syntax"],
      "avoid": ["none unless extremely specialized"],
      "language_style": "high-level, nuanced, analytical"
    }
  }
};

let words: string[] = [];
let definitions: string[] = [];
let level: string = 'A1';
let gameBoard: HTMLElement | null = null;
let firstSelection: { type: 'word' | 'definition'; index: number } | null = null;
let matchedPairs = new Set<number>();

function playBellSound() {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance('excellent');
    window.speechSynthesis.speak(utterance);
  }
}

// Input UI
const inputContainer = document.createElement('div');
inputContainer.style.textAlign = 'center';
inputContainer.style.marginBottom = '20px';

const title = document.createElement('h1');
title.textContent = 'Vocabulary Matching Game';
title.style.color = 'white';
inputContainer.appendChild(title);

const wordsLabel = document.createElement('label');
wordsLabel.textContent = 'Enter words (one per line):';
wordsLabel.style.display = 'block';
wordsLabel.style.color = 'white';
wordsLabel.style.marginBottom = '10px';
inputContainer.appendChild(wordsLabel);

const wordsTextarea = document.createElement('textarea');
wordsTextarea.rows = 10;
wordsTextarea.cols = 50;
wordsTextarea.placeholder = 'apple\nbanana\ncherry\n...';
inputContainer.appendChild(wordsTextarea);

const levelLabel = document.createElement('label');
levelLabel.textContent = 'English Level:';
levelLabel.style.display = 'block';
levelLabel.style.color = 'white';
levelLabel.style.marginTop = '20px';
levelLabel.style.marginBottom = '10px';
inputContainer.appendChild(levelLabel);

const levelSelect = document.createElement('select');
levelSelect.style.marginBottom = '20px';
Object.keys(CEFR_LEVELS).forEach(lvl => {
  const option = document.createElement('option');
  option.value = lvl;
  option.textContent = `${lvl} - ${CEFR_LEVELS[lvl as keyof typeof CEFR_LEVELS].name}`;
  levelSelect.appendChild(option);
});
inputContainer.appendChild(levelSelect);

const startButton = document.createElement('button');
startButton.textContent = 'Start Game';
startButton.style.padding = '10px 20px';
startButton.style.fontSize = '16px';
startButton.style.cursor = 'pointer';
startButton.style.backgroundColor = 'blue';
startButton.style.color = 'white';
startButton.style.border = 'none';
startButton.style.borderRadius = '5px';
startButton.addEventListener('click', startGame);
inputContainer.appendChild(startButton);

const statusDiv = document.createElement('div');
statusDiv.style.color = 'white';
statusDiv.style.textAlign = 'center';
statusDiv.style.marginTop = '20px';
inputContainer.appendChild(statusDiv);

gameDiv.appendChild(inputContainer);

async function startGame() {
  const wordsText = wordsTextarea.value.trim();
  if (!wordsText) {
    statusDiv.textContent = 'Please enter some words.';
    return;
  }

  words = wordsText.split('\n').map(w => w.trim()).filter(w => w);
  level = levelSelect.value;

  if (words.length < 2) {
    statusDiv.textContent = 'Please enter at least 2 words.';
    return;
  }

  statusDiv.textContent = 'Fetching definitions...';
  startButton.disabled = true;

  try {
    definitions = [];
    for (const word of words) {
      const def = await fetchDefinition(word, level);
      if (def) {
        definitions.push(def);
      } else {
        statusDiv.textContent = `Could not find definition for "${word}".`;
        startButton.disabled = false;
        return;
      }
    }

    statusDiv.textContent = '';
    createGameBoard();
  } catch (error) {
    statusDiv.textContent = 'Error fetching definitions. Please try again.';
    startButton.disabled = false;
  }
}



function processDefinition(level: string, def: string, word: string): string {
  const rules = CEFR_LEVELS[level as keyof typeof CEFR_LEVELS].definition_rules;
  let processed = def;

  // Simplify based on level rules
  // Split into sentences
  const sentences = processed.split(/[.!?]+/).filter(s => s.trim());

  // Take first sentence
  if (sentences.length > 0) {
    let sentence = sentences[0].trim();

    // Split into words
    const wordsArr = sentence.split(/\s+/);

    // Limit words based on max_sentence_length
    const limitedWords = wordsArr.slice(0, rules.max_sentence_length);
    sentence = limitedWords.join(' ');

    // For lower levels, make it simpler
    if (level === 'A1') {
      sentence = sentence.replace(/[^a-zA-Z\s]/g, '').toLowerCase(); // Remove punctuation, lowercase
    }

    processed = sentence;
  }

  // Return only the processed definition sentence (no labels, no examples)
  return processed;
}

async function fetchDefinition(word: string, level: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data[0] || !data[0].meanings || !data[0].meanings[0]) return null;

    // Get the first definition
    const definition = data[0].meanings[0].definitions[0].definition;

    // Process according to level rules
    return processDefinition(level, definition, word);
  } catch {
    return null;
  }
}

function createGameBoard() {
  inputContainer.style.display = 'none';

  gameBoard = document.createElement('div');
  gameBoard.style.display = 'flex';
  gameBoard.style.justifyContent = 'space-between';
  gameBoard.style.alignItems = 'center';
  gameBoard.style.height = '600px';

  const wordsSide = document.createElement('div');
  wordsSide.style.display = 'grid';
  wordsSide.style.gridTemplateColumns = `repeat(${Math.ceil(words.length / 3)}, 120px)`;
  wordsSide.style.gridTemplateRows = `repeat(3, 120px)`;
  wordsSide.style.gap = '10px';

  const definitionsSide = document.createElement('div');
  definitionsSide.style.display = 'grid';
  definitionsSide.style.gridTemplateColumns = `repeat(${Math.ceil(words.length / 3)}, 120px)`;
  definitionsSide.style.gridTemplateRows = `repeat(3, 120px)`;
  definitionsSide.style.gap = '10px';

  // Randomize positions
  const wordIndices = [...Array(words.length).keys()].sort(() => Math.random() - 0.5);
  const defIndices = [...Array(definitions.length).keys()].sort(() => Math.random() - 0.5);

  wordIndices.forEach((wordIndex, pos) => {
    const square = createSquare('word', wordIndex, words[wordIndex]);
    wordsSide.appendChild(square);
  });

  defIndices.forEach((defIndex, pos) => {
    const square = createSquare('definition', defIndex, definitions[defIndex]);
    definitionsSide.appendChild(square);
  });

  gameBoard.appendChild(wordsSide);
  gameBoard.appendChild(definitionsSide);
  gameDiv.appendChild(gameBoard);
}

function createSquare(type: 'word' | 'definition', index: number, content: string): HTMLElement {
  const square = document.createElement('div');
  square.style.width = '120px';
  square.style.height = '120px';
  square.style.backgroundColor = getRandomColor();
  square.style.display = 'flex';
  square.style.alignItems = 'center';
  square.style.justifyContent = 'center';
  square.style.cursor = 'pointer';
  square.style.borderRadius = '10px';
  square.style.fontSize = '14px';
  square.style.fontWeight = 'bold';
  square.style.textAlign = 'center';
  square.style.padding = '5px';
  square.style.boxSizing = 'border-box';
  square.style.color = 'transparent'; // Hide text initially
  square.textContent = content;

  square.addEventListener('click', () => handleSquareClick(type, index, square));

  return square;
}

function getRandomColor(): string {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function handleSquareClick(type: 'word' | 'definition', index: number, square: HTMLElement) {
  if (matchedPairs.has(type === 'word' ? index : index + words.length)) return;

  if (firstSelection === null) {
    // First selection
    firstSelection = { type, index };
    square.style.color = 'black';
  } else {
    // Second selection
    if (firstSelection.type === type && firstSelection.index === index) {
      // Same square, ignore
      return;
    }

    // Reveal second
    square.style.color = 'black';

    // Check match
    setTimeout(() => {
      if (firstSelection!.type !== type && firstSelection!.index === index) {
        // Match!
        playBellSound();
        matchedPairs.add(firstSelection!.index);
        matchedPairs.add(index + (type === 'definition' ? words.length : 0));

        // Find and remove the squares
        const allSquares = gameBoard!.querySelectorAll('div[style*="cursor: pointer"]');
        allSquares.forEach(sq => {
          const content = (sq as HTMLElement).textContent || '';
          const sqType = words.includes(content) ? 'word' : 'definition';
          const sqIndex = sqType === 'word' ? words.indexOf(content) : definitions.indexOf(content);
          if ((sqType === firstSelection!.type && sqIndex === firstSelection!.index) ||
              (sqType === type && sqIndex === index)) {
            (sq as HTMLElement).style.display = 'none';
          }
        });
      } else {
        // No match, hide both
        const allSquares = gameBoard!.querySelectorAll('div[style*="cursor: pointer"]');
        allSquares.forEach(sq => {
          if ((sq as HTMLElement).style.color === 'black') {
            (sq as HTMLElement).style.color = 'transparent';
          }
        });
      }

      firstSelection = null;

      // Check win
      if (matchedPairs.size === words.length * 2) {
        setTimeout(() => {
          alert('Congratulations! You matched all pairs!');
          resetGame();
        }, 500);
      }
    }, 1000);
  }
}

function resetGame() {
  if (gameBoard) {
    gameDiv.removeChild(gameBoard);
    gameBoard = null;
  }
  inputContainer.style.display = 'block';
  startButton.disabled = false;
  statusDiv.textContent = '';
  matchedPairs.clear();
  firstSelection = null;
}