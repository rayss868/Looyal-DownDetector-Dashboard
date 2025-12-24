const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const sequelize = require('./config/database');
const apiRoutes = require('./routes/api');
const startPinger = require('./jobs/pinger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(session({
    secret: 'looyal-secret-key', // In production, use a secure env var
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Authentication Middleware
const requireAuth = (req, res, next) => {
    if (req.session.isAuthenticated) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Login Route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Hardcoded credentials for demo purposes
    if (username === 'admin' && password === 'looyal123') {
        req.session.isAuthenticated = true;
        res.status(200).json({ message: 'Login successful' });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

// Logout Route
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

// Page Routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve Static Files (Public)
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', apiRoutes);

// Database Sync and Server Start
sequelize.sync() // Removed alter: true to prevent potential data loss issues on restart
    .then(async () => {
        console.log('Database synced');
        
        // Check if services exist
        const Service = require('./models/Service');
        const count = await Service.count();
        console.log(`[System] Found ${count} services in database.`);

        // Start the background pinger
        startPinger();
        
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    })
    .catch(err => console.error('Database sync error:', err));