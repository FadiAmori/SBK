const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  numeroClient: { type: String, required: true, unique: true },
  nomRaisonSociale: { type: String, required: true },
  adresse: { type: String, required: true },
  telephone: { type: String },
  email: { type: String },
  // Matricule fiscale du client
  matriculeFiscale: { type: String },
  // Crédit du client (somme des montants restants à payer)
  credit: { type: Number, default: 0 },
  dateInscription: { type: Date, default: Date.now },
  typeClient: { type: String, enum: ['Particulier', 'Entreprise', 'Distributeur'] },
  conditionsPaiement: { type: String },
  historiqueAchats: { type: Number, default: 0 },
  remisesConditionsSpeciales: { type: String },
  recherche: { type: [String] }
});

module.exports = mongoose.model('Client', clientSchema);