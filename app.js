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
  const daily = Math.floor(budget * .20);
  const currency = new Intl.NumberFormat('en', {style:'currency', currency:data.currency});
  const money = value => currency.format(value);
  const result = byId('result');
  const metrics = element('div', '', 'metrics');
  for (const [label, value] of [['Flights',flight],['Accommodation',stay],['Food and transport',daily],['Reserve',budget-flight-stay-daily]]) {
    const card = element('div', '', 'metric');
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
    element('p', 'Suggested spending limits. Live flight fares and hotel rates are unavailable in this version.'),
    metrics,
    element('p', 'Flights: aim for ' + money(flight / people) + ' per traveler, including baggage. Compare nearby departure dates and total fares.'),
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
