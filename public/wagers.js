// wagers.js

document.addEventListener('DOMContentLoaded', () => {
  fetchWagers();
});

var userData;
const currentUser = userData.username;
const userGroup = userData.group;

console.log(userData)

async function fetchWagers() {
  try {
    const response = await fetch('/get-wagers');
    const wagersData = await response.json();

    displayWagers(wagersData.wagers);
  } catch (error) {
    console.error('Error fetching wagers:', error.message);
  }
}

function displayWagers(wagers) {

  const wagersContainer = document.getElementById('wagers-container');
  wagersContainer.classList.add('wagers-container');
  if (!wagersContainer) {
       console.error('Wagers container element not found');
       return;
   }

  wagersContainer.innerHTML = ''; // Clear existing content

  const now = new Date();

  wagers.filter(wager => {
     const eventDateTime = new Date(wager.eventTime); // Convert eventTime to Date object
     return eventDateTime > now && wager.group === userGroup; // Check if event time is in the future and belongs to the user group
   }).forEach(wager => {
     const wagerCard = createWagerCard(wager);
     wagersContainer.appendChild(wagerCard);
  })
};

function createWagerCard(wager) {

    // Create a card for each wager
    const wagerCard = document.createElement('div');
    wagerCard.classList.add('wager-card'); // Use the same class as event-card for similar styling

    // Create and append the date and time header
    const dateTimeHeader = document.createElement('div');
    dateTimeHeader.textContent = wager.eventTime; // Directly use the formatted date and time string
    dateTimeHeader.classList.add('time-wagers');
    wagerCard.appendChild(dateTimeHeader);

    // Create a container for the wager
    const wagerContainer = document.createElement('div');
    wagerContainer.classList.add('wager-container');

   const wagerElement = document.createElement('div');
   wagerElement.textContent = `${wager.wager}`; // Display the wager amount
   wagerElement.classList.add('wager', 'bold', 'larger'); // Add the 'bold' class for bold font
   wagerContainer.appendChild(wagerElement);
   wagerCard.appendChild(wagerContainer);


    // Create a container for the first team
    const takenTeamContainer = document.createElement('div');
    takenTeamContainer.classList.add('team-container');

    // Create first team card
    const takenTeamCard = createTeamCard(wager.teamName);
    takenTeamCard.classList.add('taken-team-card');
    takenTeamContainer.appendChild(takenTeamCard);


    // Create odds card
    const takenOddsCard = createOddsCard(wager.takenOdds, wagerCard, wager.eventTime);
    takenOddsCard.classList.add('taken-odds-card');
    takenTeamContainer.appendChild(takenOddsCard);

    // Append the team container to the wager card
    wagerCard.appendChild(takenTeamContainer);

    // Create a container for the open team
    const openTeamContainer = document.createElement('div');
    openTeamContainer.classList.add('team-container', 'bold'); // Add a class for styling

    // Create open team card
    const openTeamCard = createTeamCard(wager.openTeam);
    openTeamContainer.appendChild(openTeamCard);

    // Create odds card for away team
    const openOddsCard = createOddsCard(wager.openOdds, wagerCard, wager.eventTime);
    openOddsCard.classList.add('open-odds-card');
    openTeamContainer.appendChild(openOddsCard);

    // Append the card to the main container
    wagerCard.appendChild(openTeamContainer);

    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('button-container'); // New class for styling

    // Add a button for taking the other side of the wager
    const takeWagerButton = document.createElement('button');
    takeWagerButton.textContent = 'Take Wager';
    takeWagerButton.classList.add('take-wager-button'); // Add the class to the button
    takeWagerButton.addEventListener('click', () => handleTakeWager2(wager, currentUser, userGroup));
    buttonContainer.appendChild(takeWagerButton);

    wagerCard.appendChild(buttonContainer);

    const usernameElement = document.createElement('div');
    usernameElement.textContent = `${wager.firstUser}`; // Display the username
    usernameElement.classList.add('username'); // Add a class for styling
    wagerContainer.appendChild(usernameElement);

    return wagerCard;
  };

// Reuse or adapt these functions from games.js
function createTeamCard(teamName) {
  const teamCard = document.createElement('div');
  teamCard.classList.add('team-card'); // Ensure this class is defined in your CSS

  const teamNameElement = document.createElement('div');
  teamNameElement.textContent = teamName; // Set the team name text
  teamCard.appendChild(teamNameElement);

  return teamCard; // Return the created DOM node
}

function createOddsCard(odds, eventCard, eventTime) {
  const oddsCard = document.createElement('div');
  oddsCard.classList.add('odds-card'); // Ensure this class is defined in your CSS

  const oddsElement = document.createElement('div');
  oddsElement.textContent = odds.toString(); // Set the odds text
  oddsCard.appendChild(oddsElement);

  return oddsCard; // Return the created DOM node
}

function createDateTimeHeader(timestamp) {
  const header = document.createElement('div');
  header.classList.add('wager-card-header'); // Ensure this class is defined in your CSS

  const formattedDateTime = getUserTimeZoneDateTime(timestamp);
  header.textContent = formattedDateTime; // Set the formatted date and time

  return header; // Return the created DOM node
}

//
// const wagers = [];
//
function handleTakeWager(wager, currentUser, userGroup ) {

  console.log('wagers: ' + wager);
  // Check if the firstUser is the same as the currentUser
  if (wager.firstUser === currentUser) {
    console.error("Can't bet yourself");
    // You can optionally show an error message to the user here
    return; // Exit the function without posting the wager
  }

  // Make an HTTP request to save the wager
  fetch('/accepted-bet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      originalPick: wager.teamName,
      acceptedPick: wager.openTeam,
      originalOdds: wager.takenOdds,
      acceptedOdds: wager.openOdds,
      wagerAmount: wager.wager,
      gameTime: wager.eventTime,
      firstUser: wager.firstUser,
      betTaker: currentUser,
      sportId: wager.sportId,
      eventId: wager.eventId,
      userGroup: userGroup,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log('Bet accepted:', data.bets);
      // Send a request to remove the accepted wager from the server
      fetch('/remove-wager', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(wager), // Send the wager data to identify which wager to remove
      })
        .then((response) => response.json())
        .then((removeData) => {
          if (removeData.success) {
            // Refresh the displayed wagers
            fetchWagers();
          } else {
            console.error('Error removing wager:', removeData.message);
            // Handle error and show an error message to the user
          }
        });
    })
    .catch((error) => {
      console.error('Error placing wager:', error.message);
      // Handle error and show an error message to the user
    });
}

function handleTakeWager2(wager, currentUser, userGroup ) {

  console.log('wagers: ' + wager);
  // Check if the firstUser is the same as the currentUser
  if (wager.firstUser === currentUser) {
    console.error("Can't bet yourself");
    // You can optionally show an error message to the user here
    return; // Exit the function without posting the wager
  }

  // Make an HTTP request to save the wager
  fetch('/accepted-bet-2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      originalPick: wager.teamName,
      acceptedPick: wager.openTeam,
      originalOdds: wager.takenOdds,
      acceptedOdds: wager.openOdds,
      wagerAmount: wager.wager,
      gameTime: wager.eventTime,
      firstUser: wager.firstUser,
      betTaker: currentUser,
      sportId: wager.sportId,
      eventId: wager.eventId,
      userGroup: userGroup,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log('Bet accepted:', data.bets);
      // Send a request to remove the accepted wager from the server
      fetch('/remove-wager', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(wager), // Send the wager data to identify which wager to remove
      })
        .then((response) => response.json())
        .then((removeData) => {
          if (removeData.success) {
            // Refresh the displayed wagers
            fetchWagers();
          } else {
            console.error('Error removing wager:', removeData.message);
            // Handle error and show an error message to the user
          }
        });
    })
    .catch((error) => {
      console.error('Error placing wager:', error.message);
      // Handle error and show an error message to the user
    });
}
