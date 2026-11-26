# Budget Traveller

Run from Terminal with Python 3. No third-party Python packages are required.

```sh
cd "$HOME/Desktop/Budget Traveller"
python3 server.py
```

Open http://127.0.0.1:8000 in a browser. If the port is busy, use
`python3 server.py --port 8001` and open http://127.0.0.1:8001.

Create a local account, log in, and complete the trip form. The planner
allocates the total budget across flights, accommodation, daily expenses,
and a reserve. It calculates per-traveler and per-night limits and outlines
a basic itinerary. Prices are spending targets. Live price comparison
would require flight and hotel data providers, travel dates, and destination
city or airport details.

The local SQLite database is created on first launch. It stores account
names, emails, salted password hashes, and hashed session tokens.
Trip details stay in the browser for the current page. This server is
intended for local development.

[Photo by Salmen Bejaoui on Unsplash](https://unsplash.com/photos/brown-wooden-dock-on-lake-near-mountain-range-BX-vg6YCa_A)

## Continue with Google

In [Google Cloud Console](https://console.cloud.google.com/auth/clients),
configure the consent screen and create a **Web application** OAuth client.
Set its authorized redirect URI to:

    http://127.0.0.1:8000/auth/google/callback

For a different server port, register the corresponding URI with that port.
If the consent screen is in testing mode, add your Google account as a test
user when required by your Google Auth Platform configuration.

Start the server with your client credentials in the environment. In macOS
Terminal's default zsh shell, these prompts avoid putting the secret in shell
history:

```zsh
cd "$HOME/Desktop/Budget Traveller"
read 'GOOGLE_CLIENT_ID?Google OAuth client ID: '
read -s 'GOOGLE_CLIENT_SECRET?Google OAuth client secret: '
export GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
python3 server.py
```

Open http://127.0.0.1:8000 and choose **Continue with Google** from signup or
login. The app uses basic Google identity information (name, verified email,
and account identifier). Gmail inbox access is outside the requested scopes.
An existing password account with the same email continues to use password
login. Google accounts created here can return using the same Google account.

## Trip dates and flight search

Choose a departure date and trip length. Day 1 is the departure day, so
a five-day trip returns four calendar days after departure. The plan splits
your total budget across flights, accommodation, public transport, food,
and a reserve.

Select the **Flights** card to compare round trips. The Google Flights link
passes your departure city, destination country, dates, and party size as
search text. Confirm the resulting route and dates on Google Flights.

For fares inside the app, set `DUFFEL_ACCESS_TOKEN` in the server environment
and restart. Use a live Duffel token for live inventory. Enter the two IATA
airport or city codes to search. Offers are ranked by total fare in each
currency, with fewer segments breaking price ties. The flight budget badge
compares fares in the budget currency. The main traveler's age is sent to
Duffel. Additional family travelers are treated as adults in this version.

Select a destination country, enter the destination city, and enter your
departure city. City-states such as Singapore can be filled automatically
where configured. Build my trip opens the results and starts the fare
search. With Skyscanner configured, city names that do not already map to
an airport code are resolved through Skyscanner Autosuggest. You can enter
a three-letter IATA code for either city to make the route unambiguous.
The results also include links to compare fares on external sites.

### Skyscanner Flights Live Prices

An approved Flights Live Prices API key enables Skyscanner as the in-app
fare provider. The server uses the India market and displays INR economy
round-trip offers sorted by the total price for the group. Seller names
and single-seller booking links come from Skyscanner. MakeMyTrip and
Goibibo appear when Skyscanner returns their offers for the search.

Set the key before running the server. In macOS Terminal's default zsh:

```zsh
read -s 'SKYSCANNER_API_KEY?Skyscanner API key: '
export SKYSCANNER_API_KEY
python3 server.py
```

Restart any existing preview and keep your existing Google OAuth variables
in the server environment. The key stays server-side. If both fare providers
are configured, Skyscanner takes priority. With only a Duffel token, Duffel
continues to serve fares. Skyscanner allows 1–8 adults per search. If the
main traveler is under 18, their age is included as a child. Additional
family travelers are treated as adults in this version.

[Skyscanner Flights Live Prices documentation](https://developers.skyscanner.net/docs/flights-live-prices/quick-start)
