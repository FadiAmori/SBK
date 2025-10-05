const mongoose = require('mongoose');

const fournisseurSchema = new mongoose.Schema({
  numeroFournisseur: { type: String, required: true, unique: true },
  nomRaisonSociale: { type: String, required: true },
  adresse: { type: String, required: true },
  telephone: { type: String },
  email: { type: String },
  dateInscription: { type: Date, default: Date.now },
  nomContact: { type: String },
  typeFournisseur: { type: String, enum: ['Produits', 'Matières premières', 'Services'] },
  delaiPaiement: { type: String },
  modePaiement: { type: String, enum: ['Chèque', 'Virement', 'Espèces'] },
  compteBancaire: { type: String },
  historiqueAchats: { type: Number, default: 0 },
  remisesConditionsSpeciales: { type: String },
  recherche: { type: [String] }
});

module.exports = mongoose.model('Fournisseur', fournisseurSchema);