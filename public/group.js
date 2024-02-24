document.addEventListener('DOMContentLoaded', () => {
  setupGroupPage();
  setupTabListeners();
  fetchSportsStats();
  fetchUserRecords();
  // startLiveScoreUpdates(); // Start the live score updates
})

let isFetching = false;

// -------------------------group page tabs-------------------------------

function setupTabListeners() {
  document.getElementById('statsTab').addEventListener('click', function() { openTab('stats'); });
  document.getElementById('wagersTab').addEventListener('click', function() { openTab('wagers'); });
  document.getElementById('myBetsTab').addEventListener('click', function() { openTab('myBets'); });
  document.getElementById('createBetTab').addEventListener('click', function() { openTab('createBet'); }); // Now active
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

  var tab = document.getElementById(tabName);
  if (tab) {
    console.log("Showing tab content for:", tabName);
    tab.style.display = "block";
  } else {
    console.error("Tab content not found for ID:", tabName);
  }

  var tabButton = document.getElementById(tabName + 'Tab');
  console.log(tabName);
  if (tabButton) {
    tabButton.classList.add("active");
  } else {
    console.error('Tab button not found:', tabName + 'Tab');
  }

  // Find the floating action button
   var floatingActionButton = document.querySelector('.floating-button');
   if (floatingActionButton) {
       // Hide the button when 'Create Bet' tab is selected, show it otherwise
       if (tabName === 'createBet') {
           floatingActionButton.style.display = 'none';
       } else {
           floatingActionButton.style.display = 'block';
       }
   }

  if (tabName === 'wagers') {
    fetchWagers(); // This function should update the content of the wagers tab
  }

  if (tabName === 'myBets') {
    setupMyBetsTabs();
    // Make sure to call fetchAndDisplayMyBets() here to populate the bets
    // fetchAndDisplayMyBets();
    // Automatically open the "Upcoming Bets" sub-tab
    document.getElementById('my-bets-tab-upcoming').click();
  }

  if (tabName === 'createBet') {
        setupCreateBetTab(); // Initialize or refresh the content for "Create Bet"
        fetchEventsForCreateBet(18, 10042997); // Example: Fetch NFL events as the tab is opened
  }
}

function setupCreateBetTab() {
    const createBetSportIcons = document.querySelectorAll('#createBet-sports-icons-container .createBet-sport-icon');
    createBetSportIcons.forEach(icon => {
        icon.addEventListener('click', function() {
          if (isFetching) {
                console.log("Fetch in progress. Please wait.");
                return; // Exit if a fetch is already in progress
            }
            createBetSportIcons.forEach(icon => icon.classList.remove('highlighted-icon'));
            this.classList.add('highlighted-icon');
            const sportId = this.dataset.sportid;
            const leagueId = this.dataset.leagueid;
            fetchEventsForCreateBet(sportId, leagueId);
        });
    });
}


async function fetchEventsForCreateBet(sportId, leagueId) {
    if (isFetching) return; // Double-check to prevent concurrent fetches
    isFetching = true; // Indicate that fetching is in progress

    const eventsContainer = document.getElementById('createBet-events-container');
    eventsContainer.innerHTML = ''; // Clear previous content

    try {
        let url = '/upcoming-events';
        let params = new URLSearchParams({ sportID: sportId, leagueID: leagueId });
        url += `?${params.toString()}`;

        const response = await fetch(url);
        const rawData = await response.json();

        console.log('rawaData', rawData)

        const eventsData = Array.isArray(rawData) ? rawData : [rawData];
        for (const event of eventsData[0].results) {
            const oddsResponse = await fetch(`/bet365-eventodds/${event.id}`);
            const oddsData = await oddsResponse.json();
            // Adapt displayEventData function to work within "Create Bet" context
            displayEventData(event, oddsData);
        }
    } catch (error) {
        console.error('Error fetching data:', error.message);
    } finally {
      isFetching = false;
    }
}

function displayEventData(event, oddsData) {

  const eventsContainer = document.getElementById('createBet-events-container');
  eventsContainer.classList.add('events-container');

  // Create a card for each event
  const eventCard = document.createElement('div');
  eventCard.classList.add('event-card');

  eventCard.dataset.awayTeam = event.home.name;
  eventCard.dataset.homeTeam = event.away.name;
  eventCard.dataset.eventTime = event.time;

  // Display the formatted date and time in the user's timezone
  const dateTimeElement = document.createElement('div');
  const userTimeZoneDateTime = getUserTimeZoneDateTime(event.time);
  dateTimeElement.textContent = userTimeZoneDateTime;
  dateTimeElement.dataset.eventTime = event.time;  // Set the dataset attribute
  dateTimeElement.classList.add('time');
  eventCard.appendChild(dateTimeElement);

  // Create a container for the home team
  const homeContainer = document.createElement('div');
  homeContainer.classList.add('team-container'); // Add a class for styling

  // Create home team card
  const homeTeamCard = createTeamCard(event.home.name);
  homeContainer.appendChild(homeTeamCard);

  // Create odds card for home team
  const homeOddsCard = createOddsCard(oddsData.handicap, eventCard, event.time, event.sport_id, event.id, event.league.name);
  homeContainer.appendChild(homeOddsCard);

  // Append the home container to the event card
  eventCard.appendChild(homeContainer);

  // Create a container for the away team
  const awayContainer = document.createElement('div');
  awayContainer.classList.add('team-container'); // Add a class for styling

  // Create away team card
  const awayTeamCard = createTeamCard(event.away.name);
  awayContainer.appendChild(awayTeamCard);

  // Create odds card for away team
  const awayOddsCard = createOddsCard(oddsData.handicap * -1, eventCard, event.time, event.sport_id, event.id, event.league.name);
  awayContainer.appendChild(awayOddsCard);

  // Append the card to the main container
  eventCard.appendChild(awayContainer);

  // Append the card to the main container
  eventsContainer.appendChild(eventCard);
}

function getUserTimeZoneDateTime(timestamp) {

  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const eventTime = new Date(timestamp * 1000);

  // Define the formatting options
  const dateFormatOptions = {
    timeZone: userTimeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };

  const timeFormatOptions = {
    timeZone: userTimeZone,
    hour: 'numeric',
    minute: 'numeric',
  };

  // Format the date and time
  const userTimeZoneDate = eventTime.toLocaleString('en-US', dateFormatOptions);
  const userTimeZoneTime = eventTime.toLocaleString('en-US', timeFormatOptions);

  // Concatenate date and time into a single string
  return `${userTimeZoneDate} ${userTimeZoneTime}`;
}

function processQueue() {
    if (requestQueue.length === 0) {
        isProcessing = false;
        // Optionally, hide a loading screen if you have one
        return;
    }

    isProcessing = true;
    const { sportId, leagueId } = requestQueue.shift(); // Dequeue the first request

    fetchEventsForCreateBet(sportId, leagueId).then(() => {
        isProcessing = false; // Mark processing as complete
        if (requestQueue.length > 0) {
            processQueue(); // Process the next request in the queue
        }
    });
}


var selectedOddsCard = null;

function createOddsCard(odds, eventCard, eventTime, sportId, eventId, leagueName) {
    const oddsCard = document.createElement('div');
    oddsCard.classList.add('odds-card');

    const oddsElement = document.createElement('div');
    const formattedOdds = odds > 0 && !odds.toString().includes('+') ? '+' + odds : odds;
    oddsElement.textContent = formattedOdds || '';
    oddsCard.appendChild(oddsElement);

    oddsCard.dataset.sportId = sportId;
    oddsCard.dataset.eventId = eventId;

    oddsCard.addEventListener('click', () => {
      console.log('odds card clicked')
        if (selectedOddsCard) {
            selectedOddsCard.classList.remove('selected');
        }
        oddsCard.classList.toggle('selected');
        selectedOddsCard = oddsCard;

        // Adapt the drawer opening functionality
        const teamContainer = oddsCard.closest('.team-container');
        const teamName = teamContainer.querySelector('.team-card').textContent;

        // Adapt these variables to match the data you want to display
        const homeTeamName = eventCard.dataset.homeTeam;
        const awayTeamName = eventCard.dataset.awayTeam;

        // Call a function to open the drawer
        showDrawer(homeTeamName, awayTeamName, teamName, formattedOdds, eventTime, leagueName);
    });

    return oddsCard;
}


function showDrawer(homeTeamName, awayTeamName, pick, odds, eventTime, leagueName) {
  const drawer = document.getElementById('drawer');

  const formattedOdds = odds > 0 ? `${odds}` : odds;
  console.log(formattedOdds);

  // document.getElementById('drawerTeamNames').textContent = `${awayTeamName} vs ${homeTeamName}`;
  document.getElementById('drawerTeamName').textContent = `${pick}`;
  document.getElementById('drawerOdds').textContent = `${odds}`;

  // Parse eventTime as a Date object
  const parsedEventTime = new Date(parseInt(eventTime));

  const teamNames = { homeTeamName, awayTeamName };
  // console.log(getUserTimeZoneDateTime(parsedEventTime))

  // Pass team names to the confirmWager function
  const confirmButton = document.getElementById('confirmButton');
  confirmButton.onclick = function () {
    // confirmWager(teamNames, getUserTimeZoneDateTime(parsedEventTime), username);
    confirmWager2(teamNames, getUserTimeZoneDateTime(parsedEventTime), currentUser, leagueName);
  };

  drawer.style.height = 'auto';
}


// Add this function to handle hiding the drawer
function hideDrawer() {
  // Get the drawer element
  const drawer = document.getElementById('drawer');

  // Hide the drawer by setting its height to 0
  drawer.style.height = '0';

  // Clear the content inside the drawer
  document.getElementById('drawerTeamName').textContent = '';
  document.getElementById('drawerOdds').textContent = '';
  document.getElementById('wagerInput').value = '';

  if (selectedOddsCard) {
    selectedOddsCard.classList.remove('selected');
    selectedOddsCard = null; // Reset the selectedOddsCard variable
  }
}

// Add this function to handle confirming the wager
function confirmWager2(teamNames, eventTime, username, leagueName, group) {

  // console.log(group)
  console.log(group)

  // Pass along original pick
  const drawerTeamName = document.getElementById('drawerTeamName').textContent;
  // Pass along taken odds
  const drawerOdds = document.getElementById('drawerOdds').textContent;
  // Pass along wager amount
  const wagerInput = document.getElementById('wagerInput').value.trim();
  // Pass along available team
  const otherTeamName = teamNames.homeTeamName === drawerTeamName ? teamNames.awayTeamName : teamNames.homeTeamName;

  const gameTime = eventTime;

  const sportId = selectedOddsCard.dataset.sportId;
  const eventId = selectedOddsCard.dataset.eventId;

  // Save the wager
  if (wagerInput !== '') {
    fetch('/place-wager', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        teamName: drawerTeamName,
        openTeam: otherTeamName,
        takenOdds: parseFloat(drawerOdds),
        openOdds: (drawerOdds * -1),
        wager: parseFloat(wagerInput),
        eventTime: gameTime,
        firstUser: username,
        group: userGroup,
        sportId: sportId,
        bet365Id: eventId,
        leagueName: leagueName,
      }),
    })
      .then(response => response.json())
      .then(data => {
        console.log('Wager placed:', data.wager);
        hideDrawer();
        showToast('Wager placed successfully!');
        // Handle success or show a confirmation message to the user
      })
      .catch(error => {
        console.error('Error placing wager:', error.message);
        // Handle error and show an error message to the user
      });
  } else {
    console.log('Please enter a wager before confirming.');
    showToast('Error placing wager. Please try again.');
  }
}

function showToast(message, duration = 3000) {
  // Create toast element
  const toast = document.createElement('div');
  toast.classList.add('toast-message');
  toast.textContent = message;

  // Append toast to the body
  document.body.appendChild(toast);

  // Remove toast after 'duration' milliseconds
  setTimeout(() => {
    toast.remove();
  }, duration);
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
   fetchAcceptedBets('upcoming', currentUser, userGroup);
 });

 inProgressTab.addEventListener('click', () => {
   resetMyBetsDisplay();
   inProgressSection.style.display = 'block';
   fetchAcceptedBets('in progress', currentUser, userGroup);
 });

 finishedTab.addEventListener('click', () => {
   resetMyBetsDisplay();
   finishedSection.style.display = 'block';
   fetchFinishedBets();
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

async function fetchFinishedBets() {
  console.log('in finished bets')

  try {
    const response = await fetch('/finished-bets');
    const data = await response.json();

    console.log(data);

    if (data.success) {
      // Assuming 'my-finished-events-section' is the ID of the container for finished bets
      displayAcceptedBets(data.finishedBets, 'my-finished-events-section');
    } else {
      console.error('Failed to fetch finished bets:', data.error);
    }
  } catch (error) {
    console.error('Error fetching finished bets:', error);
  } finally {
    isFetching = false; // Reset fetching state
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
    const takenOddsCard = createWagerOddsCard(wager.takenOdds, wagerCard, wager.eventTime);
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
    const openOddsCard = createWagerOddsCard(wager.openOdds, wagerCard, wager.eventTime);
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

  function createWagerOddsCard(odds, eventCard, eventTime) {
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

// Reuse or adapt these functions from games.js
function createTeamCard(teamName) {
  const teamCard = document.createElement('div');
  teamCard.classList.add('team-card'); // Ensure this class is defined in your CSS

  const teamNameElement = document.createElement('div');
  teamNameElement.textContent = teamName; // Set the team name text
  teamCard.appendChild(teamNameElement);

  return teamCard; // Return the created DOM node
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
