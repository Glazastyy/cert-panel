const express = require('express');
const router = express.Router();
const { sequelize } = require('../database/db');
const { createECPFCertificate, createECNPJCertificate, revokeCertificate } = require('../services/ca');
const { emailService } = require('../services/email');
const fs = require('fs');
const path = require('path');

const isAuthenticated = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

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

const isPrivilegedUser = (user) => user && (user.role === 'admin' || user.role === 'operator');

const dateToDDMMYYYY = (value) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const [year, month, day] = value.split('-');
  return `${day}${month}${year}`;
};

const getTargetUserId = (req) => {
  if (isPrivilegedUser(req.session.user)) {
    return req.body.userId;
  }

  return req.session.user.id;
};

router.get('/request/ecpf', isAuthenticated, (req, res) => {
  res.render('certificates/request-ecpf', {
    title: 'Solicitar Certificado e-CPF - ZeroCert ICP-Brasil'
  });
});

router.post('/request/ecpf', isAuthenticated, async (req, res) => {
  try {
    const CertificateRequest = sequelize.models.CertificateRequest;
    const { name, cpf, birthDate, socialSecurity, email, state, city } = req.body;

    await CertificateRequest.create({
      type: 'e-CPF',
      status: 'pending',
      payload: {
        name,
        cpf,
        birthDate,
        socialSecurity,
        email,
        state,
        city
      },
      userId: req.session.user.id
    });

    await emailService.sendNotification({
      to: req.session.user.email,
      subject: 'Solicitação de certificado recebida',
      message: `Olá, ${req.session.user.fullName}.\n\nRecebemos sua solicitação de certificado e-CPF. Ela será analisada pela administração do ZeroCert.`
    });

    req.session.flashMessage = {
      type: 'success',
      text: 'Solicitação de certificado e-CPF enviada para aprovação'
    };

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Erro ao solicitar certificado e-CPF:', error);
    res.render('certificates/request-ecpf', {
      title: 'Solicitar Certificado e-CPF - ZeroCert ICP-Brasil',
      error: 'Ocorreu um erro ao enviar a solicitação. Tente novamente mais tarde.',
      formData: req.body
    });
  }
});

router.get('/request/ecnpj', isAuthenticated, (req, res) => {
  res.render('certificates/request-ecnpj', {
    title: 'Solicitar Certificado e-CNPJ - ZeroCert ICP-Brasil'
  });
});

router.post('/request/ecnpj', isAuthenticated, async (req, res) => {
  try {
    const CertificateRequest = sequelize.models.CertificateRequest;
    const {
      companyName,
      cnpj,
      tradeName,
      responsibleName,
      responsibleCpf,
      responsiblePosition,
      responsibleBirthDate,
      email,
      state,
      city
    } = req.body;

    await CertificateRequest.create({
      type: 'e-CNPJ',
      status: 'pending',
      payload: {
        companyName,
        cnpj,
        tradeName,
        responsibleName,
        responsibleCpf,
        responsiblePosition,
        responsibleBirthDate,
        email,
        state,
        city
      },
      userId: req.session.user.id
    });

    await emailService.sendNotification({
      to: req.session.user.email,
      subject: 'Solicitação de certificado recebida',
      message: `Olá, ${req.session.user.fullName}.\n\nRecebemos sua solicitação de certificado e-CNPJ. Ela será analisada pela administração do ZeroCert.`
    });

    req.session.flashMessage = {
      type: 'success',
      text: 'Solicitação de certificado e-CNPJ enviada para aprovação'
    };

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Erro ao solicitar certificado e-CNPJ:', error);
    res.render('certificates/request-ecnpj', {
      title: 'Solicitar Certificado e-CNPJ - ZeroCert ICP-Brasil',
      error: 'Ocorreu um erro ao enviar a solicitação. Tente novamente mais tarde.',
      formData: req.body
    });
  }
});

router.get('/issue/ecpf', isAuthenticated, isAdminOrOperator, (req, res) => {
  res.render('certificates/issue-ecpf', {
    title: 'Emitir Certificado e-CPF - ZeroCert ICP-Brasil'
  });
});

// Rota para processar a emissão de certificado e-CPF
router.post('/issue/ecpf', isAuthenticated, isAdminOrOperator, async (req, res) => {
  try {
    const {
      name,
      cpf,
      birthDate,
      socialSecurity,
      email,
      state,
      city,
      p12Password,
      confirmP12Password,
    } = req.body;
    const targetUserId = getTargetUserId(req);
    
    // Validar os dados
    if (p12Password !== confirmP12Password) {
      return res.render('certificates/issue-ecpf', {
        title: 'Emitir Certificado e-CPF - ZeroCert ICP-Brasil',
        error: 'As senhas do certificado não coincidem',
        formData: req.body
      });
    }
    
    // Verificar se o usuário existe
    const User = sequelize.models.User;
    const user = await User.findByPk(targetUserId);
    
    if (!user) {
      return res.render('certificates/issue-ecpf', {
        title: 'Emitir Certificado e-CPF - ZeroCert ICP-Brasil',
        error: 'Usuário não encontrado',
        formData: req.body
      });
    }
    
    // Criar o certificado e-CPF
    const certificate = await createECPFCertificate({
      name,
      cpf,
      birthDate: dateToDDMMYYYY(birthDate),
      socialSecurity,
      email,
      state,
      city,
      p12Password,
      userId: targetUserId
    });
    
    // Redirecionar para a página de detalhes do certificado
    req.session.flashMessage = {
      type: 'success',
      text: 'Certificado e-CPF emitido com sucesso'
    };
    
    res.redirect(`/certificates/view/${certificate.id}`);
  } catch (error) {
    console.error('Erro ao emitir certificado e-CPF:', error);
    res.render('certificates/issue-ecpf', {
      title: 'Emitir Certificado e-CPF - ZeroCert ICP-Brasil',
      error: 'Ocorreu um erro ao emitir o certificado. Tente novamente mais tarde.',
      formData: req.body
    });
  }
});

// Rota para a página de emissão de certificado e-CNPJ
router.get('/issue/ecnpj', isAuthenticated, isAdminOrOperator, (req, res) => {
  res.render('certificates/issue-ecnpj', {
    title: 'Emitir Certificado e-CNPJ - ZeroCert ICP-Brasil'
  });
});

// Rota para processar a emissão de certificado e-CNPJ
router.post('/issue/ecnpj', isAuthenticated, isAdminOrOperator, async (req, res) => {
  try {
    const {
      companyName,
      cnpj,
      responsibleName,
      responsibleCpf, // Alterado de responsibleCPF para responsibleCpf para corresponder ao nome do campo no formulário
      email,
      state,
      city,
      p12Password,
      confirmP12Password,
    } = req.body;
    const targetUserId = getTargetUserId(req);
    
    // Validar os dados
    if (p12Password !== confirmP12Password) {
      return res.render('certificates/issue-ecnpj', {
        title: 'Emitir Certificado e-CNPJ - ZeroCert ICP-Brasil',
        error: 'As senhas do certificado não coincidem',
        formData: req.body
      });
    }
    
    // Verificar se o usuário existe
    const User = sequelize.models.User;
    const user = await User.findByPk(targetUserId);
    
    if (!user) {
      return res.render('certificates/issue-ecnpj', {
        title: 'Emitir Certificado e-CNPJ - ZeroCert ICP-Brasil',
        error: 'Usuário não encontrado',
        formData: req.body
      });
    }
    
    // Criar o certificado e-CNPJ
    const certificate = await createECNPJCertificate({
      companyName,
      cnpj,
      responsibleName,
      responsibleCPF: responsibleCpf, // Corrigido para passar o valor com o nome correto esperado pela função
      email,
      state,
      city,
      p12Password,
      userId: targetUserId
    });
    
    // Redirecionar para a página de detalhes do certificado
    req.session.flashMessage = {
      type: 'success',
      text: 'Certificado e-CNPJ emitido com sucesso'
    };
    
    res.redirect(`/certificates/view/${certificate.id}`);
  } catch (error) {
    console.error('Erro ao emitir certificado e-CNPJ:', error);
    res.render('certificates/issue-ecnpj', {
      title: 'Emitir Certificado e-CNPJ - ZeroCert ICP-Brasil',
      error: 'Ocorreu um erro ao emitir o certificado. Tente novamente mais tarde.',
      formData: req.body
    });
  }
});

// Rota para visualizar detalhes de um certificado
router.get('/view/:id', isAuthenticated, async (req, res) => {
  try {
    const Certificate = sequelize.models.Certificate;
    const User = sequelize.models.User;
    const CertificateAuthority = sequelize.models.CertificateAuthority;
    
    // Buscar o certificado pelo ID
    const certificate = await Certificate.findByPk(req.params.id, {
      include: [
        {
          model: User,
          attributes: ['username', 'fullName', 'email']
        },
        {
          model: CertificateAuthority,
          attributes: ['name', 'commonName']
        }
      ]
    });
    
    if (!certificate) {
      req.session.flashMessage = {
        type: 'error',
        text: 'Certificado não encontrado'
      };
      return res.redirect('/dashboard');
    }
    
    // Verificar se o usuário tem permissão para visualizar o certificado
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'operator' && certificate.userId !== req.session.user.id) {
      return res.status(403).render('error', {
        title: 'Acesso Negado',
        message: 'Você não tem permissão para visualizar este certificado.',
        error: { status: 403 }
      });
    }
    
    res.render('certificates/view', {
      title: `Certificado ${certificate.type} - ZeroCert ICP-Brasil`,
      certificate,
      ca: certificate.CertificateAuthority,
      user: certificate.User
    });
  } catch (error) {
    console.error('Erro ao visualizar certificado:', error);
    res.status(500).render('error', {
      title: 'Erro',
      message: 'Ocorreu um erro ao visualizar o certificado.',
      error: { status: 500 }
    });
  }
});

// Rota para baixar o certificado em formato PEM
router.get('/download/pem/:id', isAuthenticated, async (req, res) => {
  try {
    const Certificate = sequelize.models.Certificate;
    
    // Buscar o certificado pelo ID
    const certificate = await Certificate.findByPk(req.params.id);
    
    if (!certificate) {
      return res.status(404).render('error', {
        title: 'Erro',
        message: 'Certificado não encontrado.',
        error: { status: 404 }
      });
    }
    
    // Verificar se o usuário tem permissão para baixar o certificado
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'operator' && certificate.userId !== req.session.user.id) {
      return res.status(403).render('error', {
        title: 'Acesso Negado',
        message: 'Você não tem permissão para baixar este certificado.',
        error: { status: 403 }
      });
    }
    
    // Definir o nome do arquivo
    let filename;
    if (certificate.type === 'e-CPF') {
      filename = `ecpf_${certificate.subject.cpf}.pem`;
    } else {
      filename = `ecnpj_${certificate.subject.cnpj}.pem`;
    }
    
    // Configurar os cabeçalhos da resposta
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Enviar o certificado
    res.send(certificate.certificate);
  } catch (error) {
    console.error('Erro ao baixar certificado PEM:', error);
    res.status(500).render('error', {
      title: 'Erro',
      message: 'Ocorreu um erro ao baixar o certificado.',
      error: { status: 500 }
    });
  }
});

// Rota para baixar o certificado em formato P12
router.get('/download/p12/:id', isAuthenticated, async (req, res) => {
  try {
    const Certificate = sequelize.models.Certificate;
    
    // Buscar o certificado pelo ID
    const certificate = await Certificate.findByPk(req.params.id);
    
    if (!certificate) {
      return res.status(404).render('error', {
        title: 'Erro',
        message: 'Certificado não encontrado.',
        error: { status: 404 }
      });
    }
    
    // Verificar se o usuário tem permissão para baixar o certificado
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'operator' && certificate.userId !== req.session.user.id) {
      return res.status(403).render('error', {
        title: 'Acesso Negado',
        message: 'Você não tem permissão para baixar este certificado.',
        error: { status: 403 }
      });
    }
    
    // Verificar se o certificado tem o arquivo P12
    if (!certificate.p12) {
      return res.status(404).render('error', {
        title: 'Erro',
        message: 'Arquivo P12 não encontrado para este certificado.',
        error: { status: 404 }
      });
    }
    
    // Definir o nome do arquivo
    let filename;
    if (certificate.type === 'e-CPF') {
      filename = `ecpf_${certificate.subject.cpf}.p12`;
    } else {
      filename = `ecnpj_${certificate.subject.cnpj}.p12`;
    }
    
    // Configurar os cabeçalhos da resposta
    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Enviar o arquivo P12
    res.send(certificate.p12);
  } catch (error) {
    console.error('Erro ao baixar certificado P12:', error);
    res.status(500).render('error', {
      title: 'Erro',
      message: 'Ocorreu um erro ao baixar o certificado.',
      error: { status: 500 }
    });
  }
});

// Rota para revogar um certificado
router.post('/revoke/:id', isAuthenticated, isAdminOrOperator, async (req, res) => {
  try {
    const { reason } = req.body;
    const Certificate = sequelize.models.Certificate;
    
    // Buscar o certificado pelo ID
    const certificate = await Certificate.findByPk(req.params.id);
    
    if (!certificate) {
      req.session.flashMessage = {
        type: 'error',
        text: 'Certificado não encontrado'
      };
      return res.redirect('/dashboard/certificates');
    }
    
    // Verificar se o certificado já está revogado
    if (certificate.revoked) {
      req.session.flashMessage = {
        type: 'error',
        text: 'Certificado já está revogado'
      };
      return res.redirect(`/certificates/view/${certificate.id}`);
    }
    
    // Revogar o certificado
    await revokeCertificate(certificate.serialNumber, reason);
    
    req.session.flashMessage = {
      type: 'success',
      text: 'Certificado revogado com sucesso'
    };
    
    res.redirect(`/certificates/view/${certificate.id}`);
  } catch (error) {
    console.error('Erro ao revogar certificado:', error);
    req.session.flashMessage = {
      type: 'error',
      text: 'Ocorreu um erro ao revogar o certificado'
    };
    res.redirect(`/certificates/view/${req.params.id}`);
  }
});

// Rota para listar usuários para seleção ao emitir certificado
router.get('/users', isAuthenticated, isAdminOrOperator, async (req, res) => {
  try {
    const User = sequelize.models.User;
    
    const users = await User.findAll({
      attributes: ['id', 'username', 'fullName', 'email'],
      where: { active: true },
      order: [['fullName', 'ASC']]
    });
    
    res.json(users);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// Rota para a página de validação de certificados
router.get('/validate', (req, res) => {
  res.render('certificates/validate', {
    title: 'Validar Certificado - ZeroCert ICP-Brasil'
  });
});

// Rota para processar a validação de certificados
router.post('/validate', async (req, res) => {
  try {
    const { serialNumber } = req.body;
    const Certificate = sequelize.models.Certificate;
    const CertificateAuthority = sequelize.models.CertificateAuthority;
    
    // Buscar o certificado pelo número de série
    const certificate = await Certificate.findOne({
      where: { serialNumber },
      include: [{
        model: CertificateAuthority,
        attributes: ['name', 'commonName']
      }]
    });
    
    if (!certificate) {
      return res.render('certificates/validate', {
        title: 'Validar Certificado - ZeroCert ICP-Brasil',
        error: 'Certificado não encontrado',
        serialNumber
      });
    }
    
    // Verificar se o certificado está válido
    const now = new Date();
    const isValid = !certificate.revoked && now >= certificate.validFrom && now <= certificate.validTo;
    
    let status, message;
    
    if (isValid) {
      status = 'valid';
      message = 'Certificado válido';
    } else if (certificate.revoked) {
      status = 'revoked';
      message = `Certificado revogado em ${certificate.revokedAt.toLocaleDateString('pt-BR')} por: ${certificate.revokedReason}`;
    } else if (now < certificate.validFrom) {
      status = 'not-yet-valid';
      message = `Certificado ainda não é válido. Válido a partir de ${certificate.validFrom.toLocaleDateString('pt-BR')}`;
    } else {
      status = 'expired';
      message = `Certificado expirado. Validade até ${certificate.validTo.toLocaleDateString('pt-BR')}`;
    }
    
    res.render('certificates/validate-result', {
      title: 'Resultado da Validação - ZeroCert ICP-Brasil',
      certificate,
      status,
      message
    });
  } catch (error) {
    console.error('Erro ao validar certificado:', error);
    res.render('certificates/validate', {
      title: 'Validar Certificado - ZeroCert ICP-Brasil',
      error: 'Ocorreu um erro ao validar o certificado. Tente novamente mais tarde.',
      serialNumber: req.body.serialNumber
    });
  }
});

module.exports = router;
