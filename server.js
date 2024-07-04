const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const path = require('path');
const request = require('request');
const passwordHash = require('password-hash');
const session = require('express-session');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public'))); // Ensure static files are served

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore();

app.use(session({
    secret: 'yourSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('home');
});

// Login route
app.post('/loginSubmit', async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).send('Email and password are required.');
        }

        const usersData = await db.collection('users')
            .where('email', '==', email)
            .get();

        let verified = false;
        let user = null;

        usersData.forEach((doc) => {
            if (passwordHash.verify(password, doc.data().password)) {
                verified = true;
                user = doc.data();
            }
        });

        if (verified) {
            // Save user info in session
            req.session.user = user;
            // Redirect to dashboard upon successful login
            res.redirect('/dashboard');
        } else {
            res.send('Login failed...');
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.send('Something went wrong...');
    }
});

// Signup route
app.post('/signupSubmit', async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.send('Passwords do not match. Please try again.');
    }

    try {
        const usersData = await db.collection('users')
            .where('email', '==', email)
            .get();

        if (!usersData.empty) {
            return res.send('SORRY!!! This account already exists...');
        }

        await db.collection('users').add({
            userName: username,
            email: email,
            password: passwordHash.generate(password)
        });

        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    } catch (error) {
        console.error('Error during signup:', error);
        res.send('Something went wrong...');
    }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login.html');
    }

    const { userName: username } = req.session.user;
    const nutrients = req.session.nutrients || [];
    const isFoodHealthy = req.session.isFoodHealthy || false;

    res.render('dashboard', {
        username: username,
        nutrients: nutrients,
        isFoodHealthy: isFoodHealthy
    });
});

// Fetch Nutrition Data Route
app.get('/getNutrition', (req, res) => {
    const food = req.query.food;

    request.get({
        url:`https://api.api-ninjas.com/v1/nutrition?query=${food}`,
        headers: {
            'X-Api-Key': 'Pn0vQimPbXPXVRfrx7Ls1hHJaAQsJufObezT7Kj9'
        },
    }, function(error, response, body) {
        if (error) return res.status(500).json({ error: 'Request failed' });
        else if (response.statusCode != 200) return res.status(response.statusCode).json({ error: 'Error fetching data' });
        else {
            try {
                const nutritionData = JSON.parse(body);
                const nutrients = nutritionData.map(item => ({
                    name: item.name,
                    calories: item.calories,
                    protein: item.protein_g,
                    carbs: item.carbohydrates_total_g,
                    fat: item.fat_total_g
                }));

                const isFoodHealthy = determineHealthiness(nutritionData);

                // Store data in session
                req.session.nutrients = nutrients;
                req.session.isFoodHealthy = isFoodHealthy;

                res.json({
                    nutrients: nutrients,
                    isFoodHealthy: isFoodHealthy
                });
            } catch (error) {
                console.error('Error parsing nutrition data:', error);
                res.status(500).json({ error: 'Error parsing data' });
            }
        }
    });
});

function determineHealthiness(nutritionData) {
    const totalCalories = nutritionData.reduce((sum, item) => sum + item.calories, 0);
    return totalCalories < 500; // Example threshold for healthy food
}

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});