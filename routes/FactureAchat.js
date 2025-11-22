const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const FactureAchat = require('../models/FactureAchat');
const Fournisseur = require('../models/Fournisseur');
const Produit = require('../models/Produit');
const resumeHelpers = require('../lib/resumeHelpers');

// Generate sequential numeroFacture
const generateNumeroFacture = async () => {
  try {
    // Attempt to generate a unique sequential invoice number.
    // We read the numerically highest existing suffix, then probe forward until we find an unused number.
    const latestFacture = await FactureAchat.findOne().sort({ numeroFacture: -1 }).exec();
    let start = 0;
    if (latestFacture && latestFacture.numeroFacture) {
      const parsed = parseInt(String(latestFacture.numeroFacture).slice(2), 10);
      if (!Number.isNaN(parsed)) start = parsed;
    }

    // Probe sequentially for an unused number (should be fast because conflicts are rare)
    for (let i = start + 1; i < start + 1000000; i++) {
      const candidate = `FA${String(i).padStart(5, '0')}`;
      // check existence
      // Use lean() for a lightweight query
      // eslint-disable-next-line no-await-in-loop
      const exists = await FactureAchat.findOne({ numeroFacture: candidate }).select('_id').lean();
      if (!exists) return candidate;
    }
    throw new Error('Failed to generate numeroFacture after probing');
  } catch (err) {
    console.error('generateNumeroFacture error:', err);
    throw new Error('Failed to generate numeroFacture');
  }
};

// Create a facture d'achat
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/factureAchats payload:', req.body);
    const { numeroFacture, fournisseur, liste, montantDonne, remise, ...factureData } = req.body;

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

    // Calculate totals using produit.prixAchat (company purchase price)
    let totalHT = 0;
    let totalTVA = 0;
    const listeWithSnapshot = [];
    for (const item of liste) {
      const produit = await Produit.findById(item.produit);
      const qty = Number(item.quantite) || 0;
      const unitAchat = Number(produit.prixAchat || 0);
      const unitTVAPercent = Number(produit.tvaApplicable || 0);
      totalHT += unitAchat * qty;
      totalTVA += (unitAchat * (unitTVAPercent / 100)) * qty;
      listeWithSnapshot.push({ produit: item.produit, quantite: qty, prixAchatAtOrder: unitAchat });
      // Update stock for each product (increment for purchases)
      produit.stockAvantMouvement = produit.stockActuel;
      produit.stockActuel += qty;
      produit.stockApresMouvement = produit.stockActuel;
      await produit.save();
    }

  // For purchase invoices we store totals as the sum of purchase prices.
  // We intentionally do not apply TVA or per-line TTC here so the UI/PDF shows only purchase prices.
  const montantHT = totalHT;
  const tva = 0;
  const montantTTC = totalHT; // Total TTC = sum of prixAchat

    // Generate numeroFacture
    const newNumero = await generateNumeroFacture();
    const fournisseurDoc = await Fournisseur.findById(fournisseur);
    const fournisseurMatricule = fournisseurDoc?.matriculeFiscale || undefined;
    const facture = new FactureAchat({
      ...factureData,
      fournisseur,
      liste: listeWithSnapshot,
      numeroFacture: newNumero,
      montantHT,
      tva,
      montantTTC,
      fournisseurMatriculeFiscale: fournisseurMatricule,
    });
    await facture.save();
    const populatedFacture = await FactureAchat.findById(facture._id)
      .populate('fournisseur')
      .populate('liste.produit');
    console.log('Saved facture d\'achat:', populatedFacture);
    res.status(201).json(populatedFacture);
    // Update monthly résumé for the facture d'achat month
    try {
      const dateToUse = populatedFacture.dateFacturation || populatedFacture.createdAt || new Date();
      await resumeHelpers.upsertMonthResume(dateToUse);
    } catch (resumeErr) {
      console.error('Failed to upsert month résumé after facture d\'achat create:', resumeErr);
    }
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
    // Update monthly résumé for the facture d'achat month after update
    try {
      const dateToUse = facture.dateFacturation || facture.updatedAt || new Date();
      await resumeHelpers.upsertMonthResume(dateToUse);
    } catch (resumeErr) {
      console.error('Failed to upsert month résumé after facture d\'achat update:', resumeErr);
    }
  } catch (err) {
    console.error('Error fetching facture d\'achat by ID:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update a facture d'achat
router.put('/:id', async (req, res) => {
  try {
    console.log('PUT /api/factureAchats/:id payload:', req.body);
    const { numeroFacture, fournisseur, liste, remise, ...updateData } = req.body;

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

    // If updating liste, handle stock adjustments and recalculate totals using prixAchat
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

      // Apply new stock changes (increment for new purchases) and compute totals
      let totalHT = 0;
      let totalTVA = 0;
      const listeWithSnapshot = [];
      for (const item of liste) {
        const produit = await Produit.findById(item.produit);
        const qty = Number(item.quantite) || 0;
        const unitAchat = Number(produit.prixAchat || 0);
        const unitTVAPercent = Number(produit.tvaApplicable || 0);
        produit.stockAvantMouvement = produit.stockActuel;
        produit.stockActuel += qty;
        produit.stockApresMouvement = produit.stockActuel;
        await produit.save();
        totalHT += unitAchat * qty;
        totalTVA += (unitAchat * (unitTVAPercent / 100)) * qty;
        listeWithSnapshot.push({ produit: item.produit, quantite: qty, prixAchatAtOrder: unitAchat });
      }
  // For purchase invoices keep totals equal to the sum of purchase prices (prixAchat)
  const montantHT = totalHT;
  const tva = 0;
  const montantTTC = totalHT;
  updateData.montantHT = montantHT;
  updateData.tva = tva;
  updateData.montantTTC = montantTTC;
      updateData.liste = listeWithSnapshot;
      const fournisseurDoc = fournisseur ? await Fournisseur.findById(fournisseur) : null;
      if (fournisseurDoc) updateData.fournisseurMatriculeFiscale = fournisseurDoc.matriculeFiscale;
    }

    const facture = await FactureAchat.findByIdAndUpdate(req.params.id, { ...updateData, fournisseur }, { new: true })
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
    // Update monthly résumé for the facture d'achat month after delete
    try {
      await resumeHelpers.upsertMonthResume(facture.dateFacturation || new Date());
    } catch (resumeErr) {
      console.error('Failed to upsert month résumé after facture d\'achat delete:', resumeErr);
    }
  } catch (err) {
    console.error('Error deleting facture d\'achat:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;