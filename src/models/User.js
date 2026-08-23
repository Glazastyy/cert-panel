const { DataTypes } = require('sequelize');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const { isAllowedPrivilegedEmail } = require('../services/privileged-email');

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

  User.resolveDefaultAdminEmail = async function(currentUserId = null) {
    const baseCandidates = ['admin@zerocert.com.br', 'admin+adsis0@zerocert.com.br'];

    for (const candidate of baseCandidates) {
      const owner = await User.findOne({ where: { email: candidate } });

      if (!owner || owner.id === currentUserId) {
        return candidate;
      }
    }

    for (let index = 1; index <= 99; index += 1) {
      const candidate = `admin+adsis0${index}@zerocert.com.br`;
      const owner = await User.findOne({ where: { email: candidate } });

      if (!owner || owner.id === currentUserId) {
        return candidate;
      }
    }

    throw new Error('Não foi possível reservar um e-mail administrativo padrão');
  };

  User.createDefaultAdmin = async function() {
    const normalizedAdmin = await User.findOne({ where: { username: 'ADSIS0' } });
    
    if (normalizedAdmin) {
      if (!isAllowedPrivilegedEmail(normalizedAdmin.email)) {
        await normalizedAdmin.update({ email: await User.resolveDefaultAdminEmail(normalizedAdmin.id) });
      }
      return;
    }

    const legacyAdmin = await User.findOne({ where: { username: { [Op.in]: ['admin', 'ADMINISTRADORDOSISTEMA'] } } });

    if (legacyAdmin) {
      await legacyAdmin.update({
        username: 'ADSIS0',
        fullName: 'ADMINISTRADOR DO SISTEMA',
        email: await User.resolveDefaultAdminEmail(legacyAdmin.id)
      });
      return;
    }

    await User.create({
      username: 'ADSIS0',
      password: 'admin123',
      fullName: 'ADMINISTRADOR DO SISTEMA',
      email: await User.resolveDefaultAdminEmail(),
      role: 'admin'
    });
    console.log('Usuário administrador padrão criado');
  };

  return User;
};
