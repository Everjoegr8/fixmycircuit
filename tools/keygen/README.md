# FixMyCircuit key generator (ERA Technologiz only)

These tools make licence keys. They are not part of the app and are not packaged with it.
Your **private signing key** (`PRIVATE-signing-key.txt`) must stay on your own computer: never email it, never put it in this repository.
Anyone with it can make keys. The app only contains the matching public key.

## When a customer messages you on WhatsApp

They send their **machine ID** (like `ABCD-1234-EF56-7890`) from the activation screen or Settings, Licence.

### Option A: the offline web page (`keygen.html`)
1. Open `keygen.html` in Chrome or Edge (double-click it; it works offline).
2. Paste your private key (tick *Remember on this PC* only on your own laptop).
3. Paste the machine ID, type the shop name, pick 30 / 90 / 180 / 365 days or type a number of days.
4. Press **Generate key**, then **Open WhatsApp** (or **Copy WhatsApp message**) and send it.
5. Every key is kept in the issued-keys log on that page; export it as CSV.

### Option B: the command line (`keygen.mjs`, needs Node.js 18+)
```
node keygen.mjs --key PRIVATE-signing-key.txt --machine ABCD-1234-EF56-7890 --days 30 --name "Tunde Phones"
node keygen.mjs --key PRIVATE-signing-key.txt --machine ABCD-1234-EF56-7890 --until 2027-12-31
node keygen.mjs --key PRIVATE-signing-key.txt --check FMC1-...
```
It prints the key and a ready WhatsApp message, and appends it to `issued-keys.csv`.

## How keys behave in the app
- A key works only on the PC whose machine ID it was made for.
- It is valid to the end of the expiry day. In the last 7 days the app shows a renewal banner; after expiry it keeps working for 3 more days, then locks until a new key is entered. The customer's files and data are never deleted.
- New PCs get a 7-day free trial.
- To renew, make a new key for the same machine ID with a later date.

## If the private key is ever leaked
Run `node keygen.mjs --new-keypair`, put the printed public key in `PUBLIC_KEY` in `src/main/license.ts`, release a new version, and issue new keys to paying customers. Keys made with the old private key stop working in the new version.
