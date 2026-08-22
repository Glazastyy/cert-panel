const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('Session', {
  sid: {
    type: DataTypes.STRING(128),
    primaryKey: true
  },
  expires: {
    type: DataTypes.DATE,
    allowNull: false,
    index: true
  },
  data: {
    type: DataTypes.TEXT,
    allowNull: false
  }
}, {
  timestamps: true
});
