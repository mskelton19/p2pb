// public/main.js

document.addEventListener('DOMContentLoaded', () => {
    fetchEvents(12, 10037219);

    let selectedIcon = null;

    const sportIcons = document.querySelectorAll('.sport-icon');
    // console.log("Sport Icons Found:", sportIcons.length); // Log how many icons were found

    sportIcons.forEach(icon => {
        icon.addEventListener('click', function() {
            // console.log("Icon clicked:", this); // Log the clicked icon

            if (selectedIcon) {
                // console.log("Removing highlight from:", selectedIcon);
                selectedIcon.classList.remove('highlighted-icon');
            }

            // console.log("Adding highlight to:", this);
            this.classList.add('highlighted-icon');
            selectedIcon = this;

            const sportId = this.dataset.sportid;
            const leagueId = this.dataset.leagueid;
            fetchEvents(sportId, leagueId);
        });
    });
});


// Retrieve user data from the data attribute
var userData;

let isFetching = false;

async function fetchEvents(sportId, leagueId) {
  if (isFetching) {
    console.log("Fetch in progress. Please wait.");
    return; // Prevent new fetch if one is already in progress
  }

  try {
    isFetching = true;

    let url = '/upcoming-events';
    let params = new URLSearchParams();

    if (sportId) {
      params.append('sportID', sportId);
    }
    if (leagueId) {
      params.append('leagueID', leagueId);
    }
    url += `?${params.toString()}`;

    const eventsContainer = document.getElementById('events-container');
    eventsContainer.innerHTML = ''; // Clear existing results before fetching new data

    const response = await fetch(url);
    const rawData = await response.json();
    // console.log("URL used for fetch:", url);

    // Check if rawData is an object (single event) and convert it to an array
    const eventsData = Array.isArray(rawData) ? rawData : [rawData];

    // use the event ids to get the odds for each game
    for (const event of eventsData[0].results) {
      // Call the server route to get event odds
      const oddsResponse = await fetch(`/bet365-eventodds/${event.id}`);
      const oddsData = await oddsResponse.json();

      // Display the data on the webpage
      displayEventData(event, oddsData);
    }

    window.scrollTo(0, 0); // Scrolls to the top of the page


    isFetching = false; // Reset the flag after processing data
  } catch (error) {
    console.error('Error fetching data:', error.message);
    isFetching = false; // Reset the flag in case of an error
  }
}

// Continue with the rest of your code...





function displayEventData(event, oddsData) {
  // console.log('Displaying event and odds data:', event, oddsData);

  // console.log(event)

  const eventsContainer = document.getElementById('events-container');
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
  const homeOddsCard = createOddsCard(oddsData.handicap, eventCard, event.time, event.sport_id, event.id);
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
  const awayOddsCard = createOddsCard(oddsData.handicap * -1, eventCard, event.time, event.sport_id, event.id);
  awayContainer.appendChild(awayOddsCard);

  // Append the card to the main container
  eventCard.appendChild(awayContainer);

  // Append the card to the main container
  eventsContainer.appendChild(eventCard);
}

// Create the team name cards for each game
function createTeamCard(teamName) {
  const teamCard = document.createElement('div');
  teamCard.classList.add('team-card'); // Add a class for styling

  const teamNameElement = document.createElement('div');
  teamNameElement.textContent = teamName || ''; // Use a default value if teamName is missing
  teamCard.appendChild(teamNameElement);

  return teamCard;
}

// Declare a global variable to store the selected odds card
let selectedOddsCard = null;

function createOddsCard(odds, eventCard, eventTime, sportId, eventId) {

  const oddsCard = document.createElement('div');
  oddsCard.classList.add('odds-card');

  const oddsElement = document.createElement('div');

  // Check if odds are positive and add '+' sign
  const formattedOdds = odds > 0 && !odds.toString().includes('+') ? '+' + odds : odds;

  oddsElement.textContent = formattedOdds || '';
  oddsCard.appendChild(oddsElement);

  oddsCard.dataset.sportId = sportId;
  oddsCard.dataset.eventId = eventId;

  oddsCard.addEventListener('click', () => {
    // Check if there is a previously selected odds card
    if (selectedOddsCard) {
      // Clear the selected class from the previous odds card
      selectedOddsCard.classList.remove('selected');
    }

    // Toggle the selected class for the clicked odds card
    oddsCard.classList.toggle('selected');

    // Update the selected odds card reference
    selectedOddsCard = oddsCard;

    // Show the drawer with team name, odds, and event time
    const teamContainer = oddsCard.closest('.team-container');
    const teamName = teamContainer.querySelector('.team-card').textContent;

    // pass both team names to the drawerOdds
    const homeTeamName = eventCard.dataset.homeTeam;
    const awayTeamName = eventCard.dataset.awayTeam;
    const selectedOdds = oddsCard.classList.contains('selected') ? odds : null;
    // console.log(teamName + ' ' + selectedOdds);

    // Show the drawer with team name, odds, and event time
    if (selectedOdds) {
      showDrawer(homeTeamName, awayTeamName, teamName, selectedOdds, eventTime);
    } else {
      hideDrawer();
    }
  });

  return oddsCard;
}


function getUserTimeZoneDateTime(timestamp) {
  // console.log("Original Timestamp:", timestamp); // For debugging

  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const eventTime = new Date(timestamp * 1000);

  // console.log("Converted Date:", eventTime); // For debugging
  // console.log("User Time Zone:", userTimeZone); // For debugging

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


function showDrawer(homeTeamName, awayTeamName, pick, odds, eventTime) {
  const drawer = document.getElementById('drawer');

  // document.getElementById('drawerTeamNames').textContent = `${awayTeamName} vs ${homeTeamName}`;
  document.getElementById('drawerTeamName').textContent = `${pick}`;
  document.getElementById('drawerOdds').textContent = `${odds}`;

  // Parse eventTime as a Date object
  const parsedEventTime = new Date(parseInt(eventTime));

  // Check if parsedEventTime is a valid date
  // if (!isNaN(parsedEventTime.getTime())) {
  //   document.getElementById('drawerEventTime').textContent = `${getUserTimeZoneDateTime(parsedEventTime)}`;
  // } else {
  //   document.getElementById('drawerEventTime').textContent = 'Invalid Event Time';
  // }

  const teamNames = { homeTeamName, awayTeamName };
  // console.log(getUserTimeZoneDateTime(parsedEventTime))

  // Pass team names to the confirmWager function
  const confirmButton = document.getElementById('confirmButton');
  confirmButton.onclick = function () {
    // confirmWager(teamNames, getUserTimeZoneDateTime(parsedEventTime), username);
    confirmWager2(teamNames, getUserTimeZoneDateTime(parsedEventTime), username);
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
}


// Add this function to handle confirming the wager
function confirmWager(teamNames, eventTime, username) {

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
        eventId: eventId,
      }),
    })
      .then(response => response.json())
      .then(data => {
        console.log('Wager placed:', data.wager);
        // Handle success or show a confirmation message to the user
      })
      .catch(error => {
        console.error('Error placing wager:', error.message);
        // Handle error and show an error message to the user
      });
  } else {
    console.log('Please enter a wager before confirming.');
  }
}

// Add this function to handle confirming the wager
function confirmWager2(teamNames, eventTime, username) {

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
    fetch('/place-wager-2', {
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
        eventId: eventId,
      }),
    })
      .then(response => response.json())
      .then(data => {
        console.log('Wager placed:', data.wager);
        // Handle success or show a confirmation message to the user
      })
      .catch(error => {
        console.error('Error placing wager:', error.message);
        // Handle error and show an error message to the user
      });
  } else {
    console.log('Please enter a wager before confirming.');
  }
}
