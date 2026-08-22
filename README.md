# ZeroCert - Simulador de ICP-Brasil para Testes

O ZeroCert é um sistema que simula a Infraestrutura de Chaves Públicas Brasileira (ICP-Brasil) para emissão de certificados digitais em ambiente de teste. Este projeto permite a criação e gerenciamento de certificados digitais no padrão ICP-Brasil, como e-CPF e e-CNPJ, para fins de desenvolvimento e testes.

## Características

- Criação e gerenciamento de Autoridades Certificadoras (AC)
- Emissão de certificados e-CPF e e-CNPJ seguindo as normas da ICP-Brasil
- Interface web estilizada para parecer sistemas legados
- Validação de certificados por número de série
- Revogação de certificados
- Download de certificados nos formatos PEM e PKCS#12 (P12)
- Banco de dados SQLite para armazenamento
- Suporte a HTTPS com certificados SSL autoassinados

## Requisitos

- Bun 1.x ou superior
- OpenSSL (para geração de certificados SSL)

## Instalação

1. Clone o repositório:
   ```
   git clone https://github.com/RibasSu/cert-panel.git
   cd cert-panel
   ```

2. Instale as dependências:
   ```
   bun install
   ```

3. Configure as variáveis de ambiente:
   Crie um arquivo `.env` na raiz do projeto com as seguintes configurações:
   ```
   # Configurações do Certificado SSL
   SSL_COMMON_NAME=localhost
   SSL_ORGANIZATION=ZeroCert Certificados e Identidade Digital
   SSL_ORGANIZATIONAL_UNIT=Desenvolvimento
   SSL_COUNTRY=BR
   SSL_STATE=DF
   SSL_LOCALITY=Brasilia
   SSL_DAYS_VALID=365
   SSL_DIRECTORY=src/ssl
   SSL_DOMAINS=localhost
   SSL_IPS=127.0.0.1
   HTTP_PORT=3000
   HTTPS_PORT=3443
   
   # Configurações da Aplicação (opcionais)
   # SESSION_SECRET=sua_chave_secreta_para_sessoes
   # DB_PATH=src/data/database.sqlite
   ```
   
   **Importante**: Certifique-se de que o diretório especificado em `SSL_DIRECTORY` existe e tem permissões de escrita. O sistema irá gerar automaticamente os certificados SSL necessários para HTTPS neste diretório.

4. Inicie o servidor:
   ```
   bun run start
   ```

5. Acesse a aplicação em seu navegador:
   ```
   http://localhost:3000   # Acesso HTTP
   https://localhost:3443  # Acesso HTTPS (certificado autoassinado)
   ```
   
   **Nota**: Ao acessar via HTTPS, seu navegador poderá exibir um aviso de segurança devido ao certificado autoassinado. Isso é esperado em ambiente de desenvolvimento.

## Estrutura do Projeto

```
├── src/
│   ├── data/            # Local de armazenamento do banco de dados
│   ├── database/        # Configuração do banco de dados
│   ├── models/          # Modelos de dados
│   ├── public/          # Arquivos estáticos (CSS, JS, imagens)
│   ├── routes/          # Rotas da aplicação
│   ├── services/        # Serviços de negócio
│   ├── ssl/             # Certificados SSL gerados
│   ├── views/           # Templates Pug
│   └── index.js         # Ponto de entrada da aplicação
├── .env                 # Variáveis de ambiente
├── package.json
└── README.md
```

## Uso

### Primeiro Acesso

Ao iniciar a aplicação pela primeira vez, um usuário administrador padrão será criado:

- **Usuário**: admin
- **Senha**: admin123

Recomenda-se alterar a senha após o primeiro login.

### Emissão de Certificados

1. Faça login no sistema
2. Acesse o menu "Certificados" e selecione "Emitir e-CPF" ou "Emitir e-CNPJ"
3. Preencha os dados solicitados
4. Defina uma senha para o certificado
5. Clique em "Emitir Certificado"

### Validação de Certificados

1. Acesse o menu "Certificados" e selecione "Validar Certificado"
2. Insira o número de série do certificado
3. Clique em "Validar"

## Segurança

**IMPORTANTE**: Este sistema é destinado APENAS para fins de teste e desenvolvimento. Os certificados emitidos NÃO são reconhecidos oficialmente e NÃO devem ser utilizados em ambientes de produção.

## Tecnologias Utilizadas

- **Backend**: Node.js, Express
- **Frontend**: Bootstrap, Pug
- **Banco de Dados**: SQLite
- **Criptografia**: node-forge, OpenSSL
- **Ambiente**: dotenv para configuração de variáveis de ambiente

## Solução de Problemas

### Erro no CPF do Responsável (e-CNPJ)

Se você encontrar o erro `TypeError: Cannot read properties of undefined (reading 'padStart')` ao emitir um certificado e-CNPJ, verifique se o campo "CPF" do responsável legal está preenchido corretamente. Este erro geralmente ocorre devido a uma incompatibilidade entre o nome do campo no formulário (`responsibleCpf`) e o nome esperado pelo backend (`responsibleCPF`).

### Problemas com Certificados SSL

Se encontrar problemas com os certificados SSL:

1. Verifique se o OpenSSL está instalado e acessível no seu sistema
2. Certifique-se de que a pasta `src/ssl` existe e tem permissões de escrita
3. Verifique as configurações no arquivo `.env`
4. Se os certificados não estiverem sendo gerados, verifique os logs do servidor para identificar possíveis erros
5. Certifique-se de que as portas especificadas para HTTP e HTTPS não estão sendo utilizadas por outros serviços

## Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo LICENSE para detalhes.

## Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou enviar pull requests.

## Contato

Para dúvidas ou sugestões, entre em contato através de [contato@zerocert.com.br].
