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

app.get('/welcome', (req, res) => {
  res.render('pages/welcome');
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
  const first_name = req.body.first_name;
  const last_name = req.body.last_name;

  const username = req.body.username;

  const hash = await bcrypt.hash(req.body.password, 10);

  const query = `INSERT INTO users (first_name, last_name, username, password) VALUES ($1, $2, $3, $4)`;

  try {
    await db.none(query, [first_name, last_name, username, hash]);
    res.redirect('/login');
  }

  catch (err) {
    res.render('pages/register', { message: "Username already exists", error: true });
  }
});

// Authentication Middleware.
const auth = (req, res, next) => {
  if (!req.session.user) {
    // Default to welcome page.
    return res.redirect('/welcome');
  }
  next();
};

// Authentication Required
app.use(auth);
/*
ALL ROUTES BENEATH THIS POINT CAN ONLY BE ACCESSED BY LOGGED IN USERS
*/
app.get('/profile', async (req, res) => {
  const userId = req.session.user.user_id;

  const user_query = 'SELECT first_name, last_name, username FROM users WHERE user_id = $1';

  const folders_query = `SELECT COUNT(f.folder_id) AS folder_count, f.folder_name
                          FROM users_to_folders utf
                          JOIN folders f ON utf.folder_id = f.folder_id
                          WHERE utf.user_id = $1;`;

  const sets_query = `SELECT COUNT(s.set_id) AS set_count, s.set_name, s.set_description
                        FROM folders_to_sets fts
                        JOIN sets s ON fts.set_id = s.set_id
                        JOIN users_to_folders utf ON fts.folder_id = utf.folder_id
                        WHERE utf.user_id = $1;`;

  const cards_query = `SELECT COUNT(c.card_id) AS card_cound
                        FROM sets_to_cards stc
                        JOIN cards c ON stc.card_id = c.card_id
                        JOIN folders_to_sets fts ON stc.set_id = fts.set_id
                        JOIN users_to_folders utf ON fts.folder_id = utf.folder_id
                        WHERE utf.user_id = $1;`;

  try {
    const user = await db.oneOrNone(user_query, [userId]);
    const folders = await db.oneOrNone(folders_query, [userId]);
    const sets = await db.oneOrNone(sets_query, [userId]);
    const cards = await db.oneOrNone(cards_query, [userId]);

    const userData = {
      user: {
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username
      },
      folders: {
        folders_count: folders.folder_count,
        folder_name: folders.folder_name
      },
      sets: {
        sets_count: sets.set_count,
        set_name: sets.set_name,
        set_description: sets.set_description
      },
      cards: {
        cards_count: cards.card_cound
      }
    };
    res.render('pages/profile', userData);
  } catch (error) {
    console.error('Error fetching profile data:', error);
    res.render('pages/login');
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

// Fetch all folders
app.get('/folders', async (req, res) => {
  const userId = req.session.user.user_id;
  try {
    const folders = await db.any(
      `SELECT f.folder_id, f.folder_name
       FROM folders f
       JOIN users_to_folders u2f ON f.folder_id = u2f.folder_id
       WHERE u2f.user_id = $1
       ORDER BY f.folder_name`,
      [userId]
    );
    res.json({ success: true, folders });
  } catch (err) {
    console.error(err);
    res.json({ success: false, folders: [] });
  }
});


// Create folder
app.post('/create_folder', async (req, res) => {
  const { folder_name } = req.body;
  const userId = req.session.user.user_id;

  try {
    // Check if folder already exists for this user
    const exists = await db.oneOrNone(
      `SELECT f.folder_id
       FROM folders f
       JOIN users_to_folders u2f ON f.folder_id = u2f.folder_id
       WHERE f.folder_name = $1 AND u2f.user_id = $2`,
      [folder_name, userId]
    );

    if (exists) {
      return res.json({ success: false, message: 'Folder already exists for this user' });
    }

    // Insert folder
    const folder = await db.one(
      'INSERT INTO folders (folder_name) VALUES ($1) RETURNING folder_id, folder_name',
      [folder_name]
    );

    // Associate folder with user
    await db.none(
      'INSERT INTO users_to_folders (user_id, folder_id) VALUES ($1, $2)',
      [userId, folder.folder_id]
    );

    res.json({ success: true, folder });
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
  const userId = req.session.user.user_id;
  const { folder_id } = req.params;

  try {
    const sets = await db.any(
      `SELECT s.set_id, s.set_name, s.set_description
       FROM sets s
       JOIN folders_to_sets f2s ON s.set_id = f2s.set_id
       JOIN users_to_folders u2f ON f2s.folder_id = u2f.folder_id
       WHERE f2s.folder_id = $1 AND u2f.user_id = $2
       ORDER BY s.set_name`,
      [folder_id, userId]
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