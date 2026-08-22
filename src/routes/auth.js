const express = require('express');
const router = express.Router();
const { sequelize } = require('../database/db');
const { emailService } = require('../services/email');
const { emailValidator } = require('../services/email-validation');
const { getRequiredEnv } = require('../config/security');
const {
  RegistrationInputError,
  createRegistrationService
} = require('../services/registration');
const {
  UserIdentityError,
  normalizeUserIdentity,
  normalizeUsername
} = require('../services/user-identity');

function createCurrentRegistrationService() {
  return createRegistrationService({
    userModel: sequelize.models.User,
    emailValidator,
    emailService,
    sessionSecret: getRequiredEnv('SESSION_SECRET')
  });
}

async function applyLoginIdentityUpdate(req, User, user) {
  try {
    const identity = await normalizeUserIdentity({ userModel: User, user });

    await user.update({
      username: identity.username,
      fullName: identity.fullName,
      lastLogin: new Date()
    });
    delete req.session.requireNameCorrection;
  } catch (error) {
    if (!(error instanceof UserIdentityError)) {
      throw error;
    }

    req.session.requireNameCorrection = true;
    await user.update({ lastLogin: new Date() });
  }
}

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('auth/login', { title: 'Login - ZeroCert ICP-Brasil' });
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const User = sequelize.models.User;
    const normalizedLoginUsername = normalizeUsername(username);
    
    let user = await User.findOne({ where: { username } });

    if (!user && normalizedLoginUsername) {
      user = await User.findOne({ where: { username: normalizedLoginUsername } });
    }
    
    if (!user || !(await user.checkPassword(password))) {
      return res.render('auth/login', {
        title: 'Login - ZeroCert ICP-Brasil',
        error: 'Nome de usuário ou senha inválidos',
        username
      });
    }
    
    if (!user.active) {
      return res.render('auth/login', {
        title: 'Login - ZeroCert ICP-Brasil',
        error: 'Usuário desativado. Entre em contato com o administrador',
        username
      });
    }
    
    await applyLoginIdentityUpdate(req, User, user);
    await emailService.sendNotification({
      to: user.email,
      subject: 'Novo login no ZeroCert',
      message: `Olá, ${user.fullName}.\n\nUm login foi realizado na sua conta ZeroCert.\n\nUsuário: ${user.username}\nData e hora: ${new Date().toLocaleString('pt-BR')}`
    });
    
    req.session.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role
    };
    
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Erro ao processar login:', error);
    res.render('auth/login', {
      title: 'Login - ZeroCert ICP-Brasil',
      error: 'Ocorreu um erro ao processar o login. Tente novamente mais tarde.',
      username: req.body.username
    });
  }
});

router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('auth/register', { title: 'Registro - ZeroCert ICP-Brasil' });
});

router.post('/register', async (req, res) => {
  try {
    const registrationService = createCurrentRegistrationService();
    const pendingRegistration = await registrationService.beginRegistration({
      session: req.session,
      input: req.body
    });

    res.render('auth/confirm-registration', {
      title: 'Confirmar Cadastro - ZeroCert ICP-Brasil',
      success: 'Enviamos um código de confirmação para o seu e-mail.',
      email: pendingRegistration.email
    });
  } catch (error) {
    if (error instanceof RegistrationInputError) {
      return res.render('auth/register', {
        title: 'Registro - ZeroCert ICP-Brasil',
        error: error.message,
        ...error.formData
      });
    }

    console.error('Erro ao processar registro:', error);
    res.render('auth/register', {
      title: 'Registro - ZeroCert ICP-Brasil',
      error: 'Ocorreu um erro ao processar o registro. Tente novamente mais tarde.',
      username: req.body.username,
      fullName: req.body.fullName,
      email: req.body.email
    });
  }
});

router.get('/register/confirm', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  if (!req.session.pendingRegistration) {
    return res.redirect('/register');
  }

  res.render('auth/confirm-registration', {
    title: 'Confirmar Cadastro - ZeroCert ICP-Brasil',
    email: req.session.pendingRegistration.email
  });
});

router.post('/register/confirm', async (req, res) => {
  try {
    const registrationService = createCurrentRegistrationService();
    const user = await registrationService.confirmRegistration({
      session: req.session,
      code: req.body.code
    });

    res.render('auth/login', {
      title: 'Login - ZeroCert ICP-Brasil',
      success: 'Cadastro confirmado com sucesso. Faça login para continuar.',
      username: user.username
    });
  } catch (error) {
    if (error instanceof RegistrationInputError) {
      return res.render('auth/confirm-registration', {
        title: 'Confirmar Cadastro - ZeroCert ICP-Brasil',
        error: error.message,
        email: req.session.pendingRegistration ? req.session.pendingRegistration.email : null
      });
    }

    console.error('Erro ao confirmar registro:', error);
    res.render('auth/confirm-registration', {
      title: 'Confirmar Cadastro - ZeroCert ICP-Brasil',
      error: 'Ocorreu um erro ao confirmar o cadastro. Tente novamente mais tarde.',
      email: req.session.pendingRegistration ? req.session.pendingRegistration.email : null
    });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Erro ao encerrar sessão:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;
