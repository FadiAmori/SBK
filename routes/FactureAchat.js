const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const FactureAchat = require('../models/FactureAchat');
const Fournisseur = require('../models/Fournisseur');
const Produit = require('../models/Produit');

// Generate sequential numeroFacture
const generateNumeroFacture = async () => {
  try {
    const latestFacture = await FactureAchat.findOne().sort({ numeroFacture: -1 }).exec();
    if (!latestFacture || !latestFacture.numeroFacture) {
      return 'FA00001';
    }
    const lastNumber = parseInt(latestFacture.numeroFacture.slice(2), 10);
    return `FA${String(lastNumber + 1).padStart(5, '0')}`;
  } catch (err) {
    throw new Error('Failed to generate numeroFacture');
  }
};

// Create a facture d'achat
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/factureAchats payload:', req.body);
    const { numeroFacture, fournisseur, liste, ...factureData } = req.body;

    // Validate fournisseur
    if (!fournisseur || !mongoose.Types.ObjectId.isValid(fournisseur)) {
      return res.status(400).json({ error: 'Invalid or missing fournisseur ID' });
    }
    const fournisseurExists = await Fournisseur.findById(fournisseur);
    if (!fournisseurExists) {
      return res.status(400).json({ error: 'Fournisseur not found' });
    }

    // Validate liste
    if (!liste || !Array.isArray(liste) || liste.length === 0) {
      return res.status(400).json({ error: 'Liste is missing, not an array, or empty' });
    }
    for (const item of liste) {
      if (!item.produit || !mongoose.Types.ObjectId.isValid(item.produit)) {
        return res.status(400).json({ error: `Invalid produit ID: ${item.produit}` });
      }
      const produit = await Produit.findById(item.produit);
      if (!produit) {
        return res.status(400).json({ error: `Produit not found: ${item.produit}` });
      }
      if (!item.quantite || item.quantite < 1) {
        return res.status(400).json({ error: `Invalid quantite for produit: ${item.produit}` });
      }
    }

    // Update stock for each product (increment for purchases)
    for (const item of liste) {
      const produit = await Produit.findById(item.produit);
      produit.stockAvantMouvement = produit.stockActuel;
      produit.stockActuel += item.quantite;
      produit.stockApresMouvement = produit.stockActuel;
      await produit.save();
    }

    // Generate numeroFacture
    const newNumero = await generateNumeroFacture();
    const facture = new FactureAchat({ ...factureData, fournisseur, liste, numeroFacture: newNumero });
    await facture.save();
    const populatedFacture = await FactureAchat.findById(facture._id)
      .populate('fournisseur')
      .populate('liste.produit');
    console.log('Saved facture d\'achat:', populatedFacture);
    res.status(201).json(populatedFacture);
  } catch (err) {
    console.error('Error creating facture d\'achat:', err);
    if (err.code === 11000 && err.keyPattern.numeroFacture) {
      // Handle duplicate numeroFacture by retrying
      try {
        const newNumero = await generateNumeroFacture();
        const facture = new FactureAchat({ ...req.body, numeroFacture: newNumero });
        await facture.save();
        const populatedFacture = await FactureAchat.findById(facture._id)
          .populate('fournisseur')
          .populate('liste.produit');
        res.status(201).json(populatedFacture);
      } catch (retryErr) {
        res.status(400).json({ error: 'Failed to generate unique numeroFacture' });
      }
    } else {
      res.status(400).json({ error: err.message });
    }
  }
});

// Get all factures d'achat
router.get('/', async (req, res) => {
  try {
    const factures = await FactureAchat.find()
      .populate('fournisseur')
      .populate('liste.produit');
    res.json(factures);
  } catch (err) {
    console.error('Error fetching factures d\'achat:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a facture d'achat by ID
router.get('/:id', async (req, res) => {
  try {
    const facture = await FactureAchat.findById(req.params.id)
      .populate('fournisseur')
      .populate('liste.produit');
    if (!facture) return res.status(404).json({ error: 'Facture d\'achat not found' });
    console.log('Fetched facture d\'achat by ID:', facture);
    res.json(facture);
  } catch (err) {
    console.error('Error fetching facture d\'achat by ID:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update a facture d'achat
router.put('/:id', async (req, res) => {
  try {
    console.log('PUT /api/factureAchats/:id payload:', req.body);
    const { numeroFacture, fournisseur, liste, ...updateData } = req.body;

    // Validate fournisseur
    if (fournisseur && !mongoose.Types.ObjectId.isValid(fournisseur)) {
      return res.status(400).json({ error: 'Invalid fournisseur ID' });
    }
    if (fournisseur) {
      const fournisseurExists = await Fournisseur.findById(fournisseur);
      if (!fournisseurExists) {
        return res.status(400).json({ error: 'Fournisseur not found' });
      }
    }

    // Validate liste
    if (liste && (!Array.isArray(liste) || liste.length === 0)) {
      return res.status(400).json({ error: 'Liste is not an array or empty' });
    }
    if (liste) {
      for (const item of liste) {
        if (!item.produit || !mongoose.Types.ObjectId.isValid(item.produit)) {
          return res.status(400).json({ error: `Invalid produit ID: ${item.produit}` });
        }
        const produit = await Produit.findById(item.produit);
        if (!produit) {
          return res.status(400).json({ error: `Produit not found: ${item.produit}` });
        }
        if (!item.quantite || item.quantite < 1) {
          return res.status(400).json({ error: `Invalid quantite for produit: ${item.produit}` });
        }
      }
    }

    // If updating liste, handle stock adjustments
    if (liste) {
      const existingFacture = await FactureAchat.findById(req.params.id);
      if (!existingFacture) {
        return res.status(404).json({ error: 'Facture d\'achat not found' });
      }

      // Revert previous stock changes (decrement since these were purchases)
      for (const item of existingFacture.liste) {
        const produit = await Produit.findById(item.produit);
        if (produit) {
          produit.stockActuel -= item.quantite;
          produit.stockAvantMouvement = produit.stockActuel;
          produit.stockApresMouvement = produit.stockActuel;
          await produit.save();
        }
      }

      // Apply new stock changes (increment for new purchases)
      for (const item of liste) {
        const produit = await Produit.findById(item.produit);
        produit.stockAvantMouvement = produit.stockActuel;
        produit.stockActuel += item.quantite;
        produit.stockApresMouvement = produit.stockActuel;
        await produit.save();
      }
    }

    const facture = await FactureAchat.findByIdAndUpdate(req.params.id, { ...updateData, fournisseur, liste }, { new: true })
      .populate('fournisseur')
      .populate('liste.produit');
    if (!facture) return res.status(404).json({ error: 'Facture d\'achat not found' });
    res.json(facture);
  } catch (err) {
    console.error('Error updating facture d\'achat:', err);
    res.status(400).json({ error: err.message });
  }
});

// Delete a facture d'achat
router.delete('/:id', async (req, res) => {
  try {
    const facture = await FactureAchat.findById(req.params.id);
    if (!facture) return res.status(404).json({ error: 'Facture d\'achat not found' });

    // Revert stock changes (decrement since these were purchases)
    for (const item of facture.liste) {
      const produit = await Produit.findById(item.produit);
      if (produit) {
        produit.stockActuel -= item.quantite;
        produit.stockAvantMouvement = produit.stockActuel;
        produit.stockApresMouvement = produit.stockActuel;
        await produit.save();
      }
    }

    await FactureAchat.findByIdAndDelete(req.params.id);
    res.json({ message: 'Facture d\'achat deleted' });
  } catch (err) {
    console.error('Error deleting facture d\'achat:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;