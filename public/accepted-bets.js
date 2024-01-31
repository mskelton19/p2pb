document.addEventListener('DOMContentLoaded', () => {
  fetchAcceptedBets();
  setupTabs();
});

var userData;
const currentUser = userData.username;
const userGroup = userData.group;
//
async function fetchAcceptedBets() {
  try {
    const response = await fetch('/accepted-bets'); // Route to get accepted bets data
    const data = await response.json();
    // console.log(data.acceptedBets)
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
  finishedSection.style.display = 'none';

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

async function displayAcceptedBets(acceptedBets) {
  const upcomingEventsContainer = document.getElementById('upcoming-events');
  const inProgressEventsContainer = document.getElementById('in-progress-events');
  const finishedEventsContainer = document.getElementById('finished-events');

  // Clear existing content
  upcomingEventsContainer.innerHTML = '';
  inProgressEventsContainer.innerHTML = '';
  finishedEventsContainer.innerHTML = '';

  for (const bet of acceptedBets) {
    if(bet.firstUser === currentUser || bet.betTaker === currentUser) {
    const betCard = createBetCard(bet);
    const eventDateTime = new Date(bet.gameTime);
    const now = new Date();

    if (eventDateTime > now) {
      // Event is upcoming
      upcomingEventsContainer.appendChild(betCard);
    } else {
      // Check if the event has finished
      const results = await fetchBet365Results(bet.eventId);
      if (results && isEventFinished(results)) {
        // Event is finished, update final scores
        const sportId = results.results[0].sport_id;
        const finalScores = updateFinalScores(betCard, results, bet, sportId);
        finishedEventsContainer.appendChild(betCard);
        moveEventToFinished(bet.eventId, bet, finalScores);
      } else {
        const liveData = await fetchBet365Data(bet.eventId);
        updateLiveScores(betCard, liveData, bet); // Update the card with scores
        inProgressEventsContainer.appendChild(betCard);
      }
    }
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

function createBetCard(bet) {
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

    // Original pick and first user
    const originalPickDiv = document.createElement('div');
    originalPickDiv.classList.add('team-user', 'original-pick');
    originalPickDiv.innerHTML = `<div>${bet.firstUser}</div><div>${bet.originalPick}</div><div>${bet.originalOdds}</div>`;
    infoContainer.appendChild(originalPickDiv);

    // Accepted pick and bet taker
    const acceptedPickDiv = document.createElement('div');
    acceptedPickDiv.classList.add('team-user', 'accepted-pick');
    acceptedPickDiv.innerHTML = `<div>${bet.betTaker}</div><div>${bet.acceptedPick}</div><div>${bet.acceptedOdds}</div>`;
    infoContainer.appendChild(acceptedPickDiv);

    betCard.appendChild(infoContainer);

    return betCard;
}

function isEventFinished(resultsData) {
  // console.log(resultsData.results[0].time_status);
  return(resultsData.results[0].time_status === '3')
}

async function fetchBet365Results(eventId) {

  try {
    const response = await fetch(`/bet365-results/${eventId}`);
    if (response.ok) {
      const resultsData = await response.json();
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

function updateLiveScores(betCard, liveData, bet) {

  // console.log(liveData);
  // Check if bet365Data is valid before accessing its properties
  let originalPickScore = '';
  let acceptedPickScore = '';
  if (liveData && liveData[2] && liveData[3]) {
    originalPickScore = bet.originalPick === liveData[2].NA ? liveData[2].SC : liveData[3].SC;
    acceptedPickScore = bet.acceptedPick === liveData[2].NA ? liveData[2].SC : liveData[3].SC;
  }

  // Update the bet card with scores
  const originalPickDiv = betCard.querySelector('.original-pick');
  const acceptedPickDiv = betCard.querySelector('.accepted-pick');

  if (originalPickDiv) {
    originalPickDiv.innerHTML = `<div class="score">${originalPickScore}</div><div>${bet.firstUser}</div><div>${bet.originalPick}</div><div>${bet.originalOdds}</div>`;
  }
  if (acceptedPickDiv) {
    acceptedPickDiv.innerHTML = `<div class="score">${acceptedPickScore}</div><div>${bet.betTaker}</div><div>${bet.acceptedPick}</div><div>${bet.acceptedOdds}</div>`;
  }

  // Return the scores
  return {
    originalPickScore,
    acceptedPickScore
  };
}

function updateFinalScores(betCard, resultsData, bet, sportId) {
  sportId = Number(sportId);
  let originalPickScore = '';
  let acceptedPickScore = '';

  if (resultsData && resultsData.results[0]) {
    const finalScores = resultsData.results[0];

    switch(sportId) {
      case 17: // Assuming 17 is for a specific sport
        const scoreData17 = finalScores.scores[5]; // Specific to sportId 17

        originalPickScore = bet.originalPick === finalScores.away.name ? scoreData17.away : scoreData17.home;
        acceptedPickScore = bet.acceptedPick === finalScores.away.name ? scoreData17.away : scoreData17.home;
        break;

      case 18: // For sport_id 18
        const scoreData18 = finalScores.scores[7]; // Specific to sportId 18

        originalPickScore = bet.originalPick === finalScores.away.name ? scoreData18.away : scoreData18.home;
        acceptedPickScore = bet.acceptedPick === finalScores.away.name ? scoreData18.away : scoreData18.home;
        break;

        case 12: // For sport_id 18
          const scoreData12 = finalScores.scores[7]; // Specific to sportId 18

          originalPickScore = bet.originalPick === finalScores.away.name ? scoreData12.away : scoreData12.home;
          acceptedPickScore = bet.acceptedPick === finalScores.away.name ? scoreData12.away : scoreData12.home;
          break;


      // Add cases for other sports with different structures
      // case <otherSportId>:
      //   // Logic for other sports
      //   break;

      default:
        // Default case if sportId doesn't match any specific case
        console.error('Unsupported sportId:', sportId);
        return;
    }
  }

  // Update the bet card with final scores
  const originalPickDiv = betCard.querySelector('.original-pick');
  const acceptedPickDiv = betCard.querySelector('.accepted-pick');

  if (originalPickDiv) {
    originalPickDiv.innerHTML = `<div class="score">${originalPickScore}</div><div>${bet.firstUser}</div><div>${bet.originalPick}</div><div>${bet.originalOdds}</div>`;
  }
  if (acceptedPickDiv) {
    acceptedPickDiv.innerHTML = `<div class="score">${acceptedPickScore}</div><div>${bet.betTaker}</div><div>${bet.acceptedPick}</div><div>${bet.acceptedOdds}</div>`;
  }

  // Return the scores for any further processing
  return {
    originalPickScore,
    acceptedPickScore
  };
}

async function moveEventToFinished(eventId, bet, scores) {

  console.log(bet);

    const eventData = {
      originalPick: bet.originalPick,
      acceptedPick: bet.acceptedPick,
      originalOdds: parseFloat(bet.originalOdds), // Parse as a float
      acceptedOdds: parseFloat(bet.acceptedOdds), // Parse as a float
      originalTeamScore: parseFloat(scores.originalPickScore), // Parse as a float
      acceptedTeamScore: parseFloat(scores.acceptedPickScore), // Parse
      wagerAmount: bet.wagerAmount,
      eventId: eventId,
      originalUser: bet.firstUser,
      secondUser: bet.betTaker,
    }
    // Send a POST request to the server with the event data
    try {
        const response = await fetch('/save-finished-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });

        const result = await response.json();
        if (result.success) {
            console.log('Event data saved successfully');
        } else {
            console.error('Failed to save event data');
        }
    } catch (error) {
        console.error('Error saving event data:', error);
    }
}
