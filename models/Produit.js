const mongoose = require('mongoose');

const produitSchema = new mongoose.Schema({
  referenceProduit: { type: String, required: true, unique: true },
  nomProduit: { type: String, required: true },
  categorie: { type: String },
  description: { type: String },
  prixAchat: { type: Number, required: true, min: [0.01, 'Le prix d\'achat doit être supérieur à 0.'] },
  prixUnitaireHT: { type: Number, required: true, min: [0.01, 'Le prix unitaire HT doit être supérieur à 0.'] },
  margeDegagnante: { type: Number, min: [0, 'La marge dégagnante ne peut pas être négative.'] },
  tvaApplicable: { type: Number },
  stockActuel: { type: Number, default: 0, min: 0 },
  stockMinimal: { type: Number, default: 0, min: 0 },
  seuilReapprovisionnement: { type: Number, default: 0, min: 0 },
  fournisseurPrincipal: { type: mongoose.Schema.Types.ObjectId, ref: 'Fournisseur' },
  quantite: { type: Number, min: 0 },
  stockAvantMouvement: { type: Number, min: 0 },
  stockApresMouvement: { type: Number, min: 0 },
  recherche: { type: [String] },
  rechercheCorrespondance: { type: [String] }
});



module.exports = mongoose.model('Produit', produitSchema);