const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Facture = require('../models/Facture');
const Client = require('../models/Client.js');
const Produit = require('../models/Produit');
const resumeHelpers = require('../lib/resumeHelpers');

const generateNumeroFacture = async () => {
  try {
    const latestFacture = await Facture.findOne().sort({ numeroFacture: -1 }).exec();
    if (!latestFacture || !latestFacture.numeroFacture) {
      return 'F00001';
    }
    const lastNumber = parseInt(latestFacture.numeroFacture.slice(1), 10);
    return `F${String(lastNumber + 1).padStart(5, '0')}`;
  } catch (err) {
    throw new Error('Failed to generate numeroFacture');
  }
};

router.post('/', async (req, res) => {
  try {
    console.log('POST /api/factures payload:', req.body);
    const { numeroFacture, client, liste, typeFacture, montantDonne, remise, ...factureData } = req.body;

    if (!typeFacture || ![ 'Client', 'Bon de Livraison'].includes(typeFacture)) {
      return res.status(400).json({ error: 'Invalid or missing typeFacture' });
    }

    if (!client || !mongoose.Types.ObjectId.isValid(client)) {
      return res.status(400).json({ error: 'Invalid or missing client ID' });
    }
    const clientExists = await Client.findById(client);
    if (!clientExists) {
      return res.status(400).json({ error: 'Client not found' });
    }

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
      if (produit.stockActuel < item.quantite) {
        return res.status(400).json({ error: `Insufficient stock for produit: ${produit.nomProduit}. Current stock: ${produit.stockActuel}` });
      }
    }

    // Calculate totals (montant HT, TVA, montant TTC) using product prices and fixed remise (in DT)
    let totalHT = 0;
    let totalTVA = 0;
    let totalTTCBeforeRemise = 0;
    let totalPrixAchat = 0;
    const listeWithSnapshot = [];
    for (const item of liste) {
      const produit = await Produit.findById(item.produit);
      const qty = Number(item.quantite) || 0;
      const unitHT = Number(produit.prixUnitaireHT || 0);
      const unitTVAPercent = Number(produit.tvaApplicable || 0);
      const unitAchat = Number(produit.prixAchat || 0);
      totalHT += unitHT * qty;
      const unitTVA = (unitHT * (unitTVAPercent / 100));
      totalTVA += unitTVA * qty;
      totalTTCBeforeRemise += (unitHT + unitTVA) * qty;
      totalPrixAchat += unitAchat * qty;
      listeWithSnapshot.push({ produit: item.produit, quantite: qty, prixUnitaireHTAtSale: unitHT, prixAchatAtSale: unitAchat });
    }

    const remiseAmount = Number(remise || 0);
    // Compute montantTTC as total TTC before remise minus remise (remise is DT)
    const montantTTC = Math.max(0, totalTTCBeforeRemise - remiseAmount);
    // Scale HT and TVA proportionally so HT + TVA = montantTTC
    const discountFactor = totalTTCBeforeRemise > 0 ? montantTTC / totalTTCBeforeRemise : 0;
    const montantHT = totalHT * discountFactor;
    const tva = totalTVA * discountFactor;
    const montantDonneNum = Number(montantDonne || 0);
    const montantRester = Math.max(0, montantTTC - montantDonneNum);
    // Marge brute per user formula: total TTC before remise - remise - total prix d'achat
    const margeBrute = totalTTCBeforeRemise - remiseAmount - totalPrixAchat;

    // Update stock for each product (decrement for sales)
    for (const item of liste) {
      const produit = await Produit.findById(item.produit);
      produit.stockAvantMouvement = produit.stockActuel;
      produit.stockActuel -= item.quantite;
      produit.stockApresMouvement = produit.stockActuel;
      await produit.save();
    }

    const newNumero = await generateNumeroFacture();
    const facture = new Facture({
      ...factureData,
      client,
      liste: listeWithSnapshot,
      numeroFacture: newNumero,
      typeFacture,
      montantHT,
      tva,
      montantTTC,
      remise: remiseAmount,
      montantDonne: montantDonneNum,
      montantRester,
      margeBrute,
    });
    await facture.save();
    const populatedFacture = await Facture.findById(facture._id)
      .populate('client')
      .populate('liste.produit');
    console.log('Saved facture:', populatedFacture);
    // Update client credit (sum of montantRester across their invoices)
    try {
      const clientId = client;
      const facturesClient = await Facture.find({ client: clientId });
      const totalCredit = facturesClient.reduce((s, f) => s + Number(f.montantRester || 0), 0);
      await Client.findByIdAndUpdate(clientId, { credit: totalCredit });
    } catch (creditErr) {
      console.error('Failed to update client credit:', creditErr);
    }

    res.status(201).json(populatedFacture);
    // Update monthly résumé for the facture's month
    try {
      const dateToUse = populatedFacture.dateFacturation || populatedFacture.createdAt || new Date();
      await resumeHelpers.upsertMonthResume(dateToUse);
    } catch (resumeErr) {
      console.error('Failed to upsert month résumé after facture create:', resumeErr);
    }
  } catch (err) {
    console.error('Error creating facture:', err);
    if (err.code === 11000 && err.keyPattern.numeroFacture) {
      try {
        const newNumero = await generateNumeroFacture();
        // Fallback: store minimal info
        const facture = new Facture({ ...req.body, numeroFacture: newNumero });
        await facture.save();
        const populatedFacture = await Facture.findById(facture._id)
          .populate('client')
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

router.put('/:id', async (req, res) => {
  try {
    console.log('PUT /api/factures/:id payload:', req.body);
    const { numeroFacture, client, liste, typeFacture, montantDonne, remise, ...updateData } = req.body;

    if (typeFacture && ![ 'Client', 'Bon de Livraison'].includes(typeFacture)) {
      return res.status(400).json({ error: 'Invalid typeFacture' });
    }

    if (client && !mongoose.Types.ObjectId.isValid(client)) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }
    if (client) {
      const clientExists = await Client.findById(client);
      if (!clientExists) {
        return res.status(400).json({ error: 'Client not found' });
      }
    }

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

    if (liste) {
      const existingFacture = await Facture.findById(req.params.id);
      if (!existingFacture) {
        return res.status(404).json({ error: 'Facture not found' });
      }
      // Revert previous stock changes
      for (const item of existingFacture.liste) {
        const produit = await Produit.findById(item.produit);
        if (produit) {
          produit.stockActuel += item.quantite;
          produit.stockAvantMouvement = produit.stockActuel;
          produit.stockApresMouvement = produit.stockActuel;
          await produit.save();
        }
      }

      // Validate and apply new stock changes
      for (const item of liste) {
        const produit = await Produit.findById(item.produit);
        if (produit.stockActuel < item.quantite) {
          return res.status(400).json({ error: `Insufficient stock for produit: ${produit.nomProduit}. Current stock: ${produit.stockActuel}` });
        }
        produit.stockAvantMouvement = produit.stockActuel;
        produit.stockActuel -= item.quantite;
        produit.stockApresMouvement = produit.stockActuel;
        await produit.save();
      }

      // Recalculate totals and liste snapshot
      let totalHT = 0;
      let totalTVA = 0;
      let totalTTCBeforeRemise = 0;
      let totalPrixAchat = 0;
      let margeBrute = 0; // will compute below
      const listeWithSnapshot = [];
      for (const item of liste) {
        const produit = await Produit.findById(item.produit);
        const qty = Number(item.quantite) || 0;
        const unitHT = Number(produit.prixUnitaireHT || 0);
        const unitTVAPercent = Number(produit.tvaApplicable || 0);
        const unitAchat = Number(produit.prixAchat || 0);
        totalHT += unitHT * qty;
        const unitTVA = (unitHT * (unitTVAPercent / 100));
        totalTVA += unitTVA * qty;
        totalTTCBeforeRemise += (unitHT + unitTVA) * qty;
        totalPrixAchat += unitAchat * qty;
        listeWithSnapshot.push({ produit: item.produit, quantite: qty, prixUnitaireHTAtSale: unitHT, prixAchatAtSale: unitAchat });
      }
  const remiseAmount = Number(remise || 0);
  const montantTTC = Math.max(0, totalTTCBeforeRemise - remiseAmount);
  const discountFactor = totalTTCBeforeRemise > 0 ? montantTTC / totalTTCBeforeRemise : 0;
  const montantHT = totalHT * discountFactor;
  const tva = totalTVA * discountFactor;
      const montantDonneNum = Number(montantDonne || 0);
      const montantRester = Math.max(0, montantTTC - montantDonneNum);
      // Marge brute per user formula
      margeBrute = totalTTCBeforeRemise - remiseAmount - totalPrixAchat;
      updateData.montantHT = montantHT;
      updateData.tva = tva;
      updateData.montantTTC = montantTTC;
      updateData.remise = remiseAmount;
      updateData.montantDonne = montantDonneNum;
      updateData.montantRester = montantRester;
      updateData.margeBrute = margeBrute;
      updateData.liste = listeWithSnapshot;
    }

    const facture = await Facture.findByIdAndUpdate(req.params.id, { ...updateData, client, typeFacture }, { new: true })
      .populate('client')
      .populate('liste.produit');
    if (!facture) return res.status(404).json({ error: 'Facture not found' });

    // Update client credit
    try {
      const clientId = facture.client?._id || facture.client;
      const facturesClient = await Facture.find({ client: clientId });
      const totalCredit = facturesClient.reduce((s, f) => s + Number(f.montantRester || 0), 0);
      await Client.findByIdAndUpdate(clientId, { credit: totalCredit });
    } catch (creditErr) {
      console.error('Failed to update client credit after update:', creditErr);
    }
    res.json(facture);
    // Update monthly résumé for the facture's month after update
    try {
      const dateToUse = facture.dateFacturation || facture.updatedAt || new Date();
      await resumeHelpers.upsertMonthResume(dateToUse);
    } catch (resumeErr) {
      console.error('Failed to upsert month résumé after facture update:', resumeErr);
    }
  } catch (err) {
    console.error('Error updating facture:', err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const factures = await Facture.find()
      .populate('client')
      .populate('liste.produit');
    res.json(factures);
  } catch (err) {
    console.error('Error fetching factures:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const facture = await Facture.findById(req.params.id)
      .populate('client')
      .populate('liste.produit');
    if (!facture) return res.status(404).json({ error: 'Facture not found' });
    console.log('Fetched facture by ID:', facture);
    res.json(facture);
  } catch (err) {
    console.error('Error fetching facture by ID:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const facture = await Facture.findById(req.params.id);
    if (!facture) return res.status(404).json({ error: 'Facture not found' });
    // Restore stock
    for (const item of facture.liste) {
      const produit = await Produit.findById(item.produit);
      if (produit) {
        produit.stockActuel += item.quantite;
        produit.stockAvantMouvement = produit.stockActuel;
        produit.stockApresMouvement = produit.stockActuel;
        await produit.save();
      }
    }

    const clientId = facture.client;
    await Facture.findByIdAndDelete(req.params.id);

    // Update client credit
    try {
      const facturesClient = await Facture.find({ client: clientId });
      const totalCredit = facturesClient.reduce((s, f) => s + Number(f.montantRester || 0), 0);
      await Client.findByIdAndUpdate(clientId, { credit: totalCredit });
    } catch (creditErr) {
      console.error('Failed to update client credit after delete:', creditErr);
    }

    res.json({ message: 'Facture deleted' });
    // Update monthly résumé for the facture's month after delete
    try {
      await resumeHelpers.upsertMonthResume(facture.dateFacturation || new Date());
    } catch (resumeErr) {
      console.error('Failed to upsert month résumé after facture delete:', resumeErr);
    }
  } catch (err) {
    console.error('Error deleting facture:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;