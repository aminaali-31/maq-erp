exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
};

exports.isCeo = (req, res, next) => {
    if (req.session.user.role_id !== 1) {
        return res.status(403).send("Forbidden");
    }
    next();
};
exports.isAuthenticated = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/auth/login");
  }
  next();
};