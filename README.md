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
