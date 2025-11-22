const mongoose = require('mongoose');

const factureSchema = new mongoose.Schema({
  numeroFacture: { type: String, unique: true },
  dateFacturation: { type: Date, default: Date.now },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  montantHT: { type: Number },
  tva: { type: Number },
  montantTTC: { type: Number },
  // remise is stored as a fixed amount in dinars (DT), not a percentage
  remise: { type: Number, default: 0 },
  // montant donné (paiement partiel) and montant restant à payer
  montantDonne: { type: Number, default: 0 },
  montantRester: { type: Number, default: 0 },
  // marge brute réalisée sur la facture (vente - achat)
  margeBrute: { type: Number, default: 0 },
  dateEcheance: { type: Date },
  modePaiement: { type: String, enum: ['Chèque', 'Virement', 'Espèces', 'Traite'] },
  dateReglement: { type: Date },
  statut: { type: String, enum: ['Payée', 'Partiellement payée', 'En attente'], default: 'En attente' },
  recherche: { type: [String] },
  typeFacture: { type: String, enum: [ 'Client', 'Bon de Livraison'], default: 'Client' },
  liste: [
    {
      produit: { type: mongoose.Schema.Types.ObjectId, ref: 'Produit' },
      quantite: { type: Number, min: 1 },
    },
  ],
});

module.exports = mongoose.model('Facture', factureSchema);