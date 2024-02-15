const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const ejs = require('ejs');
const {v4: uuidv4} = require('uuid');
require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoUri = process.env.MONGO_URI;
const { MongoClient, ObjectId } = require('mongodb');
const mongoClient = new MongoClient(mongoUri);

// MongoDB connection
async function connectToMongoDB() {
  try {
    await mongoClient.connect();
    console.log("Connected successfully to MongoDB");
  } catch (error) {
    console.error("Failed to connect to MongoDB", error);
  }
}

connectToMongoDB();

// Available collections in the database
const db = mongoClient.db("Bets");
const wagersCollection = db.collection("openWagers");
const acceptedBetsCollection = db.collection("acceptedBets");
const finishedBetsCollection = db.collection("finishedBets");
const usersCollection = db.collection("users");
const groupsCollection = db.collection("groups");

// Shutting down the database when the server goes down
process.on('SIGINT', async () => {
  await mongoClient.close();
  process.exit(0);
});

let savedEventData = [];

// Express server
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

// Login functionality
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
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/register', async (req, res) => {
  // Destructure groupName from req.body now, instead of group
  const { username, password, groupName, groupPassword } = req.body;
  const saltRounds = 10;

  console.log(groupName, groupPassword); // This should now correctly log "AA" and "bets"

  try {
    // Use groupName when querying the database
    const groupDoc = await groupsCollection.findOne({ groupName: groupName });
 // Adjust 'groupName' to the actual field name in your groups collection

    // If the group exists, verify the group password
    if (groupDoc) {
      // Assuming group passwords are also hashed and stored securely
      const passwordMatch = await bcrypt.compare(groupPassword, groupDoc.password);
      if (!passwordMatch) {
        // If the group password does not match, send an error response
        return res.status(400).json({ success: false, message: 'Incorrect group password.' });
      }

      // If the group password matches, hash the user's password
      const hash = await bcrypt.hash(password, saltRounds);
      console.log('Password hashed');

      // Store user with hashed password, including the group
      const newUser = { username, password: hash, group: groupDoc.groupName, wins: 0, losses: 0 }; // Adjust as needed
      await usersCollection.insertOne(newUser);
      console.log('User saved');

      // Optionally, redirect to login or send a success response
      res.redirect('/login'); // Or res.json({ success: true });
    } else {
      // If the group does not exist, send an error response
      return res.status(400).json({ success: false, message: 'Group not found.' });
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' }); // Adjust error handling as needed
  }
  // No need for a finally block to close the database connection if you're using a persistent connection
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

app.post('/login', async (req, res, next) => {
  const { username, password } = req.body;
  const user = await usersCollection.findOne({ username });

  if (user && bcrypt.compareSync(password, user.password)) {
    req.login(user, async (err) => { // Mark this callback as async
      if (err) { return next(err); }

      try {
        // Fetch group users and related data
        const userGroup = user.group;
        const groupUsers = await usersCollection.find({ group: userGroup }, { projection: { username: 1, wins: 1, losses: 1, winPct: 1 } }).toArray();

        // Render the group page with necessary data
        return res.render('group-page', { groupUsers: groupUsers, userGroup: userGroup, currentUser: username });
      } catch (error) {
        console.error('Error fetching group users:', error.message);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
      }
    });
  } else {
    res.redirect('/login'); // Redirect back to login on failure
  }
});

// Render games.ejs page
app.get('/games', (req, res) => {
  if (req.isAuthenticated()) {
    console.log(req.user);
    res.render('games', { user: req.user });
  } else {
    res.redirect('/login');
  }
});

// Get upcoming events from Bet365
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


// Get specific odds for upcoming events
app.get('/bet365-eventodds/:eventId', async (req, res) => {

  const eventId = req.params.eventId;
  const apiUrl = `https://api.b365api.com/v3/bet365/prematch?token=${apiKey}&FI=${eventId}`;

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: 'Basic YOUR_BASE64_ENCODED_API_KEY',
      },
    });

    if (!response.data.success) {
      throw new Error(`Error: ${response.data.error}`);
    }

    const oddsData = response.data.results[0].main.sp.game_lines.odds[0];
    res.json(oddsData);
  } catch (error) {
    console.error(`Error fetching event odds for event ID ${eventId}:`, error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Declare wagers as a global array
const wagers = [];

// Placing a wager
app.post('/place-wager', express.json(), async (req, res) => {
  const { teamName, openTeam, takenOdds, openOdds, wager, eventTime, firstUser, group, sportId, bet365Id, leagueName } = req.body;

  const wagerId = uuidv4();

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
    bet365Id,
    _id: wagerId,
    leagueName,
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

app.get('/wagers', (req, res) => {
  if (req.isAuthenticated()) {
    res.render('wagers', { user: req.user });
  } else {
    res.redirect('/login');
  }
});

app.post('/remove-wager', express.json(), async (req, res) => {
    const { wagerId } = req.body;

    try {
        const result = await wagersCollection.deleteOne({ _id: wagerId });
        // Or, if you store UUID in a different field, use that field
        // const result = await wagersCollection.deleteOne({ uuidField: wagerId });

        if (result.deletedCount === 1) {
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

app.post('/accepted-bet-2', express.json(), async (req, res) => {
  const { originalPick, acceptedPick, originalOdds, acceptedOdds, wagerAmount, gameTime, firstUser, betTaker, sportId, eventId, userGroup, _id, leagueName } = req.body;

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
    leagueName,
    _id,
    // Include other relevant fields
  };

  try {
    await acceptedBetsCollection.insertOne(betData);

    // Remove the wager from the wagers collection using wagerId
  console.log('wagerId', _id);
  const removeResult = await wagersCollection.deleteOne({ _id: _id });
  if (removeResult.deletedCount === 0) {
    throw new Error('Wager not found or already removed');
  }

  res.json({ success: true, bets: betData, wagerId: _id, message: 'Bet saved and wager removed successfully' });
} catch (error) {
  console.error('Error saving bet:', error);
  res.status(500).send('Error saving bet: ' + error.message);
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

app.post('/save-finished-event', async (req, res) => {
    const eventData = req.body;
    const { originalTeamScore, acceptedTeamScore, originalOdds, acceptedOdds, originalUser, secondUser, wagerAmount, acceptedPick, originalPick, eventTime, _id, sportId, leagueName } = eventData;

    console.log('leagueName', leagueName)

    try {
        // Check if an event with the same _id already exists in finishedBets
        const existingEvent = await finishedBetsCollection.findOne({ _id: _id });

        if (existingEvent) {
            res.json({ success: false, message: 'Event already exists in finished bets' });
            return;
        }

        const scoreWithOdds = (originalTeamScore + originalOdds);

        if (scoreWithOdds > acceptedTeamScore) {
            eventData.winner = originalUser;
            eventData.loser = secondUser;
            eventData.winningTeam = originalPick;
            eventData.losingTeam = acceptedPick;
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
        const result = await acceptedBetsCollection.deleteOne({ _id: _id });

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

      const currentUser = req.user.username;

      // Render the group page with the list of users
      res.render('group-page', { groupUsers: groupUsers, userGroup: userGroup, currentUser: currentUser });
    } catch (error) {
      console.error('Error fetching group users:', error.message);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  } else {
    res.redirect('/login');
  }
});

app.get('/sports-stats', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ success: false, error: 'User not authenticated' });
  }

  const currentUser = req.user.username;

  try {
    // Fetch finished bets directly from the finishedBetsCollection
    const finishedBets = await finishedBetsCollection.find({
      $or: [
        { originalUser: currentUser },
        { secondUser: currentUser }
      ]
    }).toArray();

    // Process the finished bets to calculate sports stats
    const statsBySport = calculateSportsStats(finishedBets, currentUser);
    res.json(statsBySport);
  } catch (error) {
    console.error('Error fetching sports stats:', error);
    res.status(500).send('Error fetching sports stats');
  }
});

function calculateSportsStats(finishedBets, currentUser) {
  const statsByLeague = {};

  finishedBets.forEach(bet => {
    // Initialize the league stats if not already done
    if (!statsByLeague[bet.leagueName]) {
      statsByLeague[bet.leagueName] = { wins: 0, losses: 0, leagueName: bet.leagueName };
    }

    // Increment win or loss count based on whether the currentUser is the winner
    if (bet.winner === currentUser) {
      statsByLeague[bet.leagueName].wins++;
    } else {
      statsByLeague[bet.leagueName].losses++;
    }
  });

  // Convert the stats object into an array and calculate win percentages
  return Object.values(statsByLeague).map(league => ({
    ...league,
    winPct: calculateWinPercentage(league.wins, league.losses)
  }));
}

function calculateWinPercentage(wins, losses) {
  const totalGames = wins + losses;
  return totalGames > 0 ? (wins / totalGames * 100).toFixed(2) : "0.00";
}

app.get('/user-record-against-others', async (req, res) => {
    try {
        const currentUser = req.user.username; // Assuming you have authentication middleware to get the current user
        const userGroup = req.user.group; // Assuming you have a
        const userRecords = await calculateUserRecords(currentUser, userGroup, req.user);
        res.json({ success: true, userRecords });
    } catch (error) {
        console.error('Error calculating user records:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

async function calculateUserRecords(currentUser, userGroup, user) {
  try {
    // Query the database to get all users in the group
    const groupUsers = await usersCollection.find({ group: userGroup }).toArray();

    // Calculate the user's record against each opponent
    const userRecords = [];
    for (const groupUser of groupUsers) {
      // Skip the current user
      if (groupUser.username === currentUser) {
        continue;
      }

      // Query the database to get the number of wins for the current user against this opponent
      const wins = await finishedBetsCollection.countDocuments({
        winner: currentUser,
        loser: groupUser.username,
      });

      // Query the database to get the number of losses for the current user against this opponent
      const losses = await finishedBetsCollection.countDocuments({
        winner: groupUser.username,
        loser: currentUser,
      });

      // Calculate the win percentage
      const totalMatches = wins + losses;
      const winPercentage = totalMatches === 0 ? 0 : (wins / totalMatches) * 100;

      // Construct the record object
      const record = {
        opponent: groupUser.username,
        wins,
        losses,
        winPercentage: winPercentage.toFixed(2) + '%', // Format win percentage
      };

      userRecords.push(record);
    }

    return userRecords;
  } catch (error) {
    console.error('Error calculating user records:', error);
    throw error;
  }
}

// Fetch groups from MongoDB
app.get('/groups', async (req, res) => {
    try {
        const groups = await groupsCollection.find({}).toArray();
        res.json(groups);
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
