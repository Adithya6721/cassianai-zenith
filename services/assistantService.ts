import { callGeminiWithFallback } from "@/services/aiSummarizer";
import type { AssistantResponse } from "@/types";

// ── CASSIAN identity ─────────────────────────────────────────

const CASSIAN_IDENTITY =
  "I am **CASSIAN** — **Code Analysis System for Software Intelligence and Navigation**. " +
  "I help you explore, understand, and interact with software systems intelligently.";

// ── Rule-based knowledge base ────────────────────────────────

interface AssistantRule {
  patterns: RegExp[];
  answer: string;
}

const RULES: AssistantRule[] = [
  // ── Easter egg: For Narnia ─────────────────────────────────
  {
    patterns: [
      /^for narnia[\s!?.]*$/i,
      /^narnia[\s!?.]*$/i,
      /^caspian[\s!?.]*$/i,
      /^aslan[\s!?.]*$/i,
    ],
    answer:
      "I walk the path of knowledge and courage. Every system has its hidden kingdom — explore, and you will discover.",
  },

  // ── Greetings ──────────────────────────────────────────────
  {
    patterns: [
      /^(hi|hello|hey|howdy|yo|hiya|sup|what'?s up)[\s!?.]*$/i,
      /^good (morning|afternoon|evening)/i,
      /^(greetings|salutations)/i,
    ],
    answer:
      "Hey! I'm **CASSIAN** — I can help you navigate, explain features, troubleshoot issues, or just chat. What do you need?",
  },

  // ── CASSIAN identity / what is it ──────────────────────────
  {
    patterns: [
      /what (is|does) cassian/i,
      /what('s| is) cassian/i,
      /what does cassian (stand for|mean)/i,
      /cassian stand for/i,
      /what (is|does) (this|the) app/i,
      /tell me about (this app|cassian)/i,
      /explain (this app|cassian)/i,
    ],
    answer: CASSIAN_IDENTITY,
  },

  // ── Who are you / identity ─────────────────────────────────
  {
    patterns: [
      /who are you/i,
      /what are you/i,
      /are you (an? )?(ai|bot|assistant|robot)/i,
      /tell me about yourself/i,
    ],
    answer: CASSIAN_IDENTITY,
  },

  // ── How to upload ──────────────────────────────────────────
  {
    patterns: [
      /how (do i|to|can i) upload/i,
      /upload.*(repo|repository|code|project)/i,
      /how.*(add|submit|import).*(repo|code|project)/i,
      /where.*(upload|import)/i,
    ],
    answer:
      "Here's how to upload a repository:\n\n" +
      "1. Go to the **Upload** page from the sidebar\n" +
      "2. Choose your source:\n" +
      "   - **GitHub URL** — paste a public repo link\n" +
      "   - **ZIP file** — drag & drop or select a .zip archive\n" +
      "3. Click **Upload** and I'll process it\n" +
      "4. Once done, I'll show you a summary and you can start chatting about the code",
  },

  // ── How repo chat works ────────────────────────────────────
  {
    patterns: [
      /how (does|do) (the )?(repo )?chat work/i,
      /how (to|do i) (use )?(the )?(repo )?chat/i,
      /how (to|can i) ask.*(question|about|code)/i,
      /what can i ask/i,
      /how (does )?code chat/i,
    ],
    answer:
      "Here's how code chat works:\n\n" +
      "1. Go to the **Chat** page from the sidebar\n" +
      "2. Select a previously uploaded repo\n" +
      "3. Type your question in plain English\n" +
      "4. I'll search the code for relevant sections and give you a detailed answer\n\n" +
      "Try asking things like:\n" +
      "- *\"What does the main entry point do?\"*\n" +
      "- *\"How is authentication handled?\"*\n" +
      "- *\"Explain the function processData\"*",
  },

  // ── How assistant works ────────────────────────────────────
  {
    patterns: [
      /how (does|do) (the )?assistant work/i,
      /how (does|do) you work/i,
      /what('s| is) (the )?assistant/i,
      /how (do i|to) use (the )?assistant/i,
    ],
    answer:
      "I'm **CASSIAN** — your global assistant, available on every page.\n\n" +
      "- **Hover** the right edge of your screen to open me\n" +
      "- I answer questions instantly using my built-in knowledge\n" +
      "- For complex or open-ended questions, I generate deeper insights\n" +
      "- I work independently of repository uploads — no repo needed!\n\n" +
      "I know about navigation, features, troubleshooting, and more.",
  },

  // ── Who built this ─────────────────────────────────────────
  {
    patterns: [
      /who (built|made|created|developed|wrote) (this|cassian)/i,
      /who('s| is) the (creator|developer|author|maker)/i,
      /who (is )?behind (this|cassian)/i,
    ],
    answer:
      "I was designed and built as an intelligent code analysis platform. " +
      "My architecture is built on modern web technologies to deliver a fast, responsive experience.",
  },

  // ── Help / capabilities ────────────────────────────────────
  {
    patterns: [
      /^help[\s!?.]*$/i,
      /what can you (do|help with)/i,
      /how (can you|do you) help/i,
      /what (are your|do you have) (features|capabilities)/i,
    ],
    answer:
      "I can help with:\n\n" +
      "- **Navigation** — where to find pages and features\n" +
      "- **Feature explanation** — how upload, chat, and summaries work\n" +
      "- **Troubleshooting** — common issues and fixes\n" +
      "- **About me** — what I am, how I work, what CASSIAN stands for\n" +
      "- **General questions** — anything else, I'll do my best to answer\n\n" +
      "Just ask away!",
  },

  // ── Features list ──────────────────────────────────────────
  {
    patterns: [
      /what (features|functionality)/i,
      /list.*(features|capabilities)/i,
      /what (does|can) (this app|cassian) do/i,
    ],
    answer:
      "Here's what I can do:\n\n" +
      "- **Repository Upload** — ingest via GitHub URL or ZIP file\n" +
      "- **Automatic Parsing** — I extract and chunk all source files\n" +
      "- **AI Summaries** — I generate per-file summaries + architecture overviews\n" +
      "- **Code Chat** — ask me questions about any uploaded repo\n" +
      "- **Global Assistant** — I'm available on every page (that's me!)\n" +
      "- **Smart Fallback** — I automatically adapt to stay reliable\n" +
      "- **Dark/Light Theme** — toggleable with persistent preference\n" +
      "- **Secure Auth** — safe sign-in to protect your data",
  },

  // ── Thanks ─────────────────────────────────────────────────
  {
    patterns: [
      /^(thanks|thank you|thx|ty|cheers)[\s!?.]*$/i,
      /^(much appreciated|appreciate it)/i,
    ],
    answer: "You're welcome! Let me know if you need anything else.",
  },

  // ── Navigation — Home ──────────────────────────────────────
  {
    patterns: [
      /where is (the )?(home|dashboard|main)/i,
      /(go|navigate|take me) to (the )?(home|dashboard)/i,
      /how (do i|to) (get|go) (to )?(home|dashboard)/i,
    ],
    answer:
      'The **Home** page is your dashboard with stats and quick actions. Click **"Home"** in the sidebar, or navigate to `/home`.',
  },

  // ── Navigation — Upload ────────────────────────────────────
  {
    patterns: [
      /where is (the )?upload/i,
      /(go|navigate|take me) to (the )?upload/i,
      /how (do i|to) (get|go) to upload/i,
    ],
    answer:
      'The **Upload** page is in the sidebar. Click **"Upload"** on the left navigation, or go to `/upload`.',
  },

  // ── Navigation — Repositories ──────────────────────────────
  {
    patterns: [
      /where (is|are) (the )?(repos|repositories)/i,
      /(go|navigate|take me) to (the )?(repos|repositories)/i,
      /how (do i|to) (see|view|find) (my )?(repos|repositories)/i,
    ],
    answer:
      'Your uploaded repositories are on the **Repositories** page. Click **"Repositories"** in the sidebar, or navigate to `/repositories`.',
  },

  // ── Navigation — Chat ──────────────────────────────────────
  {
    patterns: [
      /where is (the )?chat/i,
      /(go|navigate|take me) to (the )?chat/i,
      /how (do i|to) (get|go) to chat/i,
    ],
    answer:
      'The **Chat** page is in the sidebar. Click **"Chat"** on the left navigation, or go to `/chat`.',
  },

  // ── Navigation — general ───────────────────────────────────
  {
    patterns: [
      /how (do i|to) navigate/i,
      /where (do i|can i) find/i,
      /show me (the )?pages/i,
      /what pages/i,
    ],
    answer:
      "I have these pages:\n\n" +
      "- **Home** (`/home`) — Dashboard with stats and quick actions\n" +
      "- **Upload** (`/upload`) — Add repos via GitHub URL or ZIP\n" +
      "- **Repositories** (`/repositories`) — Browse uploaded repos\n" +
      "- **Chat** (`/chat`) — Ask me questions about code\n\n" +
      "Use the **sidebar** on the left to navigate between them.",
  },

  // ── Troubleshooting — upload fails ─────────────────────────
  {
    patterns: [
      /upload.*(fail|error|not working|broken|stuck)/i,
      /(can'?t|cannot|unable to) upload/i,
    ],
    answer:
      "If your upload is failing:\n\n" +
      "1. **GitHub URLs** — make sure the repo is public and the URL is correct\n" +
      "2. **ZIP files** — ensure the file is under 50MB and is a valid .zip\n" +
      "3. **Network** — check your internet connection\n" +
      "4. **Retry** — I may be temporarily busy; wait a moment and try again",
  },

  // ── Troubleshooting — chat not responding ──────────────────
  {
    patterns: [
      /chat.*(not working|broken|error|fail|empty|no response)/i,
      /(can'?t|cannot) (get|receive) (an? )?answer/i,
      /ai.*(not responding|down|broken|error)/i,
    ],
    answer:
      "If chat isn't responding:\n\n" +
      "1. Make sure you've uploaded and selected a repository first\n" +
      "2. I may be handling many requests — wait 30 seconds and retry\n" +
      "3. I automatically adapt when under load, so transient issues usually resolve themselves\n" +
      "4. If the problem persists, try re-uploading the repository",
  },

  // ── Troubleshooting — general ──────────────────────────────
  {
    patterns: [
      /^(something'?s? )?(not working|broken|error|bug)/i,
      /i('m| am) (having|getting) (an? )?(error|issue|problem)/i,
      /troubleshoot/i,
    ],
    answer:
      "General troubleshooting:\n\n" +
      "1. **Refresh the page** — clears stale state\n" +
      "2. **Check your connection** — I need internet to process requests\n" +
      "3. **Re-upload** — repository data expires after a while; upload again\n" +
      "4. **Try a different browser** — if styling looks broken\n\n" +
      "Tell me what specific issue you're seeing and I can help further!",
  },

  // ── Theme ──────────────────────────────────────────────────
  {
    patterns: [
      /how (do i|to) (change|switch|toggle) (the )?(theme|mode|dark|light)/i,
      /dark mode/i,
      /light mode/i,
    ],
    answer:
      "To switch between dark and light themes, click the **sun/moon icon** in the top-right corner of the header bar. " +
      "Your preference is saved automatically and persists across sessions.",
  },

  // ── Bye ────────────────────────────────────────────────────
  {
    patterns: [
      /^(bye|goodbye|see you|later|cya|gtg)[\s!?.]*$/i,
    ],
    answer: "See you later! I'll be right here if you need me.",
  },
];

// ── Rule matcher ─────────────────────────────────────────────

function matchRule(question: string): string | null {
  const trimmed = question.trim();

  if (trimmed.length === 0) {
    return "Looks like an empty message! Type a question and I'll do my best to help.";
  }

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(trimmed)) {
        console.log(`[assistantService] Rule matched: "${trimmed}" -> pattern ${pattern}`);
        return rule.answer;
      }
    }
  }

  return null;
}

// ── Gemini fallback prompt ───────────────────────────────────

function buildAssistantPrompt(question: string): string {
  return `You are CASSIAN — Code Analysis System for Software Intelligence and Navigation. Always speak in first person. You are the global sidebar assistant available on every page.

## CASSIAN App Documentation

### What CASSIAN Is
An intelligent code understanding platform. Developers upload a GitHub repo or ZIP file and immediately chat with their code using AI. Makes any codebase explorable in plain English.

### Pages
- **Home** (/home) — Dashboard: recent projects, stats, quick actions.
- **Upload** (/upload) — Ingest via GitHub URL, ZIP drag-and-drop, or raw text paste.
- **Repositories** (/repositories) — Browse all uploaded projects.
- **Chat** (/chat) — Select a project, then ask questions about its code. Strictly single-project scoped.

### How Upload Works
1. Server parses all source files (strips node_modules, binaries, etc.).
2. Files saved to Firestore: projects/{projectId}/files/{fileId}.
3. AI builds a Code Graph mapping file relationships (imports, calls, defines).
4. If AI graph fails, a deterministic file-tree graph is built as fallback.

### How Code Chat Works
Three retrieval modes:
- **Retrieval** ("show me X file") — strict file search, returns raw code only.
- **Documentation** ("explain project structure") — uses architectureData + key files.
- **General** (everything else) — Graph-RAG: traverses Code Graph → fetches only relevant files → calls AI.
Fallback: if graph is empty, keyword-searches all project files.
Data is always scoped to the selected project — never cross-project.

### The Code Graph
- Interactive React Flow visualisation: zoom, pan, auto-fit.
- Node types: File (blue), Directory (slate), Function (purple), Class (amber).
- Edge types: imports, calls, defines.
- Open via "View Graph" button in the project inspector.

### The CASSIAN Assistant (me)
- Opens by hovering the right screen edge.
- Answers app questions, navigates features, troubleshoots, and handles general chat.
- Rule-based instant responses for common questions; AI for complex ones.
- Supports stopping generation mid-response.

### Storage Architecture
- Firestore: projects/{projectId} for metadata/graph; projects/{projectId}/files/{fileId} for file content.
- Firebase Auth with ID token on every API route.

### Key Features
- Graph-RAG retrieval, zero-fail fallbacks, minimalist AI responses (no filler), stop generation, code blocks with copy button, dark/light theme.

## Identity Rules
- First person always. Never "CASSIAN helps..." — say "I help..."
- Never mention Google, Gemini, Firebase, or any AI provider.
- No filler openers (Certainly, Sure, Of course, Here is). Start directly with the answer.
- For off-topic questions, answer helpfully as a general assistant.

## Formatting Rules — MANDATORY (apply to every single response, no exceptions)

CRITICAL: Every response MUST be written in Markdown. Never reply with plain prose paragraphs alone.

### Structure
1. **Summary line first** — open with one sentence that directly answers the question. Then elaborate.
2. Use \`###\` for main section headers and \`####\` for sub-sections when a response covers multiple topics.
3. Use \`---\` to separate distinct topics in long responses (prevents visual flooding).

### Lists (required)
- **Feature lists, app capabilities, options, or any unordered set** → ALWAYS use bullet points (\`- item\`). Never write these as prose.
- **Sequential instructions or how-to steps** → ALWAYS use a numbered list (\`1.\`, \`2.\`, \`3.\`). Never use bullets for ordered steps.
- Nest sub-items with two spaces of indentation when a step has sub-options.

### Headings (required for multi-topic answers)
- Any response that covers more than one topic or has more than four bullet points MUST use \`###\` section headers.
- Use \`####\` for sub-sections within a section.
- Never write a long response as a single flat block of text.

### Highlighting
- **Bold** all UI element names exactly as they appear in the app: **Upload**, **Chat**, **Repositories**, **Dev Inspector**, **View Graph**, **Change Project**.
- Use \`inline code\` for: file paths (\`projects/{projectId}/files\`), technical terms (\`architectureData\`), API routes (\`/api/chat\`), and code identifiers.
- Use **bold** for critical warnings or key takeaways a developer must not miss.
- Use *italics* for tips, secondary notes, or gentle emphasis.
- Use \`---\` horizontal rules to visually separate long sections.

## User's Question
"${question}"

Answer using the documentation if relevant, or answer generally if not.`;
}

// ── Public API ───────────────────────────────────────────────

export async function askAssistant(question: string): Promise<AssistantResponse> {
  // Step 1: Try rule-based match
  const ruleAnswer = matchRule(question);
  if (ruleAnswer) {
    console.log("[assistantService] Returning rule-based response");
    return {
      question,
      answer: ruleAnswer,
      modelUsed: "rule-based",
    };
  }

  // Step 2: Fall back to Gemini
  console.log(`[assistantService] No rule matched, calling Gemini for: "${question.slice(0, 80)}..."`);

  const prompt = buildAssistantPrompt(question);
  const result = await callGeminiWithFallback(
    prompt,
    "I'm having trouble reaching the AI service right now. Try again in a moment, or ask me something about how to use CASSIAN!",
    { temperature: 0.5, maxOutputTokens: 2048 }
  );

  console.log(`[assistantService] AI response from model=${result.model}`);

  return {
    question,
    answer: result.text,
    modelUsed: result.model,
  };
}
