const byId = id => document.getElementById(id);
const trip = byId('trip');
const auth = byId('auth');
const form = byId('auth-form');
const filePreview = location.protocol === 'file:';
const serverNote = 'Start server.py and open http://127.0.0.1:8000 to sign in and build a trip plan.';
let account;
let mode;

const codes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ');
const regions = new Intl.DisplayNames(['en'], {type:'region'});
const countries = new Map(codes.map(code => [code, regions.of(code)]).sort((a,b) => a[1].localeCompare(b[1])));
for (const [code, name] of countries) trip.elements.country.add(new Option(name, code));

async function api(path, data) {
  const response = await fetch('/api/' + path, data === undefined ? {} : {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}

function setAccount(user) {
  account = user;
  byId('login').hidden = byId('signup').hidden = Boolean(user);
  byId('logout').hidden = !user;
  byId('account-note').textContent = user ? 'Signed in as ' + user.name : 'Create an account or log in to generate a plan.';
  if (user && !trip.elements.name.value) trip.elements.name.value = user.name;
}

function openAuth(nextMode) {
  mode = nextMode;
  const signup = mode === 'signup';
  byId('auth-name').hidden = !signup;
  form.elements.name.required = signup;
  form.elements.password.autocomplete = signup ? 'new-password' : 'current-password';
  byId('auth-title').textContent = signup ? 'Create an account' : 'Log in';
  byId('auth-submit').textContent = signup ? 'Sign up' : 'Log in';
  byId('auth-switch').textContent = signup ? 'Already have an account? Log in' : 'New here? Sign up';
  byId('auth-message').textContent = '';
  if (filePreview) byId('auth-message').textContent = serverNote;
  byId('auth-submit').disabled = filePreview;
  if (!auth.open) auth.showModal();
}

byId('login').onclick = () => openAuth('login');
byId('signup').onclick = () => openAuth('signup');
byId('start').onclick = () => {
  byId('planner').scrollIntoView({block:'start'});
  trip.elements.name.focus({preventScroll:true});
};
auth.querySelector('.close').onclick = () => auth.close();
auth.addEventListener('close', () => form.reset());
byId('auth-switch').onclick = () => openAuth(mode === 'signup' ? 'login' : 'signup');
form.onsubmit = async event => {
  event.preventDefault();
  const submit = byId('auth-submit');
  submit.disabled = true;
  try {
    setAccount((await api(mode, Object.fromEntries(new FormData(form)))).user);
    auth.close();
    byId('start').click();
  } catch (error) {
    byId('auth-message').textContent = error.message;
  } finally {
    submit.disabled = false;
  }
};
byId('logout').onclick = async () => {
  try {
    await api('logout', {});
    setAccount(null);
    trip.reset();
    updateReturnDate();
    updateParty();
    byId('result').replaceChildren();
    byId('result').hidden = true;
    byId('login').focus();
  } catch (error) {
    byId('account-note').textContent = error.message;
  }
};

function updateParty() {
  const family = trip.elements.group.value === 'family';
  byId('party-label').hidden = !family;
  trip.elements.party.disabled = !family;
}
trip.elements.group.onchange = updateParty;

function element(tag, message, className) {
  const item = document.createElement(tag);
  item.textContent = message;
  if (className) item.className = className;
  return item;
}

const calendar = new Intl.DateTimeFormat('en', {dateStyle:'medium', timeZone:'UTC'});
const localToday = new Date();
localToday.setMinutes(localToday.getMinutes() - localToday.getTimezoneOffset());
trip.elements.departure.min = localToday.toISOString().slice(0, 10);

function returnDate(departure, days) {
  const date = new Date(departure + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days - 1);
  return date.toISOString().slice(0, 10);
}

function updateReturnDate() {
  const {departure, days} = trip.elements;
  byId('return-date').textContent = departure.value && departure.validity.valid && days.validity.valid
    ? 'Return date: ' + calendar.format(new Date(returnDate(departure.value, Number(days.value))))
    : '';
}
trip.addEventListener('input', updateReturnDate);

const departureAirports = {
  delhi:'DEL', 'new delhi':'DEL', 'delhi ncr':'DEL', mumbai:'BOM', bangalore:'BLR',
  bengaluru:'BLR', hyderabad:'HYD', chennai:'MAA', kolkata:'CCU', kochi:'COK',
};
const destinationCities = {SG:'Singapore'};
const cityCodes = {...departureAirports, singapore:'SIN'};
function airportCode(place) {
  const name = place.trim().toLowerCase();
  return Object.hasOwn(cityCodes, name) ? cityCodes[name] : /^[a-z]{3}$/.test(name) ? name.toUpperCase() : '';
}
let autoDestination = '';
trip.elements.country.addEventListener('change', () => {
  const destination = trip.elements.destination;
  if (!destination.value || destination.value === autoDestination) {
    autoDestination = destinationCities[trip.elements.country.value] || '';
    destination.value = autoDestination;
  }
});

function flightDuration(value) {
  if (typeof value === 'string') {
    const parts = value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?$/);
    if (!parts) return '';
    value = Number(parts[1] || 0) * 1440 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
  }
  if (!Number.isFinite(value) || value <= 0) return '';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return [hours ? hours + 'h' : '', minutes ? minutes + 'm' : ''].filter(Boolean).join(' ');
}

function flightCard(offer, budgetCurrency, cap) {
  const card = element('article', '', 'offer');
  const itinerary = element('div', '', 'offer-itinerary');
  offer.slices.forEach((slice, index) => {
    const first = slice[0];
    const last = slice.at(-1);
    if (!first || !last) return;
    const direction = element('section', '', 'offer-direction');
    const route = element('div', '', 'offer-route');
    for (const [airport, timestamp] of [[first.origin, first.departure], [last.destination, last.arrival]]) {
      const endpoint = element('div', '', 'offer-endpoint');
      endpoint.append(element('strong', timestamp.slice(11, 16)),
        element('span', airport + ' · ' + calendar.format(new Date(timestamp.slice(0, 10)))));
      route.append(endpoint);
    }
    const summary = [slice.length === 1 ? 'Nonstop' : (slice.length - 1) + (slice.length === 2 ? ' stop' : ' stops'),
      flightDuration(offer.durations?.[index])].filter(Boolean).join(' · ');
    const carriers = [...new Set(slice.map(segment => segment.carrier))].join(' / ');
    direction.append(element('h5', index === 0 ? 'Outbound' : 'Return'), route,
      element('p', summary, 'offer-meta'), element('p', carriers, 'offer-meta'));
    if (slice.length > 1) {
      direction.append(element('p', 'Via ' + slice.slice(0, -1).map(segment => segment.destination).join(', '), 'offer-meta'));
    }
    itinerary.append(direction);
  });
  const price = element('div', '', 'offer-price');
  const formatted = new Intl.NumberFormat('en-IN', {style:'currency', currency:offer.currency}).format(Number(offer.amount));
  price.append(element('h4', formatted), element('p', 'Round-trip total', 'offer-meta'));
  if (offer.sellers?.length) price.append(element('p', offer.sellers.join(' + '), 'offer-seller'));
  if (offer.currency === budgetCurrency && Number(offer.amount) <= cap) {
    price.append(element('p', 'Within flight budget', 'offer-meta'));
  }
  if (offer.bookingUrl) {
    const booking = element('a', 'View fare', 'primary');
    Object.assign(booking, {href:offer.bookingUrl, target:'_blank', rel:'noopener noreferrer'});
    price.append(booking);
  }
  card.append(itinerary, price);
  return card;
}

function matchesFlightDates(offer, departure, inbound) {
  return offer.slices.length === 2 &&
    offer.slices[0][0]?.departure?.slice(0, 10) === departure &&
    offer.slices[1][0]?.departure?.slice(0, 10) === inbound;
}

function flightSearch(data, people, inbound, cap, money) {
  const details = element('details', '', 'flight-search');
  details.id = 'flight-search';
  details.open = true;
  details.append(element('summary', 'Round-trip flights'));
  const country = countries.get(data.country);
  const originCode = airportCode(data.origin);
  const arrival = data.destination.trim();
  const destinationCode = data.country === 'SG' && arrival.toLowerCase() === 'singapore'
    ? 'SIN' : /^[a-z]{3}$/i.test(arrival) ? arrival.toUpperCase() : '';
  const dates = 'Depart ' + calendar.format(new Date(data.departure)) +
    ' · Return ' + calendar.format(new Date(inbound));
  const route = data.origin + ' to ' + data.destination + (arrival.toLowerCase() === country.toLowerCase() ? '' : ', ' + country);

  const links = element('ul', '', 'fare-sources');
  function addLink(label, href) {
    const item = document.createElement('li');
    const link = element('a', label);
    Object.assign(link, {href, target:'_blank', rel:'noopener noreferrer'});
    item.append(link);
    links.append(item);
  }
  if (originCode && destinationCode) {
    const datePath = date => date.slice(2).replaceAll('-', '');
    const params = new URLSearchParams({adultsv2:people, cabinclass:'economy', sortby:'cheapest', currency:'INR'});
    if (Number(data.age) < 18) {
      params.set('adultsv2', people - 1);
      params.set('childrenv2', data.age);
    }
    addLink('Search these dates on Skyscanner', 'https://www.skyscanner.co.in/transport/flights/' +
      [originCode.toLowerCase(), destinationCode.toLowerCase(), datePath(data.departure), datePath(inbound)].join('/') + '/?' + params);
  }
  addLink('Search Google Flights', 'https://www.google.com/travel/flights?q=' + encodeURIComponent(
    'Round trip flights from ' + data.origin + ' to ' + data.destination + ', ' + country +
    ' departing ' + data.departure + ' returning ' + inbound + ' for ' + people + ' travelers'));

  const status = element('p', 'Searching for fares…', 'note');
  status.setAttribute('role', 'status');
  const offers = element('div', '', 'offers');
  details.append(element('p', route + ' · ' + dates + ' · Flight budget ' + money(cap)), status, offers, links);

  api('flights', {
    origin:originCode || data.origin, destination:destinationCode || data.destination,
    country:data.country, countryName:country, departure:data.departure, inbound, people, age:Number(data.age),
  }).then(response => {
    const matchingOffers = response.offers.filter(offer => matchesFlightDates(offer, data.departure, inbound));
    const count = matchingOffers.length;
    const summary = count
      ? count + ' round-trip offers from ' + response.provider + ' · Cheapest first within each currency · Total for all travelers'
      : 'No round-trip offers from ' + response.provider + ' for these exact dates.';
    status.textContent = summary + (response.complete ? '' : ' Some sellers may still be responding.');
    for (const offer of matchingOffers) offers.append(flightCard(offer, data.currency, cap));
  }).catch(error => {
    status.textContent = error.message;
  });
  return details;
}

trip.onsubmit = event => {
  event.preventDefault();
  if (!account) {
    openAuth('signup');
    return;
  }
  const data = Object.fromEntries(new FormData(trip));
  const family = data.group === 'family';
  const people = family ? Number(data.party) : 1;
  const days = Number(data.days);
  const budget = Number(data.budget);
  const flight = Math.floor(budget * (family ? .4 : .45));
  const stay = Math.floor(budget * (family ? .35 : .30));
  const food = Math.floor(budget * .12);
  const transport = Math.floor(budget * .08);
  const inbound = returnDate(data.departure, days);
  const currency = new Intl.NumberFormat('en', {style:'currency', currency:data.currency});
  const money = value => currency.format(value);
  const result = byId('result');
  const metrics = element('div', '', 'metrics');
  const flights = flightSearch(data, people, inbound, flight, money);
  for (const [label, value] of [['Flights',flight],['Accommodation',stay],['Public transport',transport],['Food',food],['Reserve',budget-flight-stay-food-transport]]) {
    const card = element(label === 'Flights' ? 'button' : 'div', '', 'metric');
    if (label === 'Flights') {
      card.type = 'button';
      card.setAttribute('aria-controls', flights.id);
      card.setAttribute('aria-expanded', String(flights.open));
      card.onclick = () => {
        flights.open = true;
        flights.querySelector('summary').focus();
      };
      flights.ontoggle = () => card.setAttribute('aria-expanded', String(flights.open));
    }
    card.append(element('span', label), element('strong', money(value)));
    metrics.append(card);
  }
  const itinerary = element('ol', '');
  itinerary.append(element('li', 'Day 1: Arrive, check in, and explore the area around your stay.'));
  if (days > 2) itinerary.append(element('li', 'Middle days: Group nearby sights into each day and use public transport where practical.'));
  itinerary.append(element('li', 'Final day: Leave time for checkout and your airport transfer.'));
  result.replaceChildren(
    element('h3', data.name + '’s trip to ' + countries.get(data.country)),
    element('p', days + ' days · ' + people + (people === 1 ? ' traveler' : ' travelers') + ' · Departing from ' + data.origin),
    element('p', calendar.formatRange(new Date(data.departure), new Date(inbound)) + ' · Suggested spending limits'),
    metrics,
    flights,
    element('p', 'Flights: aim for ' + money(flight / people) + ' per traveler, including baggage. Check the total fare and baggage allowance.'),
    element('p', 'Stay: aim for ' + money(stay / (days - 1)) + ' per night for the whole group. ' + (family ? 'Compare family rooms and apartments with kitchens.' : 'Compare private rooms and hostels near public transport.')),
    itinerary,
  );
  result.hidden = false;
  result.focus();
};

byId('google-auth').onclick = () => {
  location.assign('http://127.0.0.1:' + (location.port || '80') + '/auth/google/start');
};

const googleStatus = new URLSearchParams(location.search).get('google');
const googleMessages = {
  unavailable: 'Google sign-in requires local setup.',
  expired: 'The sign-in request expired. Please try again.',
  cancelled: 'Google sign-in was cancelled.',
  failed: 'Google sign-in failed. Please try again.',
  existing: 'This email already has a password account. Log in with your password.',
};
if (googleStatus) history.replaceState(null, '', location.pathname);

if (filePreview) {
  byId('account-note').textContent = serverNote;
} else {
  api('session').then(({user, googleEnabled}) => {
    setAccount(user);
    byId('google-auth').disabled = !googleEnabled;
    byId('google-status').hidden = Boolean(googleEnabled);
    if (googleStatus === 'success' && user) byId('start').click();
    if (Object.hasOwn(googleMessages, googleStatus)) {
      openAuth(googleStatus === 'existing' ? 'login' : 'signup');
      byId('auth-message').textContent = googleMessages[googleStatus];
    }
  }).catch(() => {
    byId('account-note').textContent = 'Could not reach the local server. Refresh to try again.';
  });
}
