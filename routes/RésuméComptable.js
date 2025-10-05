const express = require('express');
const router = express.Router();
const ResumeComptable = require('../models/RésuméComptable');
const Facture = require('../models/Facture');
const FactureAchat = require('../models/FactureAchat');

// Helper function to aggregate data for a given period
const aggregateFinancialData = async (startDate, endDate) => {
  try {
    const chiffreAffaires = await Facture.aggregate([
      {
        $match: {
          dateFacturation: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$montantHT' },
        },
      },
    ]);

    const achats = await FactureAchat.aggregate([
      {
        $match: {
          dateFacturation: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$montantHT' },
        },
      },
    ]);

    return {
      chiffreAffaires: chiffreAffaires[0]?.total || 0,
      achats: achats[0]?.total || 0,
    };
  } catch (err) {
    console.error('Error aggregating financial data:', err);
    return {
      chiffreAffaires: 0,
      achats: 0,
    };
  }
};

// Generate monthly résumés (can be called by cron or endpoint)
const generateMonthlyResumes = async () => {
  try {
    const now = new Date();
    const startYear = 2020; // Adjust based on data range
    const endYear = now.getFullYear();

    for (let year = startYear; year <= endYear; year++) {
      for (let month = 0; month < 12; month++) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

        const existing = await ResumeComptable.findOne({
          periode: startDate,
          periodeType: 'month',
        });

        if (!existing) {
          const { chiffreAffaires, achats } = await aggregateFinancialData(startDate, endDate);
          const margeBrute = chiffreAffaires - achats;
          const fraisGeneraux = 0; // Default
          const resultatNet = margeBrute - fraisGeneraux;

          await ResumeComptable.create({
            periode: startDate,
            periodeType: 'month',
            chiffreAffaires,
            achats,
            margeBrute,
            fraisGeneraux,
            resultatNet,
          });
        }
      }
    }
    console.log('Monthly résumés generated successfully');
  } catch (err) {
    console.error('Error generating monthly résumés:', err);
    throw err;
  }
};

// Create or update résumé (manual trigger or cron)
router.post('/', async (req, res) => {
  try {
    await generateMonthlyResumes();
    res.status(201).json({ message: 'Résumés comptables generated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get résumés with filtering
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, periodeType } = req.query;
    let query = {};

    if (startDate && endDate) {
      query.periode = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }
    if (periodeType) {
      query.periodeType = periodeType;
    }

    const resumes = await ResumeComptable.find(query).sort({ periode: 1 });
    res.json(resumes);
  } catch (err) {
    console.error('Error fetching résumés:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update fraisGeneraux
router.put('/:id', async (req, res) => {
  try {
    const { fraisGeneraux } = req.body;
    if (fraisGeneraux == null || isNaN(fraisGeneraux) || fraisGeneraux < 0) {
      return res.status(400).json({ error: 'Invalid fraisGeneraux value' });
    }

    const resume = await ResumeComptable.findById(req.params.id);
    if (!resume) {
      return res.status(404).json({ error: 'Résumé comptable not found' });
    }

    resume.fraisGeneraux = fraisGeneraux;
    resume.resultatNet = resume.margeBrute - fraisGeneraux;
    await resume.save();

    res.json(resume);
  } catch (err) {
    console.error('Error updating résumé:', err);
    res.status(400).json({ error: err.message });
  }
});

// Delete a résumé
router.delete('/:id', async (req, res) => {
  try {
    const resume = await ResumeComptable.findByIdAndDelete(req.params.id);
    if (!resume) {
      return res.status(404).json({ error: 'Résumé comptable not found' });
    }
    res.json({ message: 'Résumé comptable deleted' });
  } catch (err) {
    console.error('Error deleting résumé:', err);
    res.status(500).json({ error: err.message });
  }
});
const generateResumes = async () => {
  try {
    const now = new Date();
    const startYear = 2020;
    const endYear = now.getFullYear();

    // Monthly résumés
    for (let year = startYear; year <= endYear; year++) {
      for (let month = 0; month < 12; month++) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

        const existing = await ResumeComptable.findOne({
          periode: startDate,
          periodeType: 'month',
        });

        if (!existing) {
          const { chiffreAffaires, achats } = await aggregateFinancialData(startDate, endDate);
          const margeBrute = chiffreAffaires - achats;
          const fraisGeneraux = 0;
          const resultatNet = margeBrute - fraisGeneraux;

          await ResumeComptable.create({
            periode: startDate,
            periodeType: 'month',
            chiffreAffaires,
            achats,
            margeBrute,
            fraisGeneraux,
            resultatNet,
          });
        }
      }
    }

    // Quarterly résumés
    for (let year = startYear; year <= endYear; year++) {
      for (let quarter = 0; quarter < 4; quarter++) {
        const startDate = new Date(year, quarter * 3, 1);
        const endDate = new Date(year, quarter * 3 + 3, 0, 23, 59, 59, 999);

        const existing = await ResumeComptable.findOne({
          periode: startDate,
          periodeType: 'quarter',
        });

        if (!existing) {
          const { chiffreAffaires, achats } = await aggregateFinancialData(startDate, endDate);
          const margeBrute = chiffreAffaires - achats;
          const fraisGeneraux = 0;
          const resultatNet = margeBrute - fraisGeneraux;

          await ResumeComptable.create({
            periode: startDate,
            periodeType: 'quarter',
            chiffreAffaires,
            achats,
            margeBrute,
            fraisGeneraux,
            resultatNet,
          });
        }
      }
    }
    console.log('Résumés generated successfully');
  } catch (err) {
    console.error('Error generating résumés:', err);
    throw err;
  }
};

// Update POST route
router.post('/', async (req, res) => {
  try {
    await generateResumes();
    res.status(201).json({ message: 'Résumés comptables generated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
