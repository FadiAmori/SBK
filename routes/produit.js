const express = require('express');
const router = express.Router();
const Produit = require('../models/Produit');

// Generate sequential referenceProduit
const generateReferenceProduit = async (retryCount = 0, maxRetries = 5) => {
  try {
    const latestProduit = await Produit.findOne({ referenceProduit: /^P\d{5}$/ })
      .sort({ referenceProduit: -1 })
      .select('referenceProduit')
      .lean()
      .exec();
    let newNumber = 1; // Start at P00001
    if (latestProduit && latestProduit.referenceProduit) {
      const match = latestProduit.referenceProduit.match(/^P(\d{5})$/);
      newNumber = parseInt(match[1], 10) + 1;
    }
    return `P${String(newNumber).padStart(5, "0")}`;
  } catch (err) {
    if (retryCount < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, retryCount)));
      return generateReferenceProduit(retryCount + 1, maxRetries);
    }
    throw new Error(`Impossible de générer une référence produit unique: ${err.message}`);
  }
};

router.post('/', async (req, res) => {
  console.log("Received data:", req.body); // Debug log
  try {
    const { referenceProduit, prixAchat, prixUnitaireHT, margeDegagnante, nomProduit, ...produitData } = req.body;

    if (!nomProduit) {
      return res.status(400).json({ error: 'Le nom du produit est requis.' });
    }
    if (!prixAchat || prixAchat <= 0) {
      return res.status(400).json({ error: 'Le prix d\'achat doit être supérieur à 0.' });
    }
    if (!prixUnitaireHT || prixUnitaireHT <= 0) {
      return res.status(400).json({ error: 'Le prix unitaire HT doit être supérieur à 0.' });
    }
    if (margeDegagnante === undefined || margeDegagnante < 0) {
      return res.status(400).json({ error: 'La marge dégagnante ne peut pas être négative.' });
    }
    if (prixUnitaireHT < prixAchat) {
      return res.status(400).json({ error: 'Le prix unitaire HT doit être supérieur ou égal au prix d\'achat.' });
    }

    const newReference = await generateReferenceProduit();
    const produit = new Produit({
      ...produitData,
      nomProduit,
      referenceProduit: newReference,
      prixAchat,
      prixUnitaireHT,
      margeDegagnante,
    });
    await produit.save();
    res.status(201).json(produit);
  } catch (err) {
    if (err.code === 11000 && err.keyPattern.referenceProduit) {
      try {
        const newReference = await generateReferenceProduit();
        const produit = new Produit({
          ...req.body,
          referenceProduit: newReference,
        });
        await produit.save();
        res.status(201).json(produit);
      } catch (retryErr) {
        res.status(400).json({ error: 'Impossible de générer une référence produit unique.' });
      }
    } else {
      res.status(400).json({ error: err.message });
    }
  }
});

router.put('/:id', async (req, res) => {
  console.log("Received data for update:", req.body); // Debug log
  try {
    const { referenceProduit, prixAchat, prixUnitaireHT, margeDegagnante, nomProduit, ...updateData } = req.body;

    if (!nomProduit) {
      return res.status(400).json({ error: 'Le nom du produit est requis.' });
    }
    if (!prixAchat || prixAchat <= 0) {
      return res.status(400).json({ error: 'Le prix d\'achat doit être supérieur à 0.' });
    }
    if (!prixUnitaireHT || prixUnitaireHT <= 0) {
      return res.status(400).json({ error: 'Le prix unitaire HT doit être supérieur à 0.' });
    }
    if (margeDegagnante === undefined || margeDegagnante < 0) {
      return res.status(400).json({ error: 'La marge dégagnante ne peut pas être négative.' });
    }
    if (prixUnitaireHT < prixAchat) {
      return res.status(400).json({ error: 'Le prix unitaire HT doit être supérieur ou égal au prix d\'achat.' });
    }

    const produit = await Produit.findByIdAndUpdate(
      req.params.id,
      { ...updateData, nomProduit, prixAchat, prixUnitaireHT, margeDegagnante },
      { new: true, runValidators: true }
    );
    if (!produit) return res.status(404).json({ error: 'Produit non trouvé.' });
    res.json(produit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all produits
router.get('/', async (req, res) => {
  try {
    const produits = await Produit.find().populate('fournisseurPrincipal');
    res.json(produits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a produit by ID
router.get('/:id', async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id).populate('fournisseurPrincipal');
    if (!produit) return res.status(404).json({ error: 'Produit non trouvé.' });
    res.json(produit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a produit
router.delete('/:id', async (req, res) => {
  try {
    const produit = await Produit.findByIdAndDelete(req.params.id);
    if (!produit) return res.status(404).json({ error: 'Produit non trouvé.' });
    res.json({ message: 'Produit supprimé.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;