require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');
const { initializeDatabase } = require('./database/db');
const { initializeCA } = require('./services/ca');

// Importação das rotas
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const certificateRoutes = require('./routes/certificates');

// Inicialização do app Express
const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 6723;

// Configuração do mecanismo de visualização
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Middleware para processamento de requisições
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuração da sessão
app.use(session({
  secret: 'zerocert-icp-brasil-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // Será definido como true para requisições HTTPS
    sameSite: 'lax'
  }
}));

// Middleware para ajustar configuração de cookie baseado no protocolo
app.use((req, res, next) => {
  if (req.secure) {
    // Se a requisição for HTTPS, define o cookie como seguro
    req.session.cookie.secure = true;
  }
  next();
});

// Middleware para disponibilizar variáveis globais para as views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Inicialização do banco de dados
initializeDatabase().then(() => {
  console.log('Banco de dados inicializado com sucesso');
  
  // Inicialização da CA (Autoridade Certificadora)
  return initializeCA();
}).then(() => {
  console.log('Autoridade Certificadora (CA) inicializada com sucesso');
  
  // Configuração das rotas
  app.use('/', authRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/certificates', certificateRoutes);
  
  // Rota para a página inicial
  app.get('/', (req, res) => {
    if (req.session.user) {
      return res.redirect('/dashboard');
    }
    res.render('index', { title: 'ZeroCert - Simulador ICP-Brasil' });
  });
  
  // Função para gerar certificado SSL usando OpenSSL
  function generateSSLCertificate() {
    // Obter configurações do arquivo .env
    const sslDir = process.env.SSL_DIRECTORY || 'src/ssl';
    const certPath = path.join(__dirname, '..', sslDir, 'cert.pem');
    const keyPath = path.join(__dirname, '..', sslDir, 'key.pem');
    const daysValid = process.env.SSL_DAYS_VALID || 365;
    const commonName = process.env.SSL_COMMON_NAME || 'localhost';
    const organization = process.env.SSL_ORGANIZATION || 'ZeroCert';
    const organizationalUnit = process.env.SSL_ORGANIZATIONAL_UNIT || 'Dev';
    const country = process.env.SSL_COUNTRY || 'BR';
    const state = process.env.SSL_STATE || 'DF';
    const locality = process.env.SSL_LOCALITY || 'Brasilia';
    const domains = (process.env.SSL_DOMAINS || 'localhost').split(',');
    const ips = (process.env.SSL_IPS || '127.0.0.1').split(',');
    
    // Criar diretório SSL se não existir
    const sslDirPath = path.join(__dirname, '..', sslDir);
    if (!fs.existsSync(sslDirPath)) {
      fs.mkdirSync(sslDirPath, { recursive: true });
    }
    
    // Remover certificados antigos se existirem
    if (fs.existsSync(certPath)) {
      fs.unlinkSync(certPath);
      console.log(`Certificado antigo removido: ${certPath}`);
    }
    
    if (fs.existsSync(keyPath)) {
      fs.unlinkSync(keyPath);
      console.log(`Chave privada antiga removida: ${keyPath}`);
    }
    
    // Construir extensões SAN (Subject Alternative Names)
    let sanExtensions = '';
    domains.forEach(domain => {
      sanExtensions += `DNS:${domain.trim()},`;
    });
    
    ips.forEach(ip => {
      sanExtensions += `IP:${ip.trim()},`;
    });
    
    // Remover a última vírgula
    sanExtensions = sanExtensions.slice(0, -1);
    
    // Comando OpenSSL para gerar certificado
    const opensslCommand = `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days ${daysValid} -nodes -subj "/CN=${commonName}/O=${organization}/OU=${organizationalUnit}/C=${country}/ST=${state}/L=${locality}" -addext "subjectAltName=${sanExtensions}"`;
    
    try {
      console.log('Gerando novo certificado SSL com OpenSSL...');
      execSync(opensslCommand);
      console.log(`Certificado SSL gerado com sucesso em ${certPath}`);
      console.log(`Chave privada gerada com sucesso em ${keyPath}`);
      
      return { certPath, keyPath };
    } catch (error) {
      console.error('Erro ao gerar certificado SSL:', error.message);
      throw error;
    }
  }
  if (require.main === module) {
    // Gerar certificado SSL e iniciar servidores
    try {
      const { certPath, keyPath } = generateSSLCertificate();
      
      // Configurar opções HTTPS
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
      
      // Inicialização do servidor HTTP e HTTPS
      app.listen(HTTP_PORT, () => {
        console.log(`Servidor HTTP rodando na porta ${HTTP_PORT}`);
        console.log(`Acesse: http://localhost:${HTTP_PORT}`);
      });
      
      // Iniciar servidor HTTPS
      https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
        console.log(`Servidor HTTPS rodando na porta ${HTTPS_PORT}`);
        console.log(`Acesse: https://localhost:${HTTPS_PORT}`);
      });
    } catch (error) {
      console.error('Falha ao configurar HTTPS:', error);
      
      // Iniciar apenas o servidor HTTP em caso de falha no HTTPS
      app.listen(HTTP_PORT, () => {
        console.log(`Servidor HTTP rodando na porta ${HTTP_PORT} (HTTPS falhou)`);
        console.log(`Acesse: http://localhost:${HTTP_PORT}`);
      });
    }
  }
}).catch(err => {
  console.error('Erro ao inicializar o aplicativo:', err);
});
