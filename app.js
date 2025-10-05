const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const clientRoutes = require('./routes/client');
const fournisseurRoutes = require('./routes/fournisseur');
const produitRoutes = require('./routes/produit');
const factureRoutes = require('./routes/facture');
const FactureAchatRoutes = require('./routes/FactureAchat');
const bonDeSortieRoutes = require('./routes/bonDeSortie');
const RésuméComptable = require('./routes/RésuméComptable');

dotenv.config();
const app = express();

// CORS configuration
const corsOptions = {
  origin: 'https://sbk-frontend-bh3d.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Cache-Control'],
  maxAge: 86400,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
const routes = [
    { path: '/api/factureAchats', router: FactureAchatRoutes, name: 'FactureAchatRoutes' },
  { path: '/api/clients', router: clientRoutes, name: 'Client' },
  { path: '/api/fournisseurs', router: fournisseurRoutes, name: 'Fournisseur' },
  { path: '/api/produits', router: produitRoutes, name: 'Produit' },
  { path: '/api/factures', router: factureRoutes, name: 'Facture' },
  { path: '/api/bons-de-sortie', router: bonDeSortieRoutes, name: 'Bon de Sortie' },
  { path: '/api/resumes-comptables', router: RésuméComptable, name: 'RésuméComptable' }

];

routes.forEach(route => {
  app.use(route.path, route.router);
  console.log(`Route ${route.name}: ${route.path}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
