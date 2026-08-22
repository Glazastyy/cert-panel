const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('EmailDelivery', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  toEmail: {
    type: DataTypes.STRING,
    allowNull: false
  },
  subject: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  messageFormat: {
    type: DataTypes.ENUM('text', 'html'),
    allowNull: false,
    defaultValue: 'text'
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'sent', 'failed'),
    allowNull: false,
    defaultValue: 'pending'
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  lastError: {
    type: DataTypes.TEXT
  },
  nextAttemptAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  sentAt: {
    type: DataTypes.DATE
  }
}, {
  timestamps: true
});
