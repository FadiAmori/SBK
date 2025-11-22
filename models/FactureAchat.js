const mongoose = require('mongoose');

const factureAchatSchema = new mongoose.Schema({
  numeroFacture: { type: String, required: true, unique: true },
  dateFacturation: { type: Date, default: Date.now },
  fournisseur: { type: mongoose.Schema.Types.ObjectId, ref: 'Fournisseur', required: true },
  // montant fields will be calculated from produit.prixAchat * quantite
  montantHT: { type: Number, required: true },
  tva: { type: Number, required: true },
  montantTTC: { type: Number, required: true },
  // For display: store fournisseur matricule fiscale from fournisseur at time of invoice
  fournisseurMatriculeFiscale: { type: String },
  dateEcheance: { type: Date },
  modePaiement: { type: String, enum: ['Chèque', 'Virement', 'Espèces', 'Traite'] },
  dateReglement: { type: Date },
  statut: { type: String, enum: ['Payée', 'Partiellement payée', 'En attente'], default: 'En attente' },
  recherche: { type: [String] },
  liste: [
    {
      produit: { type: mongoose.Schema.Types.ObjectId, ref: 'Produit', required: true },
      quantite: { type: Number, required: true, min: 1 },
    },
  ],
});

module.exports = mongoose.model('FactureAchat', factureAchatSchema);