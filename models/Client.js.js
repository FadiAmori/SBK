const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  numeroClient: { type: String, required: true, unique: true },
  nomRaisonSociale: { type: String, required: true },
  adresse: { type: String, required: true },
  telephone: { type: String },
  email: { type: String },
  dateInscription: { type: Date, default: Date.now },
  typeClient: { type: String, enum: ['Particulier', 'Entreprise', 'Distributeur'] },
  conditionsPaiement: { type: String },
  historiqueAchats: { type: Number, default: 0 },
  remisesConditionsSpeciales: { type: String },
  recherche: { type: [String] }
});

module.exports = mongoose.model('Client', clientSchema);