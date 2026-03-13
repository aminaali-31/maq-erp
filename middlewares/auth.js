exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/auth/login");
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

exports.isCustomer = (req, res, next) => {

    if (!req.session.user) {
        return res.redirect("/auth/login");
    }

    if (!req.session.user.customer_id) {
        return res.redirect("/auth/login");
    }

    next();
};