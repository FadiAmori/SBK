const express = require('express');
const router = express.Router();
const Client = require('../models/Client.js');

// Generate sequential numeroClient
const generateNumeroClient = async () => {
  try {
    const latestClient = await Client.findOne().sort({ numeroClient: -1 }).exec();
    if (!latestClient || !latestClient.numeroClient) {
      return 'C00001';
    }
    const lastNumber = parseInt(latestClient.numeroClient.slice(1), 10);
    return `C${String(lastNumber + 1).padStart(5, '0')}`;
  } catch (err) {
    throw new Error('Failed to generate numeroClient');
  }
};

// Create a client
router.post('/', async (req, res) => {
  try {
    const { numeroClient, ...clientData } = req.body;
    // Ignore provided numeroClient and generate a new one
    const newNumero = await generateNumeroClient();
    const client = new Client({ ...clientData, numeroClient: newNumero });
    await client.save();
    res.status(201).json(client);
  } catch (err) {
    if (err.code === 11000 && err.keyPattern.numeroClient) {
      // Handle duplicate numeroClient by retrying
      try {
        const newNumero = await generateNumeroClient();
        const client = new Client({ ...req.body, numeroClient: newNumero });
        await client.save();
        res.status(201).json(client);
      } catch (retryErr) {
        res.status(400).json({ error: 'Failed to generate unique numeroClient' });
      }
    } else {
      res.status(400).json({ error: err.message });
    }
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