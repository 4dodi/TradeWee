# Security Policy

🇫🇷 [Version française plus bas](#politique-de-sécurité)

## Supported versions

Only the latest version on the `main` branch receives security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report it privately through GitHub: go to the **Security** tab of this repository and click **Report a vulnerability** ([direct link](https://github.com/4dodi/TradeWee/security/advisories/new)).

Please include:
- a description of the problem and its impact,
- steps to reproduce (or a proof of concept),
- the version / commit you tested.

You should get a first reply within 7 days. Once the issue is confirmed, a fix is prepared and you will be credited in the advisory if you wish.

## Scope and security notes

Tradewee is designed to run **locally** (it listens on `127.0.0.1` by default). If you expose it on a network, set `APP_PASSWORD` and serve it over HTTPS — see the README.

Your AI provider API key is stored in `data/config.json`, which is excluded from Git. Never commit the `data/` folder. If a key is ever exposed, revoke it at your provider and create a new one.

---

# Politique de sécurité

## Signaler une vulnérabilité

**N'ouvrez pas d'issue publique pour un problème de sécurité.**

Signalez-le en privé via GitHub : onglet **Security** du dépôt, puis **Report a vulnerability** ([lien direct](https://github.com/4dodi/TradeWee/security/advisories/new)). Indiquez la description du problème, les étapes pour le reproduire et la version testée. Première réponse sous 7 jours.

Tradewee est conçu pour tourner **en local**. Si vous l'exposez sur un réseau, définissez `APP_PASSWORD` et servez-le en HTTPS. Votre clé API est stockée dans `data/config.json`, exclu de Git : ne publiez jamais le dossier `data/`.
