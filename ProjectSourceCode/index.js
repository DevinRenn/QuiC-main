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

app.use((req, res, next) => {
  res.locals.logged_in = req.session.user ? true : false;
  res.locals.username = req.session.user ? req.session.user.username : null;
  next();
});

// Serve static files from resources directory
app.use(express.static(path.join(__dirname, 'src/resources')));

// API Routes
app.get('/', (req, res) => {
  res.redirect('/welcome');
});

app.get('/login', (req, res) => {
  res.render('pages/login');
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
        user_id: user.user_id,
        username: user.username,
      };
      res.redirect('/home');
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send(error.message);
  }

});

app.get('/register', (req, res) => {
  res.render('pages/register');
});

app.post("/register", async (req, res) => {
  const name = req.body.name;

  const username = req.body.username;

  const hash = await bcrypt.hash(req.body.password, 10);

  const query = `INSERT INTO users (name, username, password) VALUES ($1, $2, $3)`;

  try {
    await db.none(query, [name, username, hash]);
    res.redirect('/login');
  }

  catch (err) {
    res.render('pages/register', { message: "Username already exists", error: true });
  }
});

app.get('/profile', async (req, res) => {
  // Get the current user ID from session/auth
  const userId = req.session.user.user_id;

  console.log('Session user_id:', userId);

  const user_query = 'SELECT name, username FROM users WHERE user_id = $1';

  try {    
    // Query the database for user info
    const user = await db.oneOrNone(user_query, [userId]);

    console.log('Query result:', user);

  const userData = {
    user: {
      name: user.name,
      username: user.username
    }};

    // Render the profile page with user data
    res.render('pages/profile', userData);
  }

  catch (error) {
    console.error('Error fetching profile data:', error);
    res.status(500).send('Error loading profile');
  }
});

app.get('/home', (req, res) => {
  res.render('pages/home', {
  is_home: true
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error during logout:', err);
      return res.render('pages/logout', { layout: 'main', is_logout: true }); 
    }
    res.render('pages/logout', { layout: 'main', is_logout: true }); 
  });
});

app.get('/welcome', (req, res) => {
  res.render('pages/welcome');
});


// Fetch all folders
app.get('/folders', async (req, res) => {
  try {
    const folders = await db.any('SELECT folder_id, folder_name FROM folders ORDER BY folder_name');
    res.json({ success: true, folders });
  } catch (err) {
    console.error(err);
    res.json({ success: false, folders: [] });
  }
});

// Create folder
// Create folder
app.post('/create_folder', async (req, res) => {
  const { folder_name } = req.body;

  try {
    // Check if folder already exists
    const exists = await db.oneOrNone(
      'SELECT folder_id FROM folders WHERE folder_name = $1',
      [folder_name]
    );

    if (exists) {
      return res.json({ success: false, message: 'Folder already exists' });
    }

    const result = await db.one(
      'INSERT INTO folders (folder_name) VALUES ($1) RETURNING folder_id, folder_name',
      [folder_name]
    );

    res.json({ success: true, folder: result });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Database error' });
  }
});


// Create set in folder
app.post('/create_set', async (req, res) => {
  const { set_name, set_description, folder_id } = req.body;
  try {
    // Check if a set with the same name exists in the same folder
    const exists = await db.oneOrNone(
      `SELECT s.set_id 
       FROM sets s
       JOIN folders_to_sets fts ON s.set_id = fts.set_id
       WHERE s.set_name = $1 AND fts.folder_id = $2`,
      [set_name, folder_id]
    );

    if (exists) return res.json({ success: false, message: 'Set already exists in this folder' });

    // Insert the new set
    const result = await db.one(
      'INSERT INTO sets (set_name, set_description) VALUES ($1, $2) RETURNING set_id, set_name, set_description',
      [set_name, set_description]
    );

    // Link the set to the folder
    await db.none('INSERT INTO folders_to_sets (folder_id, set_id) VALUES ($1, $2)', [folder_id, result.set_id]);

    res.json({ success: true, set: result });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Database error' });
  }
});


// Fetch sets for a folder
app.get('/folders/:folder_id/sets', async (req, res) => {
  const { folder_id } = req.params;
  try {
    const sets = await db.any(
      `SELECT s.set_id, s.set_name, s.set_description
       FROM sets s
       JOIN folders_to_sets f2s ON s.set_id = f2s.set_id
       WHERE f2s.folder_id = $1
       ORDER BY s.set_name`,
      [folder_id]
    );
    res.json({ success: true, sets });
  } catch (err) {
    console.error(err);
    res.json({ success: false, sets: [] });
  }
});


// Starts Server
module.exports = app.listen(3000);
console.log("Server is listening on port 3000");