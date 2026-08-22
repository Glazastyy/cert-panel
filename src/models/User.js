const { DataTypes } = require('sequelize');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    role: {
      type: DataTypes.ENUM('admin', 'operator', 'user'),
      defaultValue: 'user'
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    lastLogin: {
      type: DataTypes.DATE
    }
  }, {
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      }
    },
    timestamps: true
  });

  User.prototype.checkPassword = async function(password) {
    return await bcrypt.compare(password, this.password);
  };

  User.createDefaultAdmin = async function() {
    const normalizedAdmin = await User.findOne({ where: { username: 'ADSIS0' } });
    
    if (normalizedAdmin) {
      return;
    }

    const legacyAdmin = await User.findOne({ where: { username: { [Op.in]: ['admin', 'ADMINISTRADORDOSISTEMA'] } } });

    if (legacyAdmin) {
      await legacyAdmin.update({
        username: 'ADSIS0',
        fullName: 'ADMINISTRADOR DO SISTEMA'
      });
      return;
    }

    await User.create({
      username: 'ADSIS0',
      password: 'admin123',
      fullName: 'ADMINISTRADOR DO SISTEMA',
      email: 'admin@zerocert.local',
      role: 'admin'
    });
    console.log('Usuário administrador padrão criado');
  };

  return User;
};
