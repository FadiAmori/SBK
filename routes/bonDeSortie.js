const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const BonDeSortie = require('../models/BonDeSortie');
const Produit = require('../models/Produit');

// Generate sequential numeroBonSortie
const generateNumeroBonSortie = async () => {
  try {
    const latestBon = await BonDeSortie.findOne().sort({ numeroBonSortie: -1 }).exec();
    if (!latestBon || !latestBon.numeroBonSortie) {
      return 'BS00001';
    }
    const lastNumber = parseInt(latestBon.numeroBonSortie.slice(2), 10);
    return `BS${String(lastNumber + 1).padStart(5, '0')}`;
  } catch (err) {
    throw new Error('Failed to generate numeroBonSortie');
  }
};

// Create a bon de sortie
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/bons-de-sortie payload:', req.body);
    const { numeroBonSortie, produits, ...bonData } = req.body;

    // Validate produits
    if (!produits || !Array.isArray(produits) || produits.length === 0) {
      return res.status(400).json({ error: 'Produits is missing, not an array, or empty' });
    }
    for (const item of produits) {
      if (!item.produit || !mongoose.Types.ObjectId.isValid(item.produit)) {
        return res.status(400).json({ error: `Invalid produit ID: ${item.produit}` });
      }
      if (!item.quantite || item.quantite <= 0) {
        return res.status(400).json({ error: `Invalid quantity for produit: ${item.produit}` });
      }
      const produit = await Produit.findById(item.produit);
      if (!produit) {
        return res.status(400).json({ error: `Produit not found: ${item.produit}` });
      }
      if (produit.stockActuel < item.quantite) {
        return res.status(400).json({
          error: `Insufficient stock for produit ${produit.nomProduit}: ${produit.stockActuel} available, ${item.quantite} required`,
        });
      }
    }

    // Update stock for each product
    for (const item of produits) {
      const produit = await Produit.findById(item.produit);
      produit.stockAvantMouvement = produit.stockActuel;
      produit.stockActuel -= item.quantite;
      produit.stockApresMouvement = produit.stockActuel;
      await produit.save();
    }

    // Calculate stock totals
    const stockAvantSortie = produits.reduce((sum, item) => sum + item.quantite, 0);
    const stockApresSortie = 0; // After exit, quantities are removed

    // Generate numeroBonSortie
    const newNumero = await generateNumeroBonSortie();
    const bonDeSortie = new BonDeSortie({
      ...bonData,
      produits,
      numeroBonSortie: newNumero,
      stockAvantSortie,
      stockApresSortie,
    });
    await bonDeSortie.save();
    const populatedBon = await BonDeSortie.findById(bonDeSortie._id).populate('produits.produit');
    console.log('Saved bon de sortie:', populatedBon);
    res.status(201).json(populatedBon);
  } catch (err) {
    console.error('Error creating bon de sortie:', err);
    if (err.code === 11000 && err.keyPattern.numeroBonSortie) {
      try {
        const newNumero = await generateNumeroBonSortie();
        const bonDeSortie = new BonDeSortie({
          ...req.body,
          numeroBonSortie: newNumero,
          stockAvantSortie: req.body.stockAvantSortie || 0,
          stockApresSortie: req.body.stockApresSortie || 0,
        });
        await bonDeSortie.save();
        const populatedBon = await BonDeSortie.findById(bonDeSortie._id).populate('produits.produit');
        res.status(201).json(populatedBon);
      } catch (retryErr) {
        res.status(400).json({ error: 'Failed to generate unique numeroBonSortie' });
      }
    } else {
      res.status(400).json({ error: err.message });
    }
  }
});

// Get all bons de sortie
router.get('/', async (req, res) => {
  try {
    const bonsDeSortie = await BonDeSortie.find().populate('produits.produit');
    res.json(bonsDeSortie);
  } catch (err) {
    console.error('Error fetching bons de sortie:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a bon de sortie by ID
router.get('/:id', async (req, res) => {
  try {
    const bonDeSortie = await BonDeSortie.findById(req.params.id).populate('produits.produit');
    if (!bonDeSortie) return res.status(404).json({ error: 'Bon de sortie not found' });
    console.log('Fetched bon de sortie by ID:', bonDeSortie);
    res.json(bonDeSortie);
  } catch (err) {
    console.error('Error fetching bon de sortie by ID:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update a bon de sortie
router.put('/:id', async (req, res) => {
  try {
    console.log('PUT /api/bons-de-sortie/:id payload:', req.body);
    const { numeroBonSortie, produits, ...updateData } = req.body;

    // Validate produits
    if (produits && (!Array.isArray(produits) || produits.length === 0)) {
      return res.status(400).json({ error: 'Produits is not an array or empty' });
    }
    if (produits) {
      for (const item of produits) {
        if (!item.produit || !mongoose.Types.ObjectId.isValid(item.produit)) {
          return res.status(400).json({ error: `Invalid produit ID: ${item.produit}` });
        }
        if (!item.quantite || item.quantite <= 0) {
          return res.status(400).json({ error: `Invalid quantity for produit: ${item.produit}` });
        }
        const produit = await Produit.findById(item.produit);
        if (!produit) {
          return res.status(400).json({ error: `Produit not found: ${item.produit}` });
        }
        if (produit.stockActuel < item.quantite) {
          return res.status(400).json({
            error: `Insufficient stock for produit ${produit.nomProduit}: ${produit.stockActuel} available, ${item.quantite} required`,
          });
        }
      }
    }

    // If updating produits, handle stock adjustments
    if (produits) {
      const existingBon = await BonDeSortie.findById(req.params.id).populate('produits.produit');
      if (!existingBon) {
        return res.status(404).json({ error: 'Bon de sortie not found' });
      }

      // Revert previous stock changes
      for (const item of existingBon.produits) {
        const produit = await Produit.findById(item.produit._id);
        if (produit) {
          produit.stockActuel += item.quantite;
          produit.stockAvantMouvement = produit.stockActuel;
          produit.stockApresMouvement = produit.stockActuel;
          await produit.save();
        }
      }

      // Apply new stock changes
      for (const item of produits) {
        const produit = await Produit.findById(item.produit);
        produit.stockAvantMouvement = produit.stockActuel;
        produit.stockActuel -= item.quantite;
        produit.stockApresMouvement = produit.stockActuel;
        await produit.save();
      }

      // Recalculate stock totals
      const stockAvantSortie = produits.reduce((sum, item) => sum + item.quantite, 0);
      const stockApresSortie = 0;
      updateData.stockAvantSortie = stockAvantSortie;
      updateData.stockApresSortie = stockApresSortie;
    }

    const bonDeSortie = await BonDeSortie.findByIdAndUpdate(req.params.id, { ...updateData, produits }, { new: true })
      .populate('produits.produit');
    if (!bonDeSortie) return res.status(404).json({ error: 'Bon de sortie not found' });
    res.json(bonDeSortie);
  } catch (err) {
    console.error('Error updating bon de sortie:', err);
    res.status(400).json({ error: err.message });
  }
});

// Delete a bon de sortie
router.delete('/:id', async (req, res) => {
  try {
    const bonDeSortie = await BonDeSortie.findById(req.params.id).populate('produits.produit');
    if (!bonDeSortie) return res.status(404).json({ error: 'Bon de sortie not found' });

    // Revert stock changes
    for (const item of bonDeSortie.produits) {
      const produit = await Produit.findById(item.produit._id);
      if (produit) {
        produit.stockActuel += item.quantite;
        produit.stockAvantMouvement = produit.stockActuel;
        produit.stockApresMouvement = produit.stockActuel;
        await produit.save();
      }
    }

    await BonDeSortie.findByIdAndDelete(req.params.id);
    res.json({ message: 'Bon de sortie deleted' });
  } catch (err) {
    console.error('Error deleting bon de sortie:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;