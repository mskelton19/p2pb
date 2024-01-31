const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
// const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const ejs = require('ejs'); // Require EJS
const {v4: uuidv4} = require('uuid');
const { MongoClient } = require('mongodb');
require('dotenv').config();
const mongoUri = process.env.MONGO_URI; // Make sure to add MONGO_URI in your .env file

// Create a new MongoClient
const mongoClient = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

async function connectToMongoDB() {
  try {
    await mongoClient.connect();
    console.log("Connected successfully to MongoDB");
  } catch (error) {
    console.error("Failed to connect to MongoDB", error);
  }
}

connectToMongoDB();

const db = mongoClient.db("Bets");
const wagersCollection = db.collection("openWagers");

process.on('SIGINT', async () => {
  await mongoClient.close();
  process.exit(0);
});

let savedEventData = [];

// const {showDrawer} = require('/public')

const app = express();
const port = 3000;

const apiKey = process.env.BET365_API_KEY; // Replace with your Bet365 API key
const apiUrl = 'https://api.b365api.com/v1/bet365';

const bet365ApiOptions = {
  headers: {
    'Content-Type': 'application/json',
    'Api-Key': apiKey,
  },
};

const usersFile = 'users.json';

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configure session middleware
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

passport.use(new LocalStrategy(
  function(username, password, done) {
    // Your authentication logic here
    if (username === 'user' && password === 'password') {
      return done(null, { id: 'user_id' });
    } else {
      return done(null, false, { message: 'Incorrect username or password' });
    }
  }
));

app.use(passport.initialize());
app.use(passport.session());

// 3. User Identification
// After successful authentication, store user information in the session
passport.serializeUser((user, done) => {
  done(null, {id: user.id, username: user.username, group: user.group}); // Use a unique identifier for serialization (e.g., user.id)
});

// Later in your deserializeUser function, you can access 'usersData'
passport.deserializeUser((id, done) => {
  // Find the user by ID from your array of users
  const usersData = getUsersDataFromJson(); // Replace with your logic
  const user = usersData.find(u => u.id === id.id && u.username === id.username);

  if (user) {
    done(null, user);
  } else {
    done(new Error('User not found'), null);
  }
});

function getUsersDataFromJson() {
  // Read user data from 'users.json' and return as an array
  try {
    const userData = fs.readFileSync(usersFile, 'utf8');
    const users = JSON.parse(userData);
    return users;
  } catch (error) {
    console.error('Error reading users data from file:', error);
    return [];
  }
}

// Handle user login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Read user data from 'users.json' and return as an array
  const usersData = getUsersDataFromJson(); // Replace with your logic
  const user = usersData.find(u => u.username === username && u.password === password);

  if (user) {
    // Simulate a successful login
    req.login(user, (err) => {
      if (err) {
        console.error('Error during login:', err);
        return res.redirect('/login');
      }
      console.log('successful login')
      return res.redirect('/games');
    });
  } else {
    // Simulate a failed login
    res.redirect('/login');
  }
});


// Route to serve the HTML file
app.get('/games', (req, res) => {
  if (req.session.passport && req.session.passport.user) {
    const user = req.session.passport.user;
    res.render('games', { user: user });
  } else {
    res.redirect('/login');
  }
});

app.get('/upcoming-events', async (req, res) => {
  const sportID = req.query.sportID;
  const leagueID = req.query.leagueID;

  try {
    // Start with the base URL
    let fullApiUrl = apiUrl + '/upcoming';

    // Initialize an array to hold query parameters
    let queryParams = [];

    // Add sport_id and league_id to the query parameters if they exist
    if (sportID) {
      queryParams.push(`sport_id=${sportID}`);
    }
    if (leagueID) {
      queryParams.push(`league_id=${leagueID}`);
    }

    // Add the token to the query parameters
    queryParams.push(`token=${apiKey}`);

    // Join all query parameters with '&' and append to the apiUrl
    fullApiUrl += `?${queryParams.join('&')}`;

    const response = await axios.get(fullApiUrl, bet365ApiOptions);
    const responseData = response.data;

    res.json(responseData);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



app.get('/bet365-eventodds/:eventId', async (req, res) => {

  const eventId = req.params.eventId;
  const apiUrl = `https://api.b365api.com/v3/bet365/prematch?token=${apiKey}&FI=${eventId}`;

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: 'Basic YOUR_BASE64_ENCODED_API_KEY',
      },
    });

    // console.log('Bet365 API Response:', response.data.results[0].main.sp.game_lines.odds[0].handicap);

    if (!response.data.success) {
      throw new Error(`Error: ${response.data.error}`);
    }

    // console.log('response data ' + response.data.results[0].main.sp.game_lines.odds[0])

    const oddsData = response.data.results[0].main.sp.game_lines.odds[0];
    res.json(oddsData);
  } catch (error) {
    console.error(`Error fetching event odds for event ID ${eventId}:`, error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Declare wagers as a global array
const wagers = [];

// Route to handle wagers
app.post('/place-wager', express.json(), (req, res) => {
  const { teamName, openTeam, takenOdds, openOdds, wager, eventTime, firstUser, group, sportId, eventId } = req.body;

  // console.log('odds: ' + odds)

  // Save the wager to the in-memory database
  const newWager = {
    teamName,
    openTeam,
    takenOdds,
    openOdds,
    wager,
    eventTime,
    firstUser,
    group,
    sportId,
    eventId,
  };

  wagers.push(newWager);

  res.json({
    success: true,
    wager: newWager,
  });
});

// Route to handle wagers
app.post('/place-wager-2', express.json(), (req, res) => {
  const { teamName, openTeam, takenOdds, openOdds, wager, eventTime, firstUser, group, sportId, eventId } = req.body;

  const newWager = {
    teamName,
    openTeam,
    takenOdds,
    openOdds,
    wager,
    eventTime,
    firstUser,
    group,
    sportId,
    eventId,
  };

  wagersCollection.insertOne(newWager)
    .then(result => {
      res.json({ success: true, wager: newWager });
    })
    .catch(error => {
      console.error('Error saving wager:', error);
      res.status(500).send('Error saving wager');
    });
});


// Function to get wagers from the in-memory array
function getWagersFromDataSource() {
  // console.log('Server: ' + wagers)
  return wagers;
}

// // Example usage in a route handler
// app.get('/get-wagers', (req, res) => {
//   try {
//     const wagersData = getWagersFromDataSource();
//     res.json({ success: true, wagers: wagersData });
//   } catch (error) {
//     console.error('Error fetching wagers:', error.message);
//     res.status(500).json({ success: false, error: 'Internal Server Error' });
//   }
// });

app.get('/get-wagers', async (req, res) => {
  try {
    // Fetch all wagers from the collection
    const wagersData = await wagersCollection.find({}).toArray();
    res.json({ success: true, wagers: wagersData });
  } catch (error) {
    console.error('Error fetching wagers:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});


// Serve the wagers.html page
app.get('/wagers', (req, res) => {
  if (req.session.passport && req.session.passport.user) {
    const user = req.session.passport.user;
    res.render('wagers', { user: user }); // Use 'user' instead of 'req.session.user'
  } else {
    res.redirect('/login');
  }
});

/// Server-side route to remove a wager
app.post('/remove-wager', express.json(), (req, res) => {
  const { teamName, openTeam, odds, wagerAmount, eventTime, firstUser } = req.body;

  // Find the index of the accepted wager in the wagers array
  const index = wagers.findIndex(
    (wager) =>
      wager.teamName === teamName &&
      wager.openTeam === openTeam &&
      wager.odds === odds &&
      wager.wagerAmount === wagerAmount && // Use wagerAmount here
      wager.eventTime === eventTime &&
      wager.firstUser === firstUser
  );

  // If the wager is found in the array, remove it
  if (index !== -1) {
    wagers.splice(index, 1);
    console.log('Removed accepted wager from wagers array');
    res.json({ success: true, message: 'Wager removed successfully' });
  } else {
    res.json({ success: false, message: 'Wager not found' });
  }
});



// Declare savedBets as a global array
const savedBets = [];

// Server-side route to save a bet
app.post('/accepted-bet', express.json(), (req, res) => {
  const { originalPick, acceptedPick, originalOdds, acceptedOdds, wagerAmount, gameTime, firstUser, betTaker, sportId, eventId, userGroup } = req.body;

  // Save the bet data to your storage system (e.g., a database)
  // Example: Save the bet to an array for simplicity
  const betData = {
    originalPick,
    acceptedPick,
    originalOdds,
    acceptedOdds,
    wagerAmount,
    gameTime,
    firstUser,
    betTaker,
    sportId,
    eventId,
    userGroup,
  };

  // Push the bet data to an array (you can replace this with your storage solution)
  savedBets.push(betData);

  res.json({
    success: true,
    bets: betData,
    message: 'Bet saved successfully' });
});

// Define a route to retrieve accepted bets
app.get('/accepted-bets', (req, res) => {
  // Here, you would retrieve the saved bet data from your storage system
  // Example: Retrieve data from an array (replace with your storage solution)
  const acceptedBets = savedBets;

  // Respond with the retrieved bet data
  res.json({ success: true, acceptedBets });
});

app.get('/mybets', (req, res) => {
  if (req.session.passport && req.session.passport.user) {
    const username = req.session.passport.user.username;

    const userBets = savedBets.filter(bet => bet.firstUser === username || bet.betTaker === username);

    res.render('accepted-bets', { user: req.session.passport.user, acceptedBets: userBets }); // Use 'user' instead of 'req.session.user'
  } else {
    res.redirect('/login');
  }
});

app.get('/groupbets', (req, res) => {
  if (req.session.passport && req.session.passport.user) {
    const group = req.session.passport.user.group;
    res.render('group-bets.ejs', { group: group }); // Use 'user' instead of 'req.session.user'
  } else {
    res.redirect('/login');
  }
})



// Function to get wagers from the in-memory array
function getWagersFromDataSource() {
  return wagers;
}

// Example usage in a route handler
app.get('/get-wagers', (req, res) => {
  try {
    const wagersData = getWagersFromDataSource();
    res.json({ success: true, wagers: wagersData });
  } catch (error) {
    console.error('Error fetching wagers:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.get('/userdata', (req, res) => {
  if (req.session.user) {
    res.json(req.session.user)
  } else {
    res.status(401).json({error: 'User data not available'})
  }
});


app.get('/bet365-data/:eventId', async (req, res) => {
  const eventId = req.params.eventId;
  const bet365ApiUrl = `https://api.b365api.com/v1/bet365/event?token=${apiKey}&FI=${eventId}`;
  // console.log(eventId);

  try {
    const response = await axios.get(bet365ApiUrl);
    if (response.data) {
      res.json(response.data.results[0]);
    } else {
      throw new Error('No data received from API');
    }
  } catch (error) {
    console.error('Error fetching Bet365 data for event ID:', eventId, error.message);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});



// server.js

app.get('/bet365-results/:eventId', async (req, res) => {
  const eventId = req.params.eventId;
  const url = `https://api.b365api.com/v1/bet365/result?token=${apiKey}&event_id=${eventId}`;

  try {
    const resultResponse = await axios.get(url);
    res.json(resultResponse.data);
  } catch (error) {
    console.error('Error fetching results from Bet365:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/save-finished-event', (req, res) => {

    const eventData = req.body;
    const { originalTeamScore, acceptedTeamScore, originalOdds, acceptedOdds, originalUser, secondUser, wagerAmount, acceptedPick, originalPick } = eventData;

    // Check if an event with the same eventId already exists in savedEventData
    const existingEvent = savedEventData.find((event) => event.eventId === eventData.eventId);

    if (existingEvent) {
        // Respond with an error indicating that the event already exists
        return
    }

    // Generate a unique internal ID for the event
    const internalEventId = uuidv4();

    eventData.internalEventId = internalEventId;

    const scoreWithOdds = (originalTeamScore + originalOdds);

    if (scoreWithOdds > acceptedTeamScore){
        eventData.winningTeam = originalPick;
        eventData.losingTeam = acceptedPick;
        eventData.winner = originalUser;
        eventData.loser = secondUser;
        eventData.winningScore = originalTeamScore;
        eventData.losingScore = acceptedTeamScore;
        eventData.winningOdds = originalOdds;
        eventData.losingOdds = acceptedOdds;
    } else if (scoreWithOdds < acceptedTeamScore) {
        eventData.winner = secondUser;
        eventData.loser = originalUser;
        eventData.winningTeam = acceptedPick;
        eventData.losingTeam = originalPick;
        eventData.winningScore = acceptedTeamScore;
        eventData.losingScore = originalTeamScore;
        eventData.winningOdds = acceptedOdds;
        eventData.losingOdds = originalOdds;
    }

    savedEventData.push(eventData);
    // Add your logic to save the eventData here

    res.json({ success: true, message: 'Event data saved successfully' });
});


// Define a route to retrieve saved event data
app.get('/saved-events', (req, res) => {
  // Here, you would retrieve the saved event data from your storage system
  // Example: Retrieve data from an array (replace with your storage solution)
  const savedEvents = savedEventData;

  // Respond with the retrieved event data
  res.json({ success: true, savedEvents });
});

// Function to get saved events data
function getSavedEvents() {
  // Replace this with your logic to retrieve the saved events data
  // You may fetch it from a database, file, or any other data source
  return savedEventData; // Assuming savedEventData is your array of saved events
}

app.get('/my-stats', (req, res) => {
  if (req.isAuthenticated()) {
    const myStatsData = savedEventData; // Your data retrieval logic
    res.render('my-stats', { user: req.user, myStats: myStatsData });
  } else {
    res.redirect('/login');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
