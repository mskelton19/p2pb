document.addEventListener('DOMContentLoaded', () => {
  setupGroupPage();
  setupTabListeners();
  fetchSportsStats();
  fetchUserRecords();
  // startLiveScoreUpdates(); // Start the live score updates
})

// -------------------------group page tabs-------------------------------

function setupTabListeners() {
  document.getElementById('statsTab').addEventListener('click', function() { openTab('stats'); });
  document.getElementById('wagersTab').addEventListener('click', function() { openTab('wagers'); });
  document.getElementById('myBetsTab').addEventListener('click', function() { openTab('myBets'); });
}

function openTab(tabName) {
  // Hide all tab content
  var tabcontent = document.getElementsByClassName("tabcontent");
  Array.from(tabcontent).forEach(function(element) {
    element.style.display = "none";
  });

  // Remove 'active' class from all tab buttons
  var tablinks = document.getElementsByClassName("tablinks");
  Array.from(tablinks).forEach(function(element) {
    element.classList.remove("active");
  });

  // Show the current tab content and add 'active' class to the button
  document.getElementById(tabName).style.display = "block";

  var tabButton = document.getElementById(tabName + 'Tab');
  if (tabButton) {
    tabButton.classList.add("active");
  } else {
    console.error('Tab button not found:', tabName + 'Tab');
  }

  if (tabName === 'myBets') {
    setupMyBetsTabs();
    // Make sure to call fetchAndDisplayMyBets() here to populate the bets
    // fetchAndDisplayMyBets();
    // Automatically open the "Upcoming Bets" sub-tab
    document.getElementById('my-bets-tab-upcoming').click();
  }
}

// -----------------------Open My Bets Tab -------------------------------
function openSubTab(subTabName) {
  // Similar logic to openTab but for handling sub-tabs within My Bets
  var subTabContent = document.getElementsByClassName("sub-tabcontent");
  Array.from(subTabContent).forEach(function(element) {
    element.style.display = "none";
  });

  var subTabLinks = document.getElementsByClassName("sub-tablinks");
  Array.from(subTabLinks).forEach(function(element) {
    element.className = element.className.replace(" active", "");
  });

  document.getElementById(subTabName).style.display = "block";
  // No need for active class adjustment as it's done within the buttons themselves
}


// ------------------------Stats Tab----------------------------------------
function setupGroupPage(){

  console.log(groupUsersData);

  var table = new Tabulator("#group-table", {
    data: groupUsersData,
    columns: [
      { title: "User", field: "username" },
      { title: "Wins", field: "wins" },
      { title: "Losses", field: "losses" },
      {
        title: "Win %",
        field: "winPct",
        formatter: function(cell, formatterParams) {
            var value = cell.getValue();
            return value ? value + '%' : "0%"; // Directly append '%' to the value
          },
        sorter: "number", // Specify the sorter as "number" to ensure correct sorting
        sorterParams: {
          format: { // Provide formatting options
            decimal: ".", // Use dot as decimal separator
            thousand: "", // Don't use thousand separator
          },
        },
      }
    ],
    layout: "fitColumns",
    pagination: "local",
    paginationSize: 10,
    responsiveLayout: "hide",
    tooltips: true,
    addRowPos: "top",
    history: true,
    movableColumns: true,
    initialSort: [ // Specify initial sorting by "Win %" column in descending order
      { column: "winPct", dir: "desc" },
    ],
  })
};


async function fetchSportsStats() {
  try {
    const response = await fetch('/sports-stats');
    if (response.ok) {
      const sportsStats = await response.json();
      console.log('sports stats', sportsStats);
      populateSportsStatsTable(sportsStats);
    } else {
      console.error('Failed to fetch sports stats:', response.statusText);
    }
  } catch (error) {
    console.error('Error fetching sports stats:', error);
  }
}

function populateSportsStatsTable(sportsStats) {
  new Tabulator("#sports-stats-table", {
    data: sportsStats,
    columns: [
      { title: "Sport", field: "leagueName" },
      { title: "Wins", field: "wins" },
      { title: "Losses", field: "losses" },
      {
        title: "Win %",
        field: "winPct",
        formatter: "progress",
        formatterParams: {
          min: 0,
          max: 100,
          color: ["red", "green"],
          legend: (value) => value + '%'
        },
        sorter: "number", // Specify the sorter as "number" to ensure correct sorting
        sorterParams: {
          format: { // Provide formatting options
            decimal: ".", // Use dot as decimal separator
            thousand: "", // Don't use thousand separator
          },
        },
      }
    ],
    layout: "fitColumns",
    tooltips: true,
    initialSort: [ // Specify initial sorting by "Win %" column in descending order
      { column: "winPct", dir: "desc" },
    ],
  });
}

// ----------------------My Bets----------------------------------------

function setupMyBetsTabs() {
  // Assuming you have similar buttons or links acting as tabs within your "My Bets" tab
  const upcomingTab = document.getElementById('my-bets-tab-upcoming');
  const inProgressTab = document.getElementById('my-bets-tab-inprogress');
  const finishedTab = document.getElementById('my-bets-tab-finished');

  // Sections
  const upcomingSection = document.getElementById('my-upcoming-events-section');
  const inProgressSection = document.getElementById('my-in-progress-events-section');
  const finishedSection = document.getElementById('my-finished-events-section');

  // Setting default display setup
 resetMyBetsDisplay();

 // Adding event listeners to each tab
 upcomingTab.addEventListener('click', () => {
   resetMyBetsDisplay();
   upcomingSection.style.display = 'block';
   fetchAcceptedBets('upcoming');
 });

 inProgressTab.addEventListener('click', () => {
   resetMyBetsDisplay();
   inProgressSection.style.display = 'block';
   fetchAcceptedBets('in progress');
 });

 finishedTab.addEventListener('click', () => {
   resetMyBetsDisplay();
   finishedSection.style.display = 'block';
   fetchAcceptedBets('finished');
 });
}

// Utility function to hide all sections and reset tab displays
function resetMyBetsDisplay() {
  document.getElementById('my-upcoming-events-section').style.display = 'none';
  document.getElementById('my-in-progress-events-section').style.display = 'none';
  document.getElementById('my-finished-events-section').style.display = 'none';

  // Optionally, remove the 'active' class from all tabs if you are visually indicating the active tab
  document.querySelectorAll('.my-bets-sub-tab').forEach(tab => tab.classList.remove('active'));
}

async function fetchAcceptedBets(status, currentUser, userGroup) {
  try {
    // Construct the URL with a query parameter for status
    const url = `/accepted-bets?status=${status}&currentUser=${currentUser}&userGroup=${userGroup}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.success) {
      // Determine the sectionId based on the status
      let sectionId = '';
      switch (status) {
        case 'upcoming':
          sectionId = 'my-upcoming-events-section';
          break;
        case 'in progress':
          sectionId = 'my-in-progress-events-section';
          break;
        case 'finished':
          sectionId = 'my-finished-events-section';
          break;
        default:
          console.error('Unknown status:', status);
          return;
      }
      // Directly display the filtered bets
      // displayAcceptedBets(data.acceptedBets, status);
      displayAcceptedBets(data.acceptedBets, sectionId)
    } else {
      console.error('Failed to fetch bets');
    }
  } catch (error) {
    console.error('Error fetching accepted bets:', error.message);
  }
}

function displayAcceptedBets(bets, sectionId) {
  const betsContainer = document.getElementById(sectionId);
  if (!betsContainer) {
    console.error(`Cannot find element with ID ${sectionId}`);
    return;
  }
  betsContainer.innerHTML = ''; // Clear the container

  bets.forEach(bet => {
    const betCard = createBetCard(bet);
    betsContainer.appendChild(betCard);
  });
}


function createBetCard(bet) {
  const card = document.createElement('div');
  card.classList.add('bet-card');

  const gameTime = document.createElement('div');
  gameTime.textContent = `Game Time: ${new Date(bet.gameTime).toLocaleString()}`;
  card.appendChild(gameTime);

  const wagerAmount = document.createElement('div');
  wagerAmount.textContent = `Wager Amount: $${bet.wagerAmount}`;
  card.appendChild(wagerAmount);

  const originalDetails = document.createElement('div');
  originalDetails.innerHTML = `Original Taker: ${bet.firstUser}<br>Original Team: ${bet.originalPick}<br>Original Odds: ${bet.originalOdds}`;
  card.appendChild(originalDetails);

  const acceptedDetails = document.createElement('div');
  acceptedDetails.innerHTML = `Accepted Bet: ${bet.betTaker}<br>Accepted Team: ${bet.acceptedPick}<br>Accepted Odds: ${bet.acceptedOdds}`;
  card.appendChild(acceptedDetails);

  return card;
}

async function fetchBet365Data(eventId) {
  try {
    const response = await fetch(`/bet365-data/${eventId}`);
    if (response.ok) {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error fetching Bet365 data:', error);
    return null;
  }
}



// ----------------------------wagers---------------------------
// wagers.js

document.addEventListener('DOMContentLoaded', () => {
  fetchWagers();
});

var userData;

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
  wagersContainer.innerHTML = ''; // Clear existing content

  // Create and append wager cards for each wager
  const now = new Date();
  wagers.filter(wager => {
    const eventDateTime = new Date(wager.eventTime);
    return eventDateTime > now && wager.group === userGroup;
  }).forEach(wager => {
    const wagerCard = createWagerCard(wager);
    wagersContainer.appendChild(wagerCard);
  });
}

function createWagerCard(wager) {

    // Create a card for each wager
    const wagerCard = document.createElement('div');
    wagerCard.classList.add('wager-card'); // Use the same class as event-card for similar styling
    wagerCard.id = `wager-card-${wager._id}`; // Assign ID here

    // Create and append the date and time header
    const dateTimeHeader = document.createElement('div');
    dateTimeHeader.textContent = wager.eventTime; // Directly use the formatted date and time string
    dateTimeHeader.classList.add('time-wagers');
    wagerCard.appendChild(dateTimeHeader);

    // Create a container for the wager
    // Create a container for the wager and user
   const wagerUserContainer = document.createElement('div');
   wagerUserContainer.classList.add('wager-user-container'); // Add a class for styling

   const wagerElement = document.createElement('div');
   wagerElement.textContent = `$${wager.wager}`;
   wagerElement.classList.add('wager', 'bold'); // Reuse existing classes

   const usernameElement = document.createElement('div');
   usernameElement.textContent = wager.firstUser;
   usernameElement.classList.add('username'); // Reuse existing classes

   // Append wager amount and username to the container
   wagerUserContainer.appendChild(wagerElement);
   wagerUserContainer.appendChild(usernameElement);

   // Append the container to the wager card
   wagerCard.appendChild(wagerUserContainer);

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
    takenTeamCard.classList.add('open-team-card');
    openTeamContainer.appendChild(openTeamCard);

    // Create odds card for away team
    const openOddsCard = createOddsCard(wager.openOdds, wagerCard, wager.eventTime);
    openOddsCard.classList.add('open-odds-card');
    openTeamContainer.appendChild(openOddsCard);

    // Append the card to the main container
    wagerCard.appendChild(openTeamContainer);

    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('button-container'); // New class for styling

    const wagerActionButton = document.createElement('button');
      wagerActionButton.classList.add('wager-action-button');

      if (wager.firstUser === currentUser) {
          // If the current user is the one who placed the wager
          wagerActionButton.textContent = 'Delete Bet';
          wagerActionButton.addEventListener('click', () => deleteWager(wager));
      } else {
          // If the current user is not the one who placed the wager
          wagerActionButton.textContent = 'Take Bet';
          wagerActionButton.addEventListener('click', () => handleTakeWager2(wager, currentUser, userGroup));
      }

      buttonContainer.appendChild(wagerActionButton);
      wagerCard.appendChild(buttonContainer);

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
  oddsCard.classList.add('odds-card');

  const oddsElement = document.createElement('div');

  // Check if odds are valid and format them accordingly
  if (odds !== null && odds !== undefined) {
    const formattedOdds = odds > 0 ? `+${odds}` : odds.toString();
    oddsElement.textContent = formattedOdds;
  } else {
    oddsElement.textContent = "N/A"; // Display "N/A" if odds are invalid
  }

  oddsCard.appendChild(oddsElement);

  return oddsCard;
}


function createDateTimeHeader(timestamp) {
  const header = document.createElement('div');
  header.classList.add('wager-card-header'); // Ensure this class is defined in your CSS

  const formattedDateTime = getUserTimeZoneDateTime(timestamp);
  header.textContent = formattedDateTime; // Set the formatted date and time

  return header; // Return the created DOM node
}





function handleTakeWager2(wager, currentUser, userGroup ) {

  console.log('wagers: ' + wager.bet365Id);
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
      eventId: wager.bet365Id,
      userGroup: userGroup,
      leagueName: wager.leagueName,
      status: "upcoming",
      _id: wager._id
    }),
  })
  .then(response => response.json())
  .then(data => {
      if (data.success) {
          // Remove the wager card from the UI
          const wagerCardElement = document.getElementById(`wager-card-${wager._id}`);
          if (wagerCardElement) {
              wagerCardElement.remove();
          } else {
              console.error('Wager card element not found');
          }
      } else {
          console.error('Error processing wager:', data.message);
      }
  })
  .catch(error => {
      console.error('Error processing wager:', error.message);
  });
}


async function fetchUserRecords() {
    try {
        const response = await fetch('/user-record-against-others');
        const data = await response.json();
        if (data.success) {
            displayUserRecords(data.userRecords);
        } else {
            console.error('Failed to fetch user records:', data.message);
        }
    } catch (error) {
        console.error('Error fetching user records:', error.message);
    }
}

function displayUserRecords(userRecords) {
    // Parse winPercentage as a number
    userRecords.forEach(record => {
        record.winPercentage = parseFloat(record.winPercentage);
    });

    // Initialize Tabulator for the user records table
    new Tabulator("#user-records-table", {
        data: userRecords,
        layout: "fitColumns",
        columns: [
            { title: "Opponent", field: "opponent" },
            { title: "Wins", field: "wins" },
            { title: "Losses", field: "losses" },
            {
                title: "Win %",
                field: "winPercentage",
                formatter: "progress", // Use the progress formatter
                formatterParams: {
                    min: 0,
                    max: 100,
                    color: ["red", "green"],
                    legend: (value) => value + '%' // Add percentage symbol to legend
                }
            }
        ],
        initialSort: [ // Sort by win percentage column in descending order
            { column: "winPercentage", dir: "desc" }
        ]
    });
}

function deleteWager(wager) {
    fetch('/remove-wager', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wagerId: wager._id }), // Send the unique identifier of the wager
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Remove the wager card from the UI
            document.getElementById(`wager-card-${wager._id}`).remove();
        } else {
            console.error('Error deleting wager:', data.message);
            // Optionally, display an error message to the user
        }
    })
    .catch(error => {
        console.error('Error deleting wager:', error.message);
        // Optionally, display an error message to the user
    });
}

async function fetchBet365Data(eventId) {
  try {
    const response = await fetch(`/bet365-data/${eventId}`);
    if (response.ok) {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error fetching Bet365 data:', error);
    return null;
  }
}
