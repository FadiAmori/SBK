const express = require('express');
const router = express.Router();
const Fournisseur = require('../models/Fournisseur');

// Generate sequential numeroFournisseur
const generateNumeroFournisseur = async () => {
  try {
    const latestFournisseur = await Fournisseur.findOne().sort({ numeroFournisseur: -1 }).exec();
    if (!latestFournisseur || !latestFournisseur.numeroFournisseur) {
      return 'FOU00001';
    }
    const lastNumber = parseInt(latestFournisseur.numeroFournisseur.slice(3), 10);
    return `FOU${String(lastNumber + 1).padStart(5, '0')}`;
  } catch (err) {
    throw new Error('Failed to generate numeroFournisseur');
  }
};

// Create a fournisseur
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/fournisseurs payload:', req.body);
    const { numeroFournisseur, ...fournisseurData } = req.body;

    // Validate required fields
    if (!fournisseurData.nomRaisonSociale || !fournisseurData.adresse) {
      return res.status(400).json({ error: 'nomRaisonSociale and adresse are required' });
    }

    // Generate numeroFournisseur
    const newNumero = await generateNumeroFournisseur();
    const fournisseur = new Fournisseur({
      ...fournisseurData,
      numeroFournisseur: newNumero,
      dateInscription: fournisseurData.dateInscription || new Date(),
    });
    await fournisseur.save();
    console.log('Saved fournisseur:', fournisseur);
    res.status(201).json(fournisseur);
  } catch (err) {
    console.error('Error creating fournisseur:', err);
    if (err.code === 11000 && err.keyPattern.numeroFournisseur) {
      // Handle duplicate numeroFournisseur by retrying
      try {
        const newNumero = await generateNumeroFournisseur();
        const fournisseur = new Fournisseur({
          ...req.body,
          numeroFournisseur: newNumero,
          dateInscription: req.body.dateInscription || new Date(),
        });
        await fournisseur.save();
        res.status(201).json(fournisseur);
      } catch (retryErr) {
        res.status(400).json({ error: 'Failed to generate unique numeroFournisseur' });
      }
    } else {
      res.status(400).json({ error: err.message });
    }
  }
});

// Get all fournisseurs
router.get('/', async (req, res) => {
  try {
    const fournisseurs = await Fournisseur.find();
    res.json(fournisseurs);
  } catch (err) {
    console.error('Error fetching fournisseurs:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a fournisseur by ID
router.get('/:id', async (req, res) => {
  try {
    const fournisseur = await Fournisseur.findById(req.params.id);
    if (!fournisseur) return res.status(404).json({ error: 'Fournisseur not found' });
    console.log('Fetched fournisseur by ID:', fournisseur);
    res.json(fournisseur);
  } catch (err) {
    console.error('Error fetching fournisseur by ID:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update a fournisseur
router.put('/:id', async (req, res) => {
  try {
    console.log('PUT /api/fournisseurs/:id payload:', req.body);
    const { numeroFournisseur, ...updateData } = req.body;

    // Validate required fields
    if (!updateData.nomRaisonSociale || !updateData.adresse) {
      return res.status(400).json({ error: 'nomRaisonSociale and adresse are required' });
    }

    const fournisseur = await Fournisseur.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!fournisseur) return res.status(404).json({ error: 'Fournisseur not found' });
    res.json(fournisseur);
  } catch (err) {
    console.error('Error updating fournisseur:', err);
    res.status(400).json({ error: err.message });
  }
});

// Delete a fournisseur
router.delete('/:id', async (req, res) => {
  try {
    const fournisseur = await Fournisseur.findByIdAndDelete(req.params.id);
    if (!fournisseur) return res.status(404).json({ error: 'Fournisseur not found' });
    res.json({ message: 'Fournisseur deleted' });
  } catch (err) {
    console.error('Error deleting fournisseur:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;