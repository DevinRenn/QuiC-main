// Import Dependencies
const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios'); // To make HTTP requests from our server.


// Connect to Database
// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/src/views/layouts',
  partialsDir: __dirname + '/src/views/partials',
});

// database configuration
const dbConfig = {
  host: 'db', // the database server
  port: 5432, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

// test the database
db.connect()
  .then(obj => {
    console.log('Database connection successful'); // you can view this message in the docker compose logs
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });


// App settings
// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.

// initialize session variables
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
  })
);

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);


// API Routes
app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('pages/login', { layout: 'main' });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [
      username,
    ]);
    if (!user) {
      return res.render('pages/login', {
        layout: 'main',
        message: 'Username does not exist or incorrect, please either register or try again.',
        error: true,
      });
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.render('pages/login', {
        layout: 'main',
        message: 'Incorrect password, please try again.',
        error: true,
      });
    }
    if (passwordMatch) {
      req.session.user = {
        id: user.id,
        username: user.username,
      };
      res.redirect('/discover');
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send(error.message);
  }

});

app.get('/register', (req, res) => {
  res.render('pages/register');
});

app.get('/profile', (req, res) => {
  res.render('pages/profile');
});

app.get('/home', (req, res) => {
  res.render('pages/home');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.render('pages/logout');
});

// Starts Server
app.listen(3000);
console.log("Server is listening on port 3000");