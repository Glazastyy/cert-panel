const express = require('express');
const router = express.Router();
const { sequelize } = require('../database/db');
const { createECPFCertificate, createECNPJCertificate } = require('../services/ca');

// Middleware para verificar se o usuário está autenticado
const isAuthenticated = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

// Middleware para verificar se o usuário é administrador
const isAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Acesso Negado',
      message: 'Você não tem permissão para acessar esta página.',
      error: { status: 403 }
    });
  }
  next();
};

// Middleware para verificar se o usuário é administrador ou operador
const isAdminOrOperator = (req, res, next) => {
  if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'operator')) {
    return res.status(403).render('error', {
      title: 'Acesso Negado',
      message: 'Você não tem permissão para acessar esta página.',
      error: { status: 403 }
    });
  }
  next();
};

const dateToDDMMYYYY = (value) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const [year, month, day] = value.split('-');
  return `${day}${month}${year}`;
};

// Rota para o dashboard principal
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const Certificate = sequelize.models.Certificate;
    const User = sequelize.models.User;
    
    // Estatísticas para administradores e operadores
    if (req.session.user.role === 'admin' || req.session.user.role === 'operator') {
      const CertificateRequest = sequelize.models.CertificateRequest;
      const totalCertificates = await Certificate.count();
      const activeCertificates = await Certificate.count({ where: { revoked: false } });
      const revokedCertificates = await Certificate.count({ where: { revoked: true } });
      const totalUsers = await User.count();
      const pendingCertificateRequests = await CertificateRequest.count({ where: { status: 'pending' } });
      
      const recentCertificates = await Certificate.findAll({
        limit: 5,
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'serialNumber', 'type', 'validFrom', 'validTo', 'revoked', 'createdAt']
      });
      
      return res.render('dashboard/admin', {
        title: 'Dashboard - ZeroCert ICP-Brasil',
        totalCertificates,
        activeCertificates,
        revokedCertificates,
        totalUsers,
        pendingCertificateRequests,
        recentCertificates
      });
    }
    
    // Dashboard para usuários comuns
    const userCertificates = await Certificate.findAll({
      where: { userId: req.session.user.id },
      order: [['createdAt', 'DESC']]
    });
    
    res.render('dashboard/user', {
      title: 'Meus Certificados - ZeroCert ICP-Brasil',
      certificates: userCertificates
    });
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
    res.status(500).render('error', {
      title: 'Erro',
      message: 'Ocorreu um erro ao carregar o dashboard.',
      error: { status: 500 }
    });
  }
});

router.get('/certificate-requests', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const CertificateRequest = sequelize.models.CertificateRequest;
    const User = sequelize.models.User;
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
    const where = status ? { status } : {};

    const requests = await CertificateRequest.findAll({
      where,
      include: [
        {
          model: User,
          attributes: ['username', 'fullName', 'email']
        },
        {
          model: User,
          as: 'Reviewer',
          attributes: ['username', 'fullName', 'email']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.render('dashboard/certificate-requests', {
      title: 'Solicitações de Certificado - ZeroCert ICP-Brasil',
      requests,
      status
    });
  } catch (error) {
    console.error('Erro ao carregar solicitações de certificado:', error);
    res.status(500).render('error', {
      title: 'Erro',
      message: 'Ocorreu um erro ao carregar as solicitações de certificado.',
      error: { status: 500 }
    });
  }
});

router.post('/certificate-requests/:id/approve', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { p12Password, confirmP12Password } = req.body;
    const CertificateRequest = sequelize.models.CertificateRequest;

    const request = await CertificateRequest.findByPk(req.params.id);

    if (!request || request.status !== 'pending') {
      req.session.flashMessage = {
        type: 'error',
        text: 'Solicitação pendente não encontrada'
      };
      return res.redirect('/dashboard/certificate-requests?status=pending');
    }

    if (p12Password !== confirmP12Password) {
      req.session.flashMessage = {
        type: 'error',
        text: 'As senhas do certificado não coincidem'
      };
      return res.redirect('/dashboard/certificate-requests?status=pending');
    }

    const payload = request.payload;
    const certificate = request.type === 'e-CPF'
      ? await createECPFCertificate({
        ...payload,
        birthDate: dateToDDMMYYYY(payload.birthDate),
        p12Password,
        userId: request.userId
      })
      : await createECNPJCertificate({
        companyName: payload.companyName,
        cnpj: payload.cnpj,
        responsibleName: payload.responsibleName,
        responsibleCPF: payload.responsibleCpf,
        email: payload.email,
        state: payload.state,
        city: payload.city,
        p12Password,
        userId: request.userId
      });

    await request.update({
      status: 'approved',
      reviewedAt: new Date(),
      reviewedBy: req.session.user.id,
      certificateId: certificate.id
    });

    req.session.flashMessage = {
      type: 'success',
      text: 'Solicitação aprovada e certificado emitido com sucesso'
    };

    res.redirect(`/certificates/view/${certificate.id}`);
  } catch (error) {
    console.error('Erro ao aprovar solicitação de certificado:', error);
    req.session.flashMessage = {
      type: 'error',
      text: 'Ocorreu um erro ao aprovar a solicitação'
    };
    res.redirect('/dashboard/certificate-requests?status=pending');
  }
});

router.post('/certificate-requests/:id/reject', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const CertificateRequest = sequelize.models.CertificateRequest;
    const rejectionReason = String(req.body.rejectionReason || '').trim();
    const request = await CertificateRequest.findByPk(req.params.id);

    if (!request || request.status !== 'pending') {
      req.session.flashMessage = {
        type: 'error',
        text: 'Solicitação pendente não encontrada'
      };
      return res.redirect('/dashboard/certificate-requests?status=pending');
    }

    if (!rejectionReason) {
      req.session.flashMessage = {
        type: 'error',
        text: 'Informe o motivo da rejeição'
      };
      return res.redirect('/dashboard/certificate-requests?status=pending');
    }

    await request.update({
      status: 'rejected',
      rejectionReason,
      reviewedAt: new Date(),
      reviewedBy: req.session.user.id
    });

    req.session.flashMessage = {
      type: 'success',
      text: 'Solicitação rejeitada com sucesso'
    };

    res.redirect('/dashboard/certificate-requests?status=pending');
  } catch (error) {
    console.error('Erro ao rejeitar solicitação de certificado:', error);
    req.session.flashMessage = {
      type: 'error',
      text: 'Ocorreu um erro ao rejeitar a solicitação'
    };
    res.redirect('/dashboard/certificate-requests?status=pending');
  }
});

// Rota para gerenciar usuários (apenas admin)
router.get('/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const User = sequelize.models.User;
    
    const users = await User.findAll({
      attributes: ['id', 'username', 'fullName', 'email', 'role', 'active', 'lastLogin', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    
    res.render('dashboard/users', {
      title: 'Gerenciar Usuários - ZeroCert ICP-Brasil',
      users
    });
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);
    res.status(500).render('error', {
      title: 'Erro',
      message: 'Ocorreu um erro ao carregar os usuários.',
      error: { status: 500 }
    });
  }
});

// Rota para adicionar um novo usuário (apenas admin)
router.get('/users/add', isAuthenticated, isAdmin, (req, res) => {
  res.render('dashboard/user-form', {
    title: 'Adicionar Usuário - ZeroCert ICP-Brasil',
    user: null,
    isNew: true
  });
});

// Rota para processar a adição de um novo usuário (apenas admin)
router.post('/users/add', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { username, password, confirmPassword, fullName, email, role, active } = req.body;
    const User = sequelize.models.User;
    
    // Validar os dados
    if (password !== confirmPassword) {
      return res.render('dashboard/user-form', {
        title: 'Adicionar Usuário - ZeroCert ICP-Brasil',
        user: { username, fullName, email, role },
        isNew: true,
        error: 'As senhas não coincidem'
      });
    }
    
    // Verificar se o usuário já existe
    const existingUser = await User.findOne({ where: { username } });
    
    if (existingUser) {
      return res.render('dashboard/user-form', {
        title: 'Adicionar Usuário - ZeroCert ICP-Brasil',
        user: { fullName, email, role },
        isNew: true,
        error: 'Nome de usuário já está em uso'
      });
    }
    
    // Verificar se o e-mail já existe
    const existingEmail = await User.findOne({ where: { email } });
    
    if (existingEmail) {
      return res.render('dashboard/user-form', {
        title: 'Adicionar Usuário - ZeroCert ICP-Brasil',
        user: { username, fullName, role },
        isNew: true,
        error: 'E-mail já está em uso'
      });
    }
    
    // Criar o usuário
    await User.create({
      username,
      password,
      fullName,
      email,
      role,
      active: active === 'on'
    });
    
    // Redirecionar para a lista de usuários com mensagem de sucesso
    req.session.flashMessage = {
      type: 'success',
      text: 'Usuário adicionado com sucesso'
    };
    
    res.redirect('/dashboard/users');
  } catch (error) {
    console.error('Erro ao adicionar usuário:', error);
    res.render('dashboard/user-form', {
      title: 'Adicionar Usuário - ZeroCert ICP-Brasil',
      user: req.body,
      isNew: true,
      error: 'Ocorreu um erro ao adicionar o usuário. Tente novamente mais tarde.'
    });
  }
});

// Rota para editar um usuário (apenas admin)
router.get('/users/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const User = sequelize.models.User;
    
    const user = await User.findByPk(req.params.id, {
      attributes: ['id', 'username', 'fullName', 'email', 'role', 'active']
    });
    
    if (!user) {
      req.session.flashMessage = {
        type: 'error',
        text: 'Usuário não encontrado'
      };
      return res.redirect('/dashboard/users');
    }
    
    res.render('dashboard/user-form', {
      title: 'Editar Usuário - ZeroCert ICP-Brasil',
      user,
      isNew: false
    });
  } catch (error) {
    console.error('Erro ao carregar usuário para edição:', error);
    req.session.flashMessage = {
      type: 'error',
      text: 'Ocorreu um erro ao carregar o usuário para edição'
    };
    res.redirect('/dashboard/users');
  }
});

// Rota para processar a edição de um usuário (apenas admin)
router.post('/users/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { username, password, confirmPassword, fullName, email, role, active } = req.body;
    const User = sequelize.models.User;
    
    const user = await User.findByPk(req.params.id);
    
    if (!user) {
      req.session.flashMessage = {
        type: 'error',
        text: 'Usuário não encontrado'
      };
      return res.redirect('/dashboard/users');
    }
    
    // Verificar se o nome de usuário já está em uso por outro usuário
    if (username !== user.username) {
      const existingUser = await User.findOne({ where: { username } });
      
      if (existingUser) {
        return res.render('dashboard/user-form', {
          title: 'Editar Usuário - ZeroCert ICP-Brasil',
          user: { id: user.id, fullName, email, role, active },
          isNew: false,
          error: 'Nome de usuário já está em uso'
        });
      }
    }
    
    // Verificar se o e-mail já está em uso por outro usuário
    if (email !== user.email) {
      const existingEmail = await User.findOne({ where: { email } });
      
      if (existingEmail && existingEmail.id !== user.id) {
        return res.render('dashboard/user-form', {
          title: 'Editar Usuário - ZeroCert ICP-Brasil',
          user: { id: user.id, username, fullName, role, active },
          isNew: false,
          error: 'E-mail já está em uso'
        });
      }
    }
    
    // Atualizar os dados do usuário
    const updateData = {
      username,
      fullName,
      email,
      role,
      active: active === 'on'
    };
    
    // Atualizar a senha apenas se uma nova senha foi fornecida
    if (password) {
      if (password !== confirmPassword) {
        return res.render('dashboard/user-form', {
          title: 'Editar Usuário - ZeroCert ICP-Brasil',
          user: { id: user.id, username, fullName, email, role, active },
          isNew: false,
          error: 'As senhas não coincidem'
        });
      }
      
      updateData.password = password;
    }
    
    await user.update(updateData);
    
    // Redirecionar para a lista de usuários com mensagem de sucesso
    req.session.flashMessage = {
      type: 'success',
      text: 'Usuário atualizado com sucesso'
    };
    
    res.redirect('/dashboard/users');
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.render('dashboard/user-form', {
      title: 'Editar Usuário - ZeroCert ICP-Brasil',
      user: { id: req.params.id, ...req.body },
      isNew: false,
      error: 'Ocorreu um erro ao atualizar o usuário. Tente novamente mais tarde.'
    });
  }
});

// Rota para excluir um usuário (apenas admin)
router.post('/users/delete/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const User = sequelize.models.User;
    
    const user = await User.findByPk(req.params.id);
    
    if (!user) {
      req.session.flashMessage = {
        type: 'error',
        text: 'Usuário não encontrado'
      };
      return res.redirect('/dashboard/users');
    }
    
    // Não permitir excluir o próprio usuário
    if (user.id === req.session.user.id) {
      req.session.flashMessage = {
        type: 'error',
        text: 'Não é possível excluir o próprio usuário'
      };
      return res.redirect('/dashboard/users');
    }
    
    // Excluir o usuário
    await user.destroy();
    
    req.session.flashMessage = {
      type: 'success',
      text: 'Usuário excluído com sucesso'
    };
    
    res.redirect('/dashboard/users');
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    req.session.flashMessage = {
      type: 'error',
      text: 'Ocorreu um erro ao excluir o usuário'
    };
    res.redirect('/dashboard/users');
  }
});

// Rota para visualizar todos os certificados (admin e operador)
router.get('/certificates', isAuthenticated, isAdminOrOperator, async (req, res) => {
  try {
    const Certificate = sequelize.models.Certificate;
    const User = sequelize.models.User;
    const status = ['active', 'revoked'].includes(req.query.status) ? req.query.status : null;
    const where = status === 'active' ? { revoked: false } : status === 'revoked' ? { revoked: true } : {};
    
    const certificates = await Certificate.findAll({
      where,
      include: [{
        model: User,
        attributes: ['username', 'fullName']
      }],
      order: [['createdAt', 'DESC']]
    });
    
    res.render('dashboard/certificates', {
      title: 'Gerenciar Certificados - ZeroCert ICP-Brasil',
      certificates,
      status
    });
  } catch (error) {
    console.error('Erro ao carregar certificados:', error);
    res.status(500).render('error', {
      title: 'Erro',
      message: 'Ocorreu um erro ao carregar os certificados.',
      error: { status: 500 }
    });
  }
});

// Rota para o perfil do usuário
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const User = sequelize.models.User;
    
    const user = await User.findByPk(req.session.user.id, {
      attributes: ['id', 'username', 'fullName', 'email', 'role', 'lastLogin', 'createdAt']
    });
    
    if (!user) {
      return res.redirect('/logout');
    }
    
    res.render('dashboard/profile', {
      title: 'Meu Perfil - ZeroCert ICP-Brasil',
      user
    });
  } catch (error) {
    console.error('Erro ao carregar perfil:', error);
    res.status(500).render('error', {
      title: 'Erro',
      message: 'Ocorreu um erro ao carregar o perfil.',
      error: { status: 500 }
    });
  }
});

// Rota para atualizar o perfil do usuário
router.post('/profile', isAuthenticated, async (req, res) => {
  try {
    const { fullName, email, currentPassword, newPassword, confirmPassword } = req.body;
    const User = sequelize.models.User;
    
    const user = await User.findByPk(req.session.user.id);
    
    if (!user) {
      return res.redirect('/logout');
    }
    
    // Verificar se o e-mail já está em uso por outro usuário
    if (email !== user.email) {
      const existingEmail = await User.findOne({ where: { email } });
      
      if (existingEmail && existingEmail.id !== user.id) {
        return res.render('dashboard/profile', {
          title: 'Meu Perfil - ZeroCert ICP-Brasil',
          user: { ...user.toJSON(), fullName },
          error: 'E-mail já está em uso'
        });
      }
    }
    
    // Atualizar os dados do usuário
    const updateData = {
      fullName,
      email
    };
    
    // Atualizar a senha apenas se uma nova senha foi fornecida
    if (newPassword) {
      // Verificar se a senha atual está correta
      if (!(await user.checkPassword(currentPassword))) {
        return res.render('dashboard/profile', {
          title: 'Meu Perfil - ZeroCert ICP-Brasil',
          user: { ...user.toJSON(), fullName, email },
          error: 'Senha atual incorreta'
        });
      }
      
      // Verificar se a nova senha e a confirmação coincidem
      if (newPassword !== confirmPassword) {
        return res.render('dashboard/profile', {
          title: 'Meu Perfil - ZeroCert ICP-Brasil',
          user: { ...user.toJSON(), fullName, email },
          error: 'A nova senha e a confirmação não coincidem'
        });
      }
      
      updateData.password = newPassword;
    }
    
    await user.update(updateData);
    
    // Atualizar os dados do usuário na sessão
    req.session.user.fullName = fullName;
    req.session.user.email = email;
    
    res.render('dashboard/profile', {
      title: 'Meu Perfil - ZeroCert ICP-Brasil',
      user: { ...user.toJSON(), fullName, email },
      success: 'Perfil atualizado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.render('dashboard/profile', {
      title: 'Meu Perfil - ZeroCert ICP-Brasil',
      user: { ...req.session.user, ...req.body },
      error: 'Ocorreu um erro ao atualizar o perfil. Tente novamente mais tarde.'
    });
  }
});

module.exports = router;
