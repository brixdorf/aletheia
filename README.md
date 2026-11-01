# Aletheia

Audits a site's checkout and subscription flows for the 13 dark patterns banned by India's CCPA, and shows the proof.

Live at [aletheia.romitraj.dev](https://aletheia.romitraj.dev).

## Setup

You need [Vite+](https://viteplus.dev) and Node 26.

```
git clone https://github.com/brixdorf/aletheia.git
cd aletheia
vp install
vp run dev
```

To use the TinyFish agent, copy `.env.example` to `.env` and add your key.

`vp test` runs the unit tests. `vp run e2e` runs the full flow in a browser on saved runs, so it needs no key.

`vp run wipe` deletes every saved audit, screenshot and sign-in in `DATA_DIR`. Stop the server first.

## Team

Romit Raj Sahu and Abhijit P, Scaler School of Technology, Bangalore.

## License

The code is source available under the [PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use needs written permission from the authors.
