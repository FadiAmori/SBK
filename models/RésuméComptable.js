const mongoose = require('mongoose');

const resumeComptableSchema = new mongoose.Schema({
  periode: {
    type: Date,
    required: true,
  },
  periodeType: {
    type: String,
    enum: ['month', 'quarter', 'year'],
    required: true,
  },
  chiffreAffaires: {
    type: Number,
    default: 0,
  },
  achats: {
    type: Number,
    default: 0,
  },
  margeBrute: {
    type: Number,
    default: 0,
  },
  fraisGeneraux: {
    type: Number,
    default: 0,
  },
  resultatNet: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Ensure unique combination of periode and periodeType
resumeComptableSchema.index({ periode: 1, periodeType: 1 }, { unique: true });

module.exports = mongoose.model('ResumeComptable', resumeComptableSchema);