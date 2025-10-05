const mongoose = require('mongoose');

const factureSchema = new mongoose.Schema({
  numeroFacture: { type: String, unique: true },
  dateFacturation: { type: Date, default: Date.now },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  montantHT: { type: Number },
  tva: { type: Number },
  montantTTC: { type: Number },
  remise: { type: Number, default: 0 },
  dateEcheance: { type: Date },
  modePaiement: { type: String, enum: ['Chèque', 'Virement', 'Espèces', 'Traite'] },
  dateReglement: { type: Date },
  statut: { type: String, enum: ['Payée', 'Partiellement payée', 'En attente'], default: 'En attente' },
  recherche: { type: [String] },
  typeFacture: { type: String, enum: ['BL', 'Client', 'Bonde de Livraison'], default: 'Client' },
  liste: [
    {
      produit: { type: mongoose.Schema.Types.ObjectId, ref: 'Produit' },
      quantite: { type: Number, min: 1 },
    },
  ],
});

module.exports = mongoose.model('Facture', factureSchema);