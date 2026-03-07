const authenticateAndAuthorize = (allowedRoles = []) => {
    return (req, res, next) => {
        try {
            // Check if user is logged in
            if (!req.session || !req.session.user) {
                // Redirect to login page
                return res.redirect('/auth/login');
            }

            const user = req.session.user; // assume session stores { id, username, role_id }

            // Check if user has allowed role
            if (allowedRoles.length && !allowedRoles.includes(user.role_id)) {
                // Optional: redirect to "not authorized" page
                return res.status(403).send('Forbidden: You do not have access');
            }

            // Attach user info to request
            req.user = user;

            next();
        } catch (err) {
            console.error("Auth error:", err);
            return res.status(500).send('Server error');
        }
    };
};

module.exports = authenticateAndAuthorize;