const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Facture = require('../models/Facture');
const Client = require('../models/Client.js');
const Produit = require('../models/Produit');

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
    const { numeroFacture, client, liste, typeFacture, ...factureData } = req.body;

    if (!typeFacture || !['BL', 'Client', 'Bonde de Livraison'].includes(typeFacture)) {
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

    for (const item of liste) {
      const produit = await Produit.findById(item.produit);
      produit.stockAvantMouvement = produit.stockActuel;
      produit.stockActuel -= item.quantite;
      produit.stockApresMouvement = produit.stockActuel;
      await produit.save();
    }

    const newNumero = await generateNumeroFacture();
    const facture = new Facture({ ...factureData, client, liste, numeroFacture: newNumero, typeFacture });
    await facture.save();
    const populatedFacture = await Facture.findById(facture._id)
      .populate('client')
      .populate('liste.produit');
    console.log('Saved facture:', populatedFacture);
    res.status(201).json(populatedFacture);
  } catch (err) {
    console.error('Error creating facture:', err);
    if (err.code === 11000 && err.keyPattern.numeroFacture) {
      try {
        const newNumero = await generateNumeroFacture();
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
    const { numeroFacture, client, liste, typeFacture, ...updateData } = req.body;

    if (typeFacture && !['BL', 'Client', 'Bonde de Livraison'].includes(typeFacture)) {
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

      for (const item of existingFacture.liste) {
        const produit = await Produit.findById(item.produit);
        if (produit) {
          produit.stockActuel += item.quantite;
          produit.stockAvantMouvement = produit.stockActuel;
          produit.stockApresMouvement = produit.stockActuel;
          await produit.save();
        }
      }

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
    }

    const facture = await Facture.findByIdAndUpdate(req.params.id, { ...updateData, client, liste, typeFacture }, { new: true })
      .populate('client')
      .populate('liste.produit');
    if (!facture) return res.status(404).json({ error: 'Facture not found' });
    res.json(facture);
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

    for (const item of facture.liste) {
      const produit = await Produit.findById(item.produit);
      if (produit) {
        produit.stockActuel += item.quantite;
        produit.stockAvantMouvement = produit.stockActuel;
        produit.stockApresMouvement = produit.stockActuel;
        await produit.save();
      }
    }

    await Facture.findByIdAndDelete(req.params.id);
    res.json({ message: 'Facture deleted' });
  } catch (err) {
    console.error('Error deleting facture:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;