const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create project
router.post('/', async (req, res) => {
  try {
    const { userId, name, description, language } = req.body;

    if (!userId || !name) {
      return res.status(400).json({ error: 'userId and name required' });
    }

    const project = await prisma.project.create({
      data: { userId, name, description, language: language || 'javascript' }
    });

    res.json({ success: true, project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's projects
router.get('/user/:userId', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.params.userId },
      include: {
        _count: { select: { messages: true, files: true } }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single project with messages
router.get('/:id', async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        files: true
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save file
router.post('/:id/files', async (req, res) => {
  try {
    const { name, path, content, language } = req.body;

    const file = await prisma.file.upsert({
      where: {
        projectId_name: {
          projectId: req.params.id,
          name
        }
      },
      create: { projectId: req.params.id, name, path: path || name, content, language },
      update: { content, language }
    });

    res.json({ success: true, file });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
