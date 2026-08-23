const {
  PrivilegedEmailError,
  assertPrivilegedEmailAllowed
} = require('./privileged-email');

function renderForbidden(res, message = 'Você não tem permissão para acessar esta página.') {
  return res.status(403).render('error', {
    title: 'Acesso Negado',
    message,
    error: { status: 403 }
  });
}

function redirectToLogin(req, res) {
  if (req.session && typeof req.session.destroy === 'function') {
    return req.session.destroy(() => res.redirect('/login'));
  }

  return res.redirect('/login');
}

function syncSessionUser(req, user) {
  req.session.user = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role
  };
}

function createAuthenticatedMiddleware({ sequelize }) {
  return async (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    try {
      const User = sequelize.models.User;
      const user = await User.findByPk(req.session.user.id, {
        attributes: ['id', 'username', 'fullName', 'email', 'role', 'active']
      });

      if (!user || !user.active) {
        return redirectToLogin(req, res);
      }

      syncSessionUser(req, user);
      assertPrivilegedEmailAllowed({ role: user.role, email: user.email });

      return next();
    } catch (error) {
      if (error instanceof PrivilegedEmailError) {
        return renderForbidden(res, error.message);
      }

      return next(error);
    }
  };
}

module.exports = {
  createAuthenticatedMiddleware,
  renderForbidden
};
