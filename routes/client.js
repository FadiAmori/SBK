const express = require('express');
const router = express.Router();
const Client = require('../models/Client.js');

// Generate sequential numeroClient (robust). Accepts an optional offset so retries
// produce different candidate numbers instead of repeating the same fallback.
const generateNumeroClient = async (offset = 0) => {
  try {
    const latestClient = await Client.findOne().sort({ numeroClient: -1 }).exec();
    if (!latestClient || !latestClient.numeroClient) {
      return `C${String(1 + offset).padStart(5, '0')}`;
    }
    const raw = String(latestClient.numeroClient || '');
    const numericPart = raw.slice(1).replace(/[^0-9]/g, '');
    let lastNumber = parseInt(numericPart, 10);
    if (Number.isNaN(lastNumber) || lastNumber < 0) lastNumber = 0;
    return `C${String(lastNumber + 1 + offset).padStart(5, '0')}`;
  } catch (err) {
    // If anything goes wrong, produce a sensible fallback with the offset applied.
    return `C${String(1 + offset).padStart(5, '0')}`;
  }
};

// Create a client
router.post('/', async (req, res) => {
  try {
    const { numeroClient, ...clientData } = req.body;
    console.log('POST /api/clients payload:', JSON.stringify(clientData));
    // Try multiple times to generate and save with a unique numeroClient.
    const maxAttempts = 6;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const newNumero = await generateNumeroClient(attempt);
      try {
        const client = new Client({ ...clientData, numeroClient: newNumero });
        await client.save();
        return res.status(201).json(client);
      } catch (saveErr) {
        console.error('Error saving client attempt', attempt, 'numeroClient=', newNumero, saveErr && saveErr.message);
        if (saveErr && saveErr.errors) console.error('Validation errors:', saveErr.errors);
        // If duplicate key for numeroClient, loop and try again.
        if (saveErr.code === 11000 && saveErr.keyPattern && saveErr.keyPattern.numeroClient) {
          // small delay could help under rare race conditions
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }
        // Other errors should be returned immediately
        return res.status(400).json({ error: saveErr.message, details: saveErr.errors || null });
      }
    }

    // If we exhausted attempts
    return res.status(400).json({ error: 'Failed to generate unique numeroClient' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all clients
router.get('/', async (req, res) => {
  try {
    const clients = await Client.find();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a client by ID
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a client
router.put('/:id', async (req, res) => {
  try {
    const { numeroClient, ...updateData } = req.body; // Ignore numeroClient in updates
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { ...updateData },
      { new: true }
    );
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a client
router.delete('/:id', async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;