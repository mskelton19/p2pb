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
const bcrypt = require('bcrypt');
const { ObjectId } = require('mongodb');



// Creating a database
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

// Telling the code what collections are available
const db = mongoClient.db("Bets");
const wagersCollection = db.collection("openWagers");
const acceptedBetsCollection = db.collection("acceptedBets");
const finishedBetsCollection = db.collection("finishedBets"); // Your collection name for finished bets
const usersCollection = db.collection("users"); // Make sure this line is after you've defined `db`

// Shutting down the database when the server goes down
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

app.post('/register', async (req, res) => {
  const { username, password, group } = req.body;
  const saltRounds = 10;

  try {
    // Hash the password
    const hash = await bcrypt.hash(password, saltRounds);
    console.log('Password hashed');

    // Store user with hashed password
    const newUser = { username, password: hash, group, wins: 0, losses: 0 };
    await usersCollection.insertOne(newUser);
    console.log('User saved');

    res.redirect('/login'); // Redirect to login after successful registration
  } catch (err) {
    console.error('Registration error:', err);
    res.redirect('/register'); // Redirect back to registration on error
  }
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
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
  done(null, user._id); // Serialize user by _id
});

// Later in your deserializeUser function, you can access 'usersData'
passport.deserializeUser(async (id, done) => {
  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(id) });
    done(null, user);
  } catch (error) {
    done(error, null);
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
// app.post('/login', (req, res) => {
//   const { username, password } = req.body;
//
//   // Read user data from 'users.json' and return as an array
//   const usersData = getUsersDataFromJson(); // Replace with your logic
//   const user = usersData.find(u => u.username === username && u.password === password);
//
//   if (user) {
//     // Simulate a successful login
//     req.login(user, (err) => {
//       if (err) {
//         console.error('Error during login:', err);
//         return res.redirect('/login');
//       }
//       console.log('successful login')
//       return res.redirect('/games');
//     });
//   } else {
//     // Simulate a failed login
//     res.redirect('/login');
//   }
// });

app.post('/login', async (req, res, next) => {
  const { username, password } = req.body;
  const user = await usersCollection.findOne({ username });

  if (user && bcrypt.compareSync(password, user.password)) {
    req.login(user, (err) => {
      if (err) { return next(err); }
      return res.redirect('/games'); // Redirect upon successful login
    });
  } else {
    res.redirect('/login'); // Redirect back to login on failure
  }
});




// Route to serve the HTML file
// app.get('/games', (req, res) => {
//   if (req.session.passport && req.session.passport.user) {
//     const user = req.session.passport.user;
//     res.render('games', { user: user });
//   } else {
//     res.redirect('/login');
//   }
// });

app.get('/games', (req, res) => {
  if (req.isAuthenticated()) {
    console.log(req.user);
    res.render('games', { user: req.user });
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

app.post('/place-wager-2', express.json(), async (req, res) => {
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

  try {
    // Insert the new wager into the collection
    await wagersCollection.insertOne(newWager);

    // Update the total wager amount and count for the user
    await usersCollection.updateOne(
      { username: firstUser },
      {
        $inc: {
          totalWagers: wager, // Increment totalWagers by the wager amount
          totalWagerCount: 1 // Increment totalWagerCount by 1
        }
      }
    );

    res.json({ success: true, wager: newWager });
  } catch (error) {
    console.error('Error processing wager:', error);
    res.status(500).send('Error processing wager');
  }
});


// Function to get wagers from the in-memory array
function getWagersFromDataSource() {
  // console.log('Server: ' + wagers)
  return wagers;
}

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

// // Serve the wagers.html page
// app.get('/wagers', (req, res) => {
//   if (req.session.passport && req.session.passport.user) {
//     const user = req.session.passport.user;
//     res.render('wagers', { user: user }); // Use 'user' instead of 'req.session.user'
//   } else {
//     res.redirect('/login');
//   }
// });

app.get('/wagers', (req, res) => {
  if (req.isAuthenticated()) {
    res.render('wagers', { user: req.user });
  } else {
    res.redirect('/login');
  }
});


// remove wager on the db
app.post('/remove-wager', express.json(), async (req, res) => {
  const { teamName, openTeam, odds, wagerAmount, eventTime, firstUser } = req.body;

  try {
    const result = await wagersCollection.deleteOne({
      teamName,
      openTeam,
      odds,
      wagerAmount,
      eventTime,
      firstUser
    });

    if (result.deletedCount === 1) {
      // console.log('Removed accepted wager from database');
      res.json({ success: true, message: 'Wager removed successfully' });
    } else {
      res.json({ success: false, message: 'Wager not found' });
    }
  } catch (error) {
    console.error('Error removing wager:', error);
    res.status(500).send('Error removing wager');
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

app.post('/accepted-bet-2', express.json(), async (req, res) => {
  const { originalPick, acceptedPick, originalOdds, acceptedOdds, wagerAmount, gameTime, firstUser, betTaker, sportId, eventId, userGroup } = req.body;

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

  try {
    await acceptedBetsCollection.insertOne(betData);
    res.json({ success: true, bets: betData, message: 'Bet saved successfully' });
  } catch (error) {
    console.error('Error saving bet:', error);
    res.status(500).send('Error saving bet');
  }
});

// db get route
app.get('/accepted-bets', async (req, res) => {
  try {
    const acceptedBets = await acceptedBetsCollection.find({}).toArray();
    res.json({ success: true, acceptedBets });
  } catch (error) {
    console.error('Error fetching bets:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// db get route
// app.get('/mybets', async (req, res) => {
//   if (req.session.passport && req.session.passport.user) {
//     const username = req.session.passport.user.username;
//
//     try {
//       const userBets = await acceptedBetsCollection.find({
//         $or: [{ firstUser: username }, { betTaker: username }]
//       }).toArray();
//
//       res.render('accepted-bets', { user: req.session.passport.user, acceptedBets: userBets });
//     } catch (error) {
//       console.error('Error fetching bets:', error.message);
//       res.status(500).json({ success: false, error: 'Internal Server Error' });
//     }
//   } else {
//     res.redirect('/login');
//   }
// });

app.get('/mybets', async (req, res) => {
  // Check if the user is authenticated
  if (req.isAuthenticated()) {
    const username = req.user.username; // Get username from req.user

    try {
      // Find bets where the current user is either the firstUser or betTaker
      const userBets = await acceptedBetsCollection.find({
        $or: [{ firstUser: username }, { betTaker: username }]
      }).toArray();

      // Render the 'accepted-bets' view and pass user and userBets
      res.render('accepted-bets', { user: req.user, acceptedBets: userBets });
    } catch (error) {
      console.error('Error fetching bets:', error.message);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  } else {
    // Redirect to the login page if the user is not authenticated
    res.redirect('/login');
  }
});




// app.get('/groupbets', (req, res) => {
//   if (req.session.passport && req.session.passport.user) {
//     const group = req.session.passport.user.group;
//     res.render('group-bets.ejs', { group: group }); // Use 'user' instead of 'req.session.user'
//   } else {
//     res.redirect('/login');
//   }
// })

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

app.post('/save-finished-event-2', async (req, res) => {
    const eventData = req.body;
    const { originalTeamScore, acceptedTeamScore, originalOdds, acceptedOdds, originalUser, secondUser, wagerAmount, acceptedPick, originalPick, eventTime } = eventData;

    console.log(eventTime)

    try {
        // Check if an event with the same eventId already exists in finishedBets
        const existingEvent = await finishedBetsCollection.findOne({ eventId: eventData.eventId });

        if (existingEvent) {
            res.json({ success: false, message: 'Event already exists in finished bets' });
            return;
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

                // Update wins and losses for winner and loser
                await updateWinLoss(eventData.winner, true, wagerAmount); // true for a win
                await updateWinLoss(eventData.loser, false, wagerAmount); // false for a loss


        // Save the event data to the finishedBets collection
        await finishedBetsCollection.insertOne(eventData);

        // Remove the event from the acceptedBets collection
        const result = await acceptedBetsCollection.deleteOne({ eventId: eventData.eventId });

        if (result.deletedCount === 1) {
            res.json({ success: true, message: 'Event moved to finished bets successfully' });
        } else {
            throw new Error('Event not found in accepted bets');
        }
    } catch (error) {
        console.error('Error moving event to finished bets:', error);
        res.status(500).send('Error moving event to finished bets');
    }
});

async function updateWinLoss(username, isWin, wagerAmount) {
    const user = await usersCollection.findOne({ username: username });
    if (!user) return;

    let { wins, losses, winnings = 0 } = user; // Initialize winnings if not present

    if (isWin) {
        wins += 1;
        winnings += wagerAmount; // Increment winnings for a win
    } else {
        losses += 1;
        winnings -= wagerAmount; // Decrement winnings for a loss
    }

    const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0;

    await usersCollection.updateOne(
        { username: username },
        {
          $set: { wins: wins, losses: losses, winPct: winPct, winnings: winnings },
          $inc: { totalRisked: wagerAmount } // Increment totalRisked
        }
    );
}


// db route for finished events
app.get('/saved-events', async (req, res) => {
  try {
    const savedEvents = await finishedBetsCollection.find({}).toArray();
    res.json({ success: true, savedEvents });
  } catch (error) {
    console.error('Error fetching saved events:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.get('/finished-bets', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ success: false, error: 'User not authenticated' });
  }

  const currentUser = req.user.username;

  try {
    const finishedBets = await finishedBetsCollection.find({
      $or: [
        { originalUser: currentUser },
        { secondUser: currentUser }
      ]
    }).toArray();
    res.json({ success: true, finishedBets });
  } catch (error) {
    console.error('Error fetching finished bets:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});


// db route for my stats
// app.get('/my-stats', async (req, res) => {
//   if (req.isAuthenticated()) {
//     try {
//       const username = req.user.username; // Adjust according to your user object
//       const myStatsData = await finishedBetsCollection.find({ $or: [{ originalUser: username }, { secondUser: username }] }).toArray();
//       res.render('my-stats', { user: req.user, myStats: myStatsData });
//     } catch (error) {
//       console.error('Error fetching my stats:', error.message);
//       res.status(500).json({ success: false, error: 'Internal Server Error' });
//     }
//   } else {
//     res.redirect('/login');
//   }
// });

app.get('/my-stats', async (req, res) => {
  if (req.isAuthenticated()) {
    const username = req.user.username;
    try {
      const userStats = await usersCollection.findOne({ username: username }, { projection: { wins: 1, losses: 1, winPct: 1 } });
      // Fetch data where the current user is either the originalUser or the secondUser
      const myStatsData = await finishedBetsCollection.find({
        $or: [{ originalUser: username }, { secondUser: username }]
      }).toArray();

      // Render the my-stats page with the user's data and their stats
      res.render('my-stats', { user: req.user, myStats: myStatsData, userStats: userStats });
    } catch (error) {
      console.error('Error fetching my stats:', error.message);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  } else {
    // Redirect to login if the user is not authenticated
    res.redirect('/login');
  }
});

app.post('/finished-bets-for-user', async (req, res) => {
  const { currentUser } = req.body;
  try {
    const finishedBets = await finishedBetsCollection.find({
      $or: [{ firstUser: currentUser }, { betTaker: currentUser }]
    }).toArray();

    res.json({ success: true, finishedBets });
  } catch (error) {
    console.error('Error fetching finished bets:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.get('/mygroup', async (req, res) => {
  if (req.isAuthenticated()) {
    const userGroup = req.user.group; // Assuming the user's group is stored in req.user.group
    try {
      // Fetch all users in the same group along with their stats
      const groupUsers = await usersCollection.find({ group: userGroup }, { projection: { username: 1, wins: 1, losses: 1, winPct: 1 } }).toArray();

      // Render the group page with the list of users
      res.render('group-page', { groupUsers: groupUsers, userGroup: userGroup });
    } catch (error) {
      console.error('Error fetching group users:', error.message);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  } else {
    res.redirect('/login');
  }
});




// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
