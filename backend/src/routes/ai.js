const express = require('express');
const router = express.Router();
const { chat, chatWithUserKey } = require('../services/ai');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { projectId, message, provider, userApiKey, userProvider } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }

    let resolvedProjectId = projectId;

    // If no projectId or invalid project, create/use a default project
    if (!resolvedProjectId) {
      const { PrismaClient } = require('@prisma/client');
      const p = new PrismaClient();
      let defaultProject = await p.project.findFirst({ where: { name: 'Default Project' } });
      if (!defaultProject) {
        // Find or create a default guest user
        let guestUser = await p.user.findFirst({ where: { email: 'guest@cc-indirect.local' } });
        if (!guestUser) {
          guestUser = await p.user.create({
            data: { email: 'guest@cc-indirect.local', name: 'Guest' }
          });
        }
        defaultProject = await p.project.create({
          data: { userId: guestUser.id, name: 'Default Project', language: 'javascript' }
        });
      }
      resolvedProjectId = defaultProject.id;
      await p.$disconnect();
    }

    let result;

    // If user provided their own API key, use it
    if (userApiKey) {
      result = await chatWithUserKey(resolvedProjectId, message, userApiKey, userProvider || 'openai');
    } else {
      // Use admin keys with rate limiting
      result = await chat(resolvedProjectId, message, provider || 'auto');
    }

    res.json({
      success: true,
      message: result.message,
      provider: result.provider,
      model: result.model
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ 
      error: err.message,
      retryAfter: err.retryAfter || 60
    });
  }
});

// Stream chat (for real-time feel)
router.post('/chat/stream', async (req, res) => {
  const { projectId, message } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const result = await chat(projectId, message);
    const content = result.message.content;

    const chunks = content.match(/.{1,20}/g) || [content];
    for (const chunk of chunks) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      await new Promise(r => setTimeout(r, 30));
    }

    res.write(`data: ${JSON.stringify({ done: true, message: result.message })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// Get providers status
router.get('/providers', async (req, res) => {
  res.json({
    providers: [
      { id: 'cc-v1', name: 'CC v1', status: 'active', rpm: 10 },
      { id: 'cc-v2', name: 'CC v2', status: 'active', rpm: 14 },
      { id: 'custom', name: 'Your Key', status: 'available', rpm: 'unlimited' }
    ]
  });
});

module.exports = router;
