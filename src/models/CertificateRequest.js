const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CertificateRequest = sequelize.define('CertificateRequest', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    type: {
      type: DataTypes.ENUM('e-CPF', 'e-CNPJ'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending'
    },
    payload: {
      type: DataTypes.JSON,
      allowNull: false
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    reviewedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    certificateId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Certificates',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    }
  }, {
    timestamps: true,
    indexes: [
      {
        fields: ['status']
      },
      {
        fields: ['type']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['reviewedBy']
      },
      {
        fields: ['certificateId']
      }
    ]
  });

  return CertificateRequest;
};
