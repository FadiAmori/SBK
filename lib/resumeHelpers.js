const ResumeComptable = require('../models/RésuméComptable');
const Facture = require('../models/Facture');
const FactureAchat = require('../models/FactureAchat');

// aggregate function
const aggregateFinancialData = async (startDate, endDate) => {
  try {
    const chiffreAffaires = await Facture.aggregate([
      { $match: { dateFacturation: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: null, total: { $sum: '$montantHT' } } },
    ]);

    const achats = await FactureAchat.aggregate([
      { $match: { dateFacturation: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: null, total: { $sum: '$montantHT' } } },
    ]);

    return {
      chiffreAffaires: chiffreAffaires[0]?.total || 0,
      achats: achats[0]?.total || 0,
    };
  } catch (err) {
    console.error('resumeHelpers.aggregateFinancialData error:', err);
    return { chiffreAffaires: 0, achats: 0 };
  }
};

// Upsert monthly résumé for the month containing `date`
const upsertMonthResume = async (date) => {
  try {
    const d = date ? new Date(date) : new Date();
    const startDate = new Date(d.getFullYear(), d.getMonth(), 1);
    const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

    const { chiffreAffaires, achats } = await aggregateFinancialData(startDate, endDate);
    const margeBrute = chiffreAffaires - achats;
    const fraisGeneraux = 0;
    const resultatNet = margeBrute - fraisGeneraux;

    const updated = await ResumeComptable.findOneAndUpdate(
      { periode: startDate, periodeType: 'month' },
      {
        periode: startDate,
        periodeType: 'month',
        chiffreAffaires,
        achats,
        margeBrute,
        fraisGeneraux,
        resultatNet,
      },
      { upsert: true, new: true }
    );

    return updated;
  } catch (err) {
    console.error('resumeHelpers.upsertMonthResume error:', err);
    throw err;
  }
};

module.exports = { upsertMonthResume };
