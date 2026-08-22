const express = require('express');
const router = express.Router();
const { sequelize } = require('../database/db');
const { emailService } = require('../services/email');

// Rota para a página de login
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('auth/login', { title: 'Login - ZeroCert ICP-Brasil' });
});

// Rota para processar o login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const User = sequelize.models.User;
    
    // Buscar o usuário pelo nome de usuário
    const user = await User.findOne({ where: { username } });
    
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
    
    // Atualizar a data do último login
    await user.update({ lastLogin: new Date() });
    await emailService.sendNotification({
      to: user.email,
      subject: 'Novo login no ZeroCert',
      message: `Olá, ${user.fullName}.\n\nUm login foi realizado na sua conta ZeroCert.\n\nUsuário: ${user.username}\nData e hora: ${new Date().toLocaleString('pt-BR')}`
    });
    
    // Armazenar o usuário na sessão (excluindo a senha)
    req.session.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role
    };
    
    // Redirecionar para o dashboard
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

// Rota para a página de registro (apenas para desenvolvimento)
router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('auth/register', { title: 'Registro - ZeroCert ICP-Brasil' });
});

// Rota para processar o registro (apenas para desenvolvimento)
router.post('/register', async (req, res) => {
  try {
    const { username, password, confirmPassword, fullName, email } = req.body;
    const User = sequelize.models.User;
    
    // Validar os dados
    if (password !== confirmPassword) {
      return res.render('auth/register', {
        title: 'Registro - ZeroCert ICP-Brasil',
        error: 'As senhas não coincidem',
        username,
        fullName,
        email
      });
    }
    
    // Verificar se o usuário já existe
    const existingUser = await User.findOne({
      where: { username }
    });
    
    if (existingUser) {
      return res.render('auth/register', {
        title: 'Registro - ZeroCert ICP-Brasil',
        error: 'Nome de usuário já está em uso',
        fullName,
        email
      });
    }
    
    // Verificar se o e-mail já existe
    const existingEmail = await User.findOne({
      where: { email }
    });
    
    if (existingEmail) {
      return res.render('auth/register', {
        title: 'Registro - ZeroCert ICP-Brasil',
        error: 'E-mail já está em uso',
        username,
        fullName
      });
    }
    
    // Criar o usuário
    await User.create({
      username,
      password,
      fullName,
      email,
      role: 'user' // Papel padrão para novos usuários
    });
    
    // Redirecionar para a página de login com mensagem de sucesso
    res.render('auth/login', {
      title: 'Login - ZeroCert ICP-Brasil',
      success: 'Registro realizado com sucesso. Faça login para continuar.',
      username
    });
  } catch (error) {
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

// Rota para logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Erro ao encerrar sessão:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;
