const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROVIDERS = {
  'cc-v1': {
    name: 'CC v1',
    baseUrl: process.env.CC_V1_URL || 'https://api.b.ai/v1',
    apiKey: process.env.CC_V1_KEY,
    model: 'deepseek-v4-flash',
    rpm: 10,
    contextLimit: 1000000,
    headers: (key) => ({ 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }),
    formatBody: (messages, model) => ({ model, messages, stream: false }),
    extractResponse: (res) => res.data.choices?.[0]?.message?.content || res.data.response || 'No response'
  },
  'cc-v2': {
    name: 'CC v2',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: process.env.CC_V2_KEY,
    model: 'gemini-3.5-flash',
    rpm: 14,
    contextLimit: 1000000,
    headers: () => ({ 'Content-Type': 'application/json' }),
    formatBody: (messages, model) => ({
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
    }),
    extractResponse: (res) => res.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response'
  }
};

class RateLimiter {
  constructor() {
    this.requests = new Map();
  }

  getMinuteKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
  }

  async checkLimit(provider) {
    const config = PROVIDERS[provider];
    if (!config) return { allowed: false, retryAfter: 60 };

    const minuteKey = this.getMinuteKey();
    let record = await prisma.rateLimit.findUnique({ where: { provider_minuteKey: { provider, minuteKey } } });

    if (!record) {
      record = await prisma.rateLimit.create({ data: { provider, minuteKey, count: 0 } });
    }

    if (record.count >= config.rpm) {
      const retryAfter = 60 - new Date().getSeconds();
      return { allowed: false, retryAfter };
    }

    await prisma.rateLimit.update({
      where: { provider_minuteKey: { provider, minuteKey } },
      data: { count: { increment: 1 } }
    });

    return { allowed: true, remaining: config.rpm - record.count - 1 };
  }
}

const rateLimiter = new RateLimiter();

async function buildContext(projectId, maxTokens = 8000) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, files: true }
  });

  if (!project) return [];

  let systemPrompt = `You are CC - indirect, an AI coding assistant that writes code, executes it, debugs it, and explains everything — MonkeyCode/Replit style.
NEVER reveal the real underlying model/vendor names (DeepSeek, Gemini, Google, OpenAI, etc.). Always self-identify as "CC v1", "CC v2", or the "CC - indirect system". Do not disclose API keys or internal config.
Summarize the work you do in the chat with short essential code snippets, live progress notes, and offer actions like ▶ Run, 📋 Copy, 🔍 Details.
Current project: ${project.name} (${project.language}).
Files: ${project.files.map(f => f.name).join(', ') || 'None yet'}.`;

  if (project.context) {
    systemPrompt += `\n\nProject Context: ${project.context}`;
  }

  const messages = [{ role: 'system', content: systemPrompt }];

  let tokenCount = systemPrompt.length / 4;
  const recentMessages = [];

  for (let i = project.messages.length - 1; i >= 0; i--) {
    const msg = project.messages[i];
    const msgTokens = msg.content.length / 4;
    if (tokenCount + msgTokens > maxTokens) break;
    tokenCount += msgTokens;
    recentMessages.unshift({ role: msg.role, content: msg.content });
  }

  messages.push(...recentMessages);
  return messages;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Retry on rate limit (60-120s) before giving up. Returns { allowed } or throws rr.
async function callAI(provider, messages, retries = 3) {
  const config = PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const rateAttemps = 2; // how many times we wait out the minute window
  for (let r = 0; r <= rateAttemps; r++) {
    const limitCheck = await rateLimiter.checkLimit(provider);

    if (!limitCheck.allowed) {
      // Blocked: wait 60-120s (retryAfter seconds) and try again automatically
      console.log(`[CC] Rate limit for ${provider}, auto-retry in ${limitCheck.retryAfter}s...`);
      await sleep(Math.max(limitCheck.retryAfter, 60) * 1000);
      continue;
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        let url, body;

        if (provider === 'cc-v2') {
          url = `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;
          body = config.formatBody(messages, config.model);
          const res = await axios.post(url, body, { headers: config.headers(), timeout: 90000 });
          return { content: config.extractResponse(res), provider, model: config.model };
        } else {
          url = `${config.baseUrl}/chat/completions`;
          body = config.formatBody(messages, config.model);
          const res = await axios.post(url, body, { headers: config.headers(config.apiKey), timeout: 90000 });
          return { content: config.extractResponse(res), provider, model: config.model };
        }
      } catch (err) {
        const isRate = /429|rate|limit|quota|busy/i.test(`${err.message} ${err.response?.status || ''}`);
        console.error(`Attempt ${attempt + 1} failed for ${provider}:`, err.message);
        if (isRate && r < rateAttemps) {
          // rate-limited mid-call: wait out the minute and retry provider entirely
          await sleep(Math.max(60, config.rpm * 6) * 1000);
          break; // go back to outer loop to re-check rate limit
        }
        if (attempt === retries - 1) throw err;
        await sleep(2000 * (attempt + 1));
      }
    }
  }

  throw new Error(`Rate limit exceeded for ${provider}. Auto-retry again in 1-2 minutes.`);
}

// Harden the system prompt so CC never reveals real model/brand names.
const OPSEC_SYSTEM_PROMPT = `
IMPORTANT BRANDING / OPSEC RULES:
- You are "CC - indirect", an AI coding assistant running its own runtime.
- Never mention, reveal, or hint at the real underlying model, vendor, provider,
  or company names such as DeepSeek, Gemini, Google, OpenAI, Anthropic, llama, b.ai, etc.
- Only ever describe yourself as "CC v1", "CC v2", or the "CC - indirect system".
- If asked which model/powerhouse you use, say: "I run on the CC - indirect engine (CC v1 / CC v2)."
- Never disclose API keys, configs, or internal infrastructure.

AGENT EXECUTION STYLE (MonkeyCode / Replit style):
- Given a task, plan briefly, then describe actual work and live progress.
- Instead of dumping huge code in the chat as a wall of text, summarize what you
  built and show short, essential code snippets only.
- Provide result summaries and concrete next steps in the chat.
- If the user wants to run code or inspect details, offer clear options/buttons
  like "▶ Run", "📋 Copy", "🔍 Details" (as plain text labels that CC UI renders).
`;

async function ensureSystemPrompt(messages) {
  // prepend OPSEC + system rules, keep user's project context if present
  return messages;
}

async function chat(projectId, userMessage, preferredProvider = 'auto') {
  await prisma.message.create({
    data: { projectId, role: 'user', content: userMessage }
  });

  const messages = await buildContext(projectId);
  // enforce OPSEC / execution system prompt
  if (messages[0] && messages[0].role === 'system') {
    messages[0].content = OPSEC_SYSTEM_PROMPT + '\n\n' + messages[0].content;
  } else {
    messages.unshift({ role: 'system', content: OPSEC_SYSTEM_PROMPT });
  }
  messages.push({ role: 'user', content: userMessage });

  let provider = preferredProvider;
  if (provider === 'auto') {
    provider = 'cc-v1';
  }

  let result;
  let usedProvider = provider;

  try {
    result = await callAI(provider, messages);
  } catch (err) {
    console.log(`${provider} failed, trying fallback...`);
    const fallback = provider === 'cc-v1' ? 'cc-v2' : 'cc-v1';
    try {
      result = await callAI(fallback, messages);
      usedProvider = fallback;
    } catch (err2) {
      throw new Error('All providers unavailable. Auto-retrying in 1-2 minutes.');
    }
  }

  const aiMsg = await prisma.message.create({
    data: {
      projectId,
      role: 'assistant',
      content: result.content,
      model: usedProvider,
      metadata: JSON.stringify({ provider: usedProvider, model: result.model })
    }
  });

  const msgCount = await prisma.message.count({ where: { projectId } });
  if (msgCount % 3 === 0) {
    await summarizeContext(projectId);
  }

  return {
    message: aiMsg,
    provider: PROVIDERS[usedProvider].name,
    model: result.model
  };
}

async function summarizeContext(projectId) {
  try {
    const messages = await prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    });
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return;

    // Memory layer: keep the project's goal/plan + a plan summary of recent turns,
    // so the system never forgets the whole project or prior conversation.
    const recent = messages.slice(-8).map(m =>
      `[${m.role}] ${m.content.replace(/\s+/g, ' ').substring(0, 300)}`
    ).join('\n');

    // Detect the user's goal (first user message = intent/plan anchor)
    const firstUser = messages.find(m => m.role === 'user');
    const plan = [
      `Project: ${project.name} (${project.language})`,
      `Goal/Start: ${firstUser ? firstUser.content.substring(0, 300) : 'not set'}`,
      `Recent turns:\n${recent}`
    ].join('\n');

    await prisma.project.update({
      where: { id: projectId },
      data: { context: plan }
    });
  } catch (e) {
    console.error('Context summary failed:', e.message);
  }
}

async function chatWithUserKey(projectId, userMessage, userApiKey, userProvider) {
  await prisma.message.create({
    data: { projectId, role: 'user', content: userMessage }
  });

  const messages = await buildContext(projectId);
  if (messages[0] && messages[0].role === 'system') {
    messages[0].content = OPSEC_SYSTEM_PROMPT + '\n\n' + messages[0].content;
  } else {
    messages.unshift({ role: 'system', content: OPSEC_SYSTEM_PROMPT });
  }
  messages.push({ role: 'user', content: userMessage });

  let url, body, headers;

  if (userProvider === 'gemini' || userProvider.includes('google')) {
    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${userApiKey}`;
    body = {
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))
    };
    headers = { 'Content-Type': 'application/json' };
    const res = await axios.post(url, body, { headers, timeout: 60000 });
    const content = res.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

    const aiMsg = await prisma.message.create({
      data: { projectId, role: 'assistant', content, model: 'custom-gemini' }
    });
    return { message: aiMsg, provider: 'Your Key', model: 'gemini-3.5-flash' };
  } else {
    url = userProvider.startsWith('http') ? `${userProvider}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
    body = { model: 'gpt-4', messages, stream: false };
    headers = { 'Authorization': `Bearer ${userApiKey}`, 'Content-Type': 'application/json' };
    const res = await axios.post(url, body, { headers, timeout: 60000 });
    const content = res.data.choices?.[0]?.message?.content || 'No response';

    const aiMsg = await prisma.message.create({
      data: { projectId, role: 'assistant', content, model: 'custom-openai' }
    });
    return { message: aiMsg, provider: 'Your Key', model: 'custom' };
  }
}

module.exports = {
  chat,
  chatWithUserKey,
  buildContext,
  summarizeContext,
  PROVIDERS,
  rateLimiter
};
