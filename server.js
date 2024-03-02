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
const cron = require('node-cron');

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
const port = process.env.PORT || 3000;

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
  saveUninitialized: true,
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signout', (req, res) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    // Destroy the session and redirect the user.
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });
});

app.post('/register', async (req, res) => {
    const { username, password, group, groupPassword } = req.body;

    try {
        const groupDoc = await groupsCollection.findOne({ group: group });
        if (!groupDoc) {
            return res.status(400).json({ success: false, message: 'Group not found.' });
        }

        const passwordMatch = await bcrypt.compare(groupPassword, groupDoc.password);
        if (!passwordMatch) {
            return res.status(400).json({ success: false, message: 'Incorrect group password.' });
        }

        const hash = await bcrypt.hash(password, 10);
        // Create the user document including the groupName, and initializing wins and losses to 0
        const newUser = {
            username,
            password: hash,
            group,
            wins: 0, // Initialize wins to 0
            losses: 0 // Initialize losses to 0
        };
        await usersCollection.insertOne(newUser);

        req.session.groupPasswordHash = null;

        return res.json({ success: true, redirectUrl: '/login?registration=success' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
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
        const groupUsers = await usersCollection.find({ group: userGroup }, { projection: { username: 1, wins: 1, losses: 1 } }).toArray();

        // Calculate win percentage for each user
        const groupUsersWithWinPct = groupUsers.map(user => {
          const winPct = calculateWinPercentage(user.wins, user.losses);
          return { ...user, winPct: winPct }; // Add calculated winPct to each user
        });

        // Render the group page with necessary data including winPct
        return res.render('group-page', { groupUsers: groupUsersWithWinPct, userGroup: userGroup, currentUser: username });
      } catch (error) {
        console.error('Error fetching group users:', error.message);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
      }
    });
  } else {
    res.redirect('/login?loginFailed=true');
  }
});

function calculateWinPercentage(wins, losses) {
  const totalGames = wins + losses;
  // Calculate the win percentage as a fraction of 1, not 100
  const winPct = totalGames > 0 ? (wins / totalGames) : 0;
  // Multiply by 100 here to convert to a percentage, then format to 2 decimal places
  return (winPct * 100).toFixed(2);
}


// Render games.ejs page
app.get('/games', (req, res) => {
  if (req.isAuthenticated()) {
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
  let { originalPick, acceptedPick, originalOdds, acceptedOdds, wagerAmount, gameTime, firstUser, betTaker, sportId, eventId, userGroup, _id, status, leagueName } = req.body;

  gameTime = new Date(gameTime);

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
    status,
    leagueName,
    _id,
    // Include other relevant fields
  };

  try {
    await acceptedBetsCollection.insertOne(betData);

    // Remove the wager from the wagers collection using wagerId
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
// app.get('/accepted-bets', async (req, res) => {
//   try {
//     const acceptedBets = await acceptedBetsCollection.find({}).toArray();
//     res.json({ success: true, acceptedBets });
//   } catch (error) {
//     console.error('Error fetching bets:', error.message);
//     res.status(500).json({ success: false, error: 'Internal Server Error' });
//   }
// });

app.get('/accepted-bets', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  const currentUser = req.user.username; // Assuming username is stored in req.user
  const userGroup = req.user.group; // Assuming group information is stored in req.user
  const { status } = req.query; // Status can still be passed as a query parameter

  try {
    let query = {
      $or: [{ firstUser: currentUser }, { betTaker: currentUser }], // Filter by current user involvement
      userGroup: userGroup // Filter by user's group
    };

    if (status) {
      query.status = status; // Further filter by status if provided
    }

    const acceptedBets = await acceptedBetsCollection.find(query).toArray();
    res.json({ success: true, acceptedBets });
  } catch (error) {
    console.error('Error fetching bets:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// Update bet statuses
async function updateBetStatuses() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db("Bets");
    const collection = db.collection("acceptedBets");

    // Current time in the appropriate format
    const now = new Date();

    // Update the status of bets where the game time has passed
    const result = await collection.updateMany(
      { gameTime: { $lt: now }, status: "upcoming" },
      { $set: { status: "in progress" } }
    );

    console.log(`Updated ${result.modifiedCount} bet(s) to 'in progress'.`);
  } catch (err) {
    console.error('Failed to update bet statuses:', err);
  } finally {
    await client.close();
  }
}

// Schedule the task to run every minute
cron.schedule('* * * * *', updateBetStatuses);

let liveScoresCache = {};
// Function to check the status of in-progress games and update them if finished
async function updateBetStatusesToFinished() {
  const inProgressBets = await fetchInProgressBets();

  for (const bet of inProgressBets) {
    try {
      const results = await fetchBet365Results(bet.eventId);
      let scores;

      if(results && !isEventFinished(results)) {
        const scores = await processGameResults(results, bet);
        liveScoresCache[bet.eventId] = { scores, lastUpdated: new Date()  };
        await updateBetsWithLiveScores(bet.eventId, scores);
        console.log('scores ', scores);
      } else if ( results && isEventFinished(results)) {
        if (!scores) {
        scores = await processGameResults(results, bet); // Consider fetching scores here too if needed
        }
        console.log('scores', scores)
        bet.originalScore = scores.originalPickScore;
        bet.acceptedScore = scores.acceptedPickScore;

        const originalTotalScore = parseFloat(scores.originalPickScore) + parseFloat(bet.originalOdds);
        const acceptedTotalScore = parseFloat(scores.acceptedPickScore);

        let winner, loser;

        if (originalTotalScore > acceptedTotalScore) {
          bet.winner = bet.firstUser;
          bet.loser = bet.betTaker;
          winner = bet.firstUser;
          loser = bet.betTaker;
        } else if (originalTotalScore < acceptedTotalScore) {
          bet.winner = bet.betTaker;
          bet.loser = bet.firstUser;
          winner = bet.betTaker;
          loser = bet.firstUser;
        }

        if (winner && loser) {
          await updateWinLossStats(winner, loser);
        }

        bet.status = 'finished';
        await moveBetToFinished(bet);
      }

      // console.log('scores +++++', scores)
        } catch (err) {
            console.error('Error processing bet ID:', bet._id, err);
        }
    }

    // If there are live scores to report back to the client
 if (liveScoresData.length > 0) {
     return liveScoresData; // Return live scores data for in-progress games
 }

 // Otherwise, you might return null or an empty array to indicate no live scores are available
 return null;
}

app.get('/live-scores', (req, res) => {
  console.log('in live scores function')
    res.json({ success: true, liveScores: liveScoresCache });
});

async function updateBetsWithLiveScores(eventId, scores) {
    try {
        // Update bets in the database where eventId matches
        await acceptedBetsCollection.updateMany(
            { eventId: eventId }, // Filter
            {
                $set: {
                    "liveScores.originalPickScore": scores.originalPickScore,
                    "liveScores.acceptedPickScore": scores.acceptedPickScore,
                    "liveScores.lastUpdated": new Date() // Optional: track when the scores were last updated
                }
            }
        );
    } catch (error) {
        console.error('Error updating bets with live scores:', error);
    }
}

async function updateWinLossStats(winnerUsername, loserUsername) {
  // Increment wins for the winner
  await usersCollection.updateOne(
    { username: winnerUsername },
    { $inc: { wins: 1 } }
  );

  // Increment losses for the loser
  await usersCollection.updateOne(
    { username: loserUsername },
    { $inc: { losses: 1 } }
  );
}

// Schedule the task to run at a regular interval, e.g., every 5 minutes
cron.schedule('*/1 * * * *', updateBetStatusesToFinished);

// Function to fetch in-progress bets
async function fetchInProgressBets() {
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db('Bets');
    const collection = db.collection('acceptedBets');

    // Query for bets with status 'in progress'
    const query = { status: 'in progress' };
    const bets = await collection.find(query).toArray();

    return bets;
  } catch (err) {
    console.error('Failed to fetch in-progress bets:', err);
  } finally {
    await client.close();
  }
}

async function processGameResults(results, bet) {
  const resultsData = await fetchBet365Results(bet.eventId);

  let originalPickScore = '';
  let acceptedPickScore = '';

  if (resultsData && resultsData.results[0]) {
    const finalScores = resultsData.results[0];
    const sportId = finalScores.sport_id; // Assuming sport_id is available in finalScores

    switch(sportId) {
      case '17': // Assuming 17 is for a specific sport
        const scoreData17 = finalScores.scores[5]; // Specific to sportId 17
        originalPickScore = bet.originalPick === finalScores.away.name ? scoreData17.away : scoreData17.home;
        acceptedPickScore = bet.acceptedPick === finalScores.away.name ? scoreData17.away : scoreData17.home;
        break;

      case '18': // For sport_id 18
        const scoreData18 = finalScores.scores[7]; // Specific to sportId 18
        originalPickScore = bet.originalPick === finalScores.away.name ? scoreData18.away : scoreData18.home;
        acceptedPickScore = bet.acceptedPick === finalScores.away.name ? scoreData18.away : scoreData18.home;
        break;

      case '12': // For sport_id 12
        const scoreData12 = finalScores.scores[7]; // Specific to sportId 12
        originalPickScore = bet.originalPick === finalScores.away.name ? scoreData12.away : scoreData12.home;
        acceptedPickScore = bet.acceptedPick === finalScores.away.name ? scoreData12.away : scoreData12.home;
        break;
      }

        return {
         originalPickScore: originalPickScore,
         acceptedPickScore: acceptedPickScore
       };
     }

     // Return empty scores if no results are found or in case of error
     return {
       originalPickScore: '',
       acceptedPickScore: ''
     };
   }


async function fetchBet365Results(eventId) {
  const apiUrl = `https://api.b365api.com/v1/bet365/result?token=${apiKey}&event_id=${eventId}`;

  try {
    const response = await axios.get(apiUrl);
    return response.data; // axios automatically parses the JSON response
  } catch (error) {
    // Handle errors that occur during the API call
    console.error('Failed to fetch results:', error.message);
    throw new Error('Failed to fetch results');
  }
}

function isEventFinished(results) {
  return(results.results[0].time_status === '3')
}

async function moveBetToFinished(bet) {
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db('Bets');
    // Correct the collection name to 'finishedBets' and fix the typo
    const finishedBetsCollection = db.collection('finishedBets');
    const insertResult = await finishedBetsCollection.insertOne(bet);
    console.log(`Bet ID ${bet._id} moved to 'finishedBets'. Insert Result:`, insertResult);

    // If the insert was successful, remove the bet from 'acceptedBets'
    if (insertResult.acknowledged) {
      const acceptedBetsCollection = db.collection('acceptedBets');
      const deleteResult = await acceptedBetsCollection.deleteOne({ _id: bet._id });
      console.log(`Bet ID ${bet._id} removed from 'acceptedBets'. Delete Result:`, deleteResult);
    }
  } catch (err) {
    console.error('Failed to move bet to finished:', err);
  } finally {
    await client.close();
  }
}



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

// app.post('/save-finished-event', async (req, res) => {
//     const eventData = req.body;
//     const { originalTeamScore, acceptedTeamScore, originalOdds, acceptedOdds, originalUser, secondUser, wagerAmount, acceptedPick, originalPick, eventTime, _id, sportId, leagueName } = eventData;
//
//     try {
//         // Check if an event with the same _id already exists in finishedBets
//         const existingEvent = await finishedBetsCollection.findOne({ _id: _id });
//
//         if (existingEvent) {
//             res.json({ success: false, message: 'Event already exists in finished bets' });
//             return;
//         }
//
//         const scoreWithOdds = (originalTeamScore + originalOdds);
//
//         if (scoreWithOdds > acceptedTeamScore) {
//             eventData.winner = originalUser;
//             eventData.loser = secondUser;
//             eventData.winningTeam = originalPick;
//             eventData.losingTeam = acceptedPick;
//             eventData.winningScore = originalTeamScore;
//             eventData.losingScore = acceptedTeamScore;
//             eventData.winningOdds = originalOdds;
//             eventData.losingOdds = acceptedOdds;
//         } else if (scoreWithOdds < acceptedTeamScore) {
//             eventData.winner = secondUser;
//             eventData.loser = originalUser;
//             eventData.winningTeam = acceptedPick;
//             eventData.losingTeam = originalPick;
//             eventData.winningScore = acceptedTeamScore;
//             eventData.losingScore = originalTeamScore;
//             eventData.winningOdds = acceptedOdds;
//             eventData.losingOdds = originalOdds;
//         }
//
//         // Update wins and losses for winner and loser
//         await updateWinLoss(eventData.winner, true, wagerAmount); // true for a win
//         await updateWinLoss(eventData.loser, false, wagerAmount); // false for a loss
//
//         // Save the event data to the finishedBets collection
//         await finishedBetsCollection.insertOne(eventData);
//
//         // Remove the event from the acceptedBets collection
//         const result = await acceptedBetsCollection.deleteOne({ _id: _id });
//
//         if (result.deletedCount === 1) {
//             res.json({ success: true, message: 'Event moved to finished bets successfully' });
//         } else {
//             throw new Error('Event not found in accepted bets');
//         }
//     } catch (error) {
//         console.error('Error moving event to finished bets:', error);
//         res.status(500).send('Error moving event to finished bets');
//     }
// });

// async function updateWinLoss(username, isWin, wagerAmount) {
//     const user = await usersCollection.findOne({ username: username });
//     if (!user) return;
//
//     let { wins, losses, winnings = 0 } = user; // Initialize winnings if not present
//
//     if (isWin) {
//         wins += 1;
//         winnings += wagerAmount; // Increment winnings for a win
//     } else {
//         losses += 1;
//         winnings -= wagerAmount; // Decrement winnings for a loss
//     }
//
//     const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0;
//
//     await usersCollection.updateOne(
//         { username: username },
//         {
//           $set: { wins: wins, losses: losses, winPct: winPct, winnings: winnings },
//           $inc: { totalRisked: wagerAmount } // Increment totalRisked
//         }
//     );
// }

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
        { firstUser: currentUser },
        { betTaker: currentUser }
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

      // Calculate win percentage for each user
      const groupUsersWithWinPct = groupUsers.map(user => {
      const winPct = calculateWinPercentage(user.wins, user.losses);
      return { ...user, winPct }; // Add winPct property to each user object
    });

      const currentUser = req.user.username;

      // Render the group page with the list of users
      res.render('group-page', { groupUsers: groupUsersWithWinPct, userGroup: userGroup, currentUser: currentUser });
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
        { firstUser: currentUser },
        { betTaker: currentUser }
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

app.post('/create-group', async (req, res) => {
    const { email, group, groupPassword } = req.body;
    console.log(email)
    try {
        const hash = await bcrypt.hash(groupPassword, 10);
        await groupsCollection.insertOne({ email, group, password: hash });
        // Assuming group creation is successful, send back a response indicating success and the groupName
        res.json({ success: true, message: 'Group created successfully.', group: group });
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ success: false, message: 'Server error while creating group.' });
    }
});

app.get('/create-group', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create-group.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
