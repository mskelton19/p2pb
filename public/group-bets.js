document.addEventListener('DOMContentLoaded', () => {
  fetchGroupBets();
  setupTabs();
});
//
async function fetchAcceptedBets() {
  try {
    const response = await fetch('/accepted-bets'); // Route to get accepted bets data
    const data = await response.json();
    console.log(data.acceptedBets)
    displayAcceptedBets(data.acceptedBets);
  } catch (error) {
    console.error('Error fetching accepted bets:', error.message);
  }
}

function setupTabs() {
  const upcomingTab = document.getElementById('tab-upcoming');
  const inProgressTab = document.getElementById('tab-inprogress');
  const finishedTab = document.getElementById('tab-finished');
  const upcomingSection = document.getElementById('upcoming-events-section');
  const inProgressSection = document.getElementById('in-progress-events-section');
  const finishedSection = document.getElementById('finished-events-section');

  // Set 'In Progress' as the default tab
  upcomingSection.style.display = 'none';
  inProgressSection.style.display = '';

  upcomingTab.addEventListener('click', () => {
    upcomingSection.style.display = '';
    inProgressSection.style.display = 'none';
    finishedSection.style.display = 'none';
  });

  inProgressTab.addEventListener('click', () => {
    upcomingSection.style.display = 'none';
    inProgressSection.style.display = '';
    finishedSection.style.display = 'none';
  });

  finishedTab.addEventListener('click', () => {
    finishedSection.style.display = '';
    inProgressSection.style.display = 'none';
    upcomingSection.style.display = 'none';
  });
}

async function displaygroupBets(bets) {
  const upcomingEventsContainer = document.getElementById('upcoming-events');
  const inProgressEventsContainer = document.getElementById('in-progress-events');

  // Clear existing content
  upcomingEventsContainer.innerHTML = '';
  inProgressEventsContainer.innerHTML = '';

  for (const bet of acceptedBets) {
    // Compare eventTime with the current time
    const eventDateTime = new Date(bet.gameTime);
    const now = new Date();

    let bet365Data = null;
    if (eventDateTime < now) {
      // Fetch Bet365 data only if the event has already started
      bet365Data = await fetchBet365Data(bet.eventId);
      console.log(bet365Data)
    }

    // Create the main card element
    const betCard = document.createElement('div');
    betCard.classList.add('bet-card');

    // Add date and time
    const dateTimeDiv = document.createElement('div');
    dateTimeDiv.textContent = bet.gameTime;
    dateTimeDiv.classList.add('date-time');
    betCard.appendChild(dateTimeDiv);

    // Add odds
    const oddsDiv = document.createElement('div');
    oddsDiv.textContent = `${bet.wagerAmount}`;
    oddsDiv.classList.add('odds');
    betCard.appendChild(oddsDiv);

    // Container for team names and user names
    const infoContainer = document.createElement('div');
    infoContainer.classList.add('info-container');


    // Check if bet365Data is valid before accessing its properties
    let originalPickScore = '';
    let acceptedPickScore = '';
    if (bet365Data && bet365Data[2] && bet365Data[3]) {
      console.log("bet365Data:", bet365Data[2].NA, bet365Data[3].NA);
      originalPickScore = bet.originalPick === bet365Data[2].NA ? bet365Data[2].SC : bet365Data[3].SC;
      acceptedPickScore = bet.acceptedPick === bet365Data[2].NA ? bet365Data[2].SC : bet365Data[3].SC;
    }

    // Original pick and first user
    const originalPickDiv = document.createElement('div');
    originalPickDiv.classList.add('team-user');
    originalPickDiv.innerHTML = `<div class="score">${originalPickScore}</div><div>${bet.firstUser}</div><div>${bet.originalPick}</div><div>${bet.originalOdds}</div>`;
    infoContainer.appendChild(originalPickDiv);

    const acceptedPickDiv = document.createElement('div');
    acceptedPickDiv.classList.add('team-user');
    acceptedPickDiv.innerHTML = `<div class="score">${acceptedPickScore}</div><div>${bet.betTaker}</div><div>${bet.acceptedPick}</div><div>${bet.acceptedOdds}</div>`;
    infoContainer.appendChild(acceptedPickDiv);

  betCard.appendChild(infoContainer);

  if (eventDateTime > now) {
    upcomingEventsContainer.appendChild(betCard);
  } else {
    inProgressEventsContainer.appendChild(betCard);
  }
}
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

fetchBet365Results(149564469)

async function fetchBet365Results(eventId) {
  try {
    const response = await fetch(`/bet365-results/${eventId}`);
    if (response.ok) {
      const resultsData = await response.json();
      console.log(resultsData);
      return resultsData;
    } else {
      console.error('Failed to fetch results from server:', response.statusText);
      return null;
    }
  } catch (error) {
    console.error('Error fetching results:', error);
    return null;
  }
}
