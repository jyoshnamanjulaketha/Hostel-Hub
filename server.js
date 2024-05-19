const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const otpGenerator = require('otp-generator');
const path = require('path');
const sqlite3 = require('sqlite3').verbose(); // Import SQLite

const app = express();
const server = require('http').Server(app); // Require 'http' module for Socket.io
const io = require('socket.io')(server); // Initialize Socket.io

const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: '22b01a4542@svecw.edu.in',
        pass: 'SVECW@2022'
    }
});

let storedOTP = '';
let otpTimestamp = 0;

// Open SQLite database connection
const db = new sqlite3.Database('messages.db');

// Create tables if they do not exist
db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS academic_request_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, sender TEXT, timestamp INTEGER)');
    db.run('CREATE TABLE IF NOT EXISTS emergency_request_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, sender TEXT, timestamp INTEGER)');
    db.run('CREATE TABLE IF NOT EXISTS necessary_things_request_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, sender TEXT, timestamp INTEGER)');
    db.run('CREATE TABLE IF NOT EXISTS food_menu_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, sender TEXT, timestamp INTEGER)');
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'loginemail.html'));
});

// Handle incorrect email format
app.post('/send-otp', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).sendFile(path.join(__dirname, 'public', 'invalid_email.html'));    
}

    if (!email.includes('b0') || !email.endsWith('@svecw.edu.in')) {
        return res.status(400).sendFile(path.join(__dirname, 'public', 'invalid_email.html'));
    }

    // Generate and send OTP
    const currentTime = Date.now();
    if (currentTime - otpTimestamp < 60000) {
        return res.status(400).send('Error: Please wait before requesting a new OTP');
    }

    storedOTP = otpGenerator.generate(6, { digits: true, alphabets: false, upperCase: false, specialChars: false });
    otpTimestamp = currentTime;

    transporter.sendMail({
        from: '22b01a4542@svecw.edu.in',
        to: email,
        subject: 'OTP for Login',
        text: `Your OTP to login into Hostel Hub is: ${storedOTP}`
    }, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error: Unable to send OTP');
        } else {
            console.log('Email sent: ' + info.response);
            res.redirect('/otp.html');
        }
    });
});

// Handle incorrect OTP or expired OTP
app.post('/verify-otp', (req, res) => {
    const { otp } = req.body;

    const currentTime = Date.now();
    if (currentTime - otpTimestamp > 120000) {
        return res.status(400).send('Error: OTP has expired');
    }

    if (otp !== storedOTP) {
        return res.status(401).redirect('/invalid_otp.html');
    }

    // If OTP is correct, redirect to home page
    res.redirect('/home.html');
});

// Socket.io connection for real-time chat
io.on('connection', socket => {
    console.log('A user connected');

    socket.on('fetch_messages', page => {
        if (page === 'academic_request') {
            db.all('SELECT * FROM academic_request_messages', (err, rows) => {
                if (err) {
                    console.error('Error fetching academic request messages from database:', err);
                    return;
                }
                rows.forEach(row => {
                    socket.emit('academic_chat_message', { content: row.content, sender: row.sender });
                });
            });
        } else if (page === 'emergency_request') {
            db.all('SELECT * FROM emergency_request_messages', (err, rows) => {
                if (err) {
                    console.error('Error fetching emergency request messages from database:', err);
                    return;
                }
                rows.forEach(row => {
                    socket.emit('emergency_chat_message', { content: row.content, sender: row.sender });
                });
            });
        } else if (page === 'necessary_things_request') {
            db.all('SELECT * FROM necessary_things_request_messages', (err, rows) => {
                if (err) {
                    console.error('Error fetching necessary things request messages from database:', err);
                    return;
                }
                rows.forEach(row => {
                    socket.emit('necessary_chat_message', { content: row.content, sender: row.sender });
                });
            });
        } else if (page === 'food_menu') {
            db.all('SELECT * FROM food_menu_messages', (err, rows) => {
                if (err) {
                    console.error('Error fetching food menu messages from database:', err);
                    return;
                }
                rows.forEach(row => {
                    socket.emit('food_menu_message', { content: row.content, sender: row.sender });
                });
            });
        }
    });

    // Handle incoming messages for academic request
    socket.on('academic_request', (msg,userEmail) => {
        const timestamp = Date.now();
const fullMessage = `${userEmail}: ${msg.content}`;
        db.run('INSERT INTO academic_request_messages (content, sender, timestamp) VALUES (?, ?, ?)', [msg.content, userEmail, timestamp], err => {
            if (err) {
                console.error('Error saving academic request message to database:', err);
                return;
            }
            io.emit('academic_chat_message', { content:fullMessage , sender: userEmail });
        });
    });

    // Handle incoming messages for emergency request
    socket.on('emergency_request', msg => {
        const timestamp = Date.now();
        db.run('INSERT INTO emergency_request_messages (content, sender, timestamp) VALUES (?, ?, ?)', [msg.content, msg.sender, timestamp], err => {
            if (err) {
                console.error('Error saving emergency request message to database:', err);
                return;
            }
            io.emit('emergency_chat_message', { content: msg.content, sender: msg.sender });
        });
    });

    // Handle incoming messages for necessary things request
    socket.on('necessary_things_request', msg => {
        const timestamp = Date.now();
        db.run('INSERT INTO necessary_things_request_messages (content, sender, timestamp) VALUES (?, ?, ?)', [msg.content, msg.sender, timestamp], err => {
            if (err) {
                console.error('Error saving necessary things request message to database:', err);
                return;
            }
            io.emit('necessary_chat_message', { content: msg.content, sender: msg.sender });
        });
    });

    // Handle incoming messages for food menu
    socket.on('food_menu', msg => {
        const timestamp = Date.now();
        db.run('INSERT INTO food_menu_messages (content, sender, timestamp) VALUES (?, ?, ?)', [msg.content, msg.sender, timestamp], err => {
            if (err) {
                console.error('Error saving food menu message to database:', err);
                return;
            }
            io.emit('food_menu_message', { content: msg.content, sender: msg.sender });
        });
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

