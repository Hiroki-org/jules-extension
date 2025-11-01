# Extension Jules pour VSCode

![Jules Extension Icon](../jules-extension/icon.png)

[![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER.jules-extension)
[![Status](https://img.shields.io/badge/status-development-yellow.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> "Découvrez l'avenir du codage avec Google Jules dans VSCode"

L'extension Jules est une extension qui vous permet de piloter l'agent de codage IA de Google, **Jules**, directement depuis VSCode.
Accueillez un partenaire intelligent dans votre flux de travail de codage.

## ✨ Concept

Cette extension a été créée pour faire passer votre expérience de développement au niveau supérieur.

- **Intégration Transparente :** Accédez aux fonctionnalités puissantes de Jules sans quitter votre environnement VSCode familier.
- **Collaboration en Temps Réel :** Tout, de la création de sessions de codage à la vérification de la progression, en temps réel.
- **Augmentation de la Productivité :** Laissez Jules gérer les tâches fastidieuses pendant que vous vous concentrez sur le travail créatif.

## 🚀 Fonctionnalités Clés

| Fonctionnalité                        | Description                                                                                                                                                                                                                                                                                         | Commande / Icône                                   |
| :------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------- |
| **Définir la Clé API**                | Lors de la première utilisation, définissez votre clé API pour vous connecter à votre compte Jules. La clé est stockée en toute sécurité dans le SecretStorage de VSCode et utilisée automatiquement pour toutes les requêtes ultérieures.                                                          | `jules-extension.setApiKey`                        |
| **Définir le Token GitHub**           | Définissez votre Token d'Accès Personnel GitHub pour activer la vérification du statut des PR. Le token est stocké en toute sécurité et utilisé pour détecter automatiquement quand les pull requests sont fermées ou fusionnées, aidant à garder votre liste de sessions propre.                   | `jules-extension.setGithubToken`                   |
| **Gestion des Sessions**              | Utilisez la commande `> Jules: Create Session` pour assigner une nouvelle tâche de codage à Jules. Les sessions passées sont également listées, vous permettant de reprendre le travail ou de consulter l'historique des tâches terminées à tout moment.                                            | `jules-extension.createSession`                    |
| **Surveillance en Temps Réel**        | Obtenez un aperçu de l'état de travail actuel de Jules (`Running`, `Active`, `Done`, etc.) dans une vue de la barre latérale dédiée. Plus besoin de basculer entre votre navigateur et votre éditeur.                                                                                               | `julesSessionsView`                                |
| **Mise à Jour de la Progression**     | Curieux de savoir où en est Jules ? Cliquez sur le bouton `↻` (actualiser) pour récupérer et afficher instantanément le dernier état de la session et la liste des activités.                                                                                                                       | `jules-extension.refreshSessions`                  |
| **Affichage de l'Activité**           | Sélectionnez une session pour afficher les journaux détaillés des commandes que Jules a exécutées, les fichiers qu'il a modifiés et son processus de pensée. Cela offre une expérience de développement transparente, comme si vous regardiez dans l'esprit de Jules.                               | `jules-extension.showActivities`                   |
| **Filtrage Intelligent des Sessions** | Masque automatiquement les sessions terminées (celles avec des PR fermés/fusionnés ou des états échoués/annulés) de la liste des sessions. Empêche les vérifications de statut inutiles et maintient votre espace de travail concentré sur le travail actif. Peut être basculé dans les paramètres. | `jules-extension.hideClosedPRSessions` (paramètre) |

## 📦 Installation

Installez depuis [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension).

Ou recherchez "Jules Extension" dans la vue Extensions de VS Code.

### Depuis le Marketplace (Recommandé)

1.  Recherchez "Jules Extension" sur le Marketplace de VSCode
2.  Cliquez sur le bouton `Install`

## 🔑 Obtention d'une Clé API

Pour utiliser l'extension Jules, vous avez besoin d'une clé API Jules. Suivez ces étapes pour en obtenir une :

1.  **Créez un Compte :**

    - Visitez le [Site Officiel de Jules](https://jules.google/docs).
    - Enregistrez un nouveau compte ou connectez-vous avec un compte existant.

2.  **Générez une Clé API :**

    - Dans votre tableau de bord de compte, accédez à la section "Clés API" ou "Paramètres du Développeur".
    - Cliquez sur "Créer une Nouvelle Clé Secrète".
    - Donnez à la clé un nom facile à comprendre (par ex., "Extension VSCode") et générez-la.

3.  **Copiez la Clé :**
    - Votre nouvelle clé API sera affichée. Copiez-la dans votre presse-papiers.
    - Si vous avez besoin de vérifier la clé à nouveau plus tard, vous pouvez toujours la consulter sur la page de paramètres de Jules.

> **Important :** Traitez votre clé API comme un mot de passe. Ne la partagez pas publiquement et ne la commitez pas dans le contrôle de version.

## Démarrage Rapide

1.  Ouvrez la Palette de Commandes avec `Ctrl + Shift + P` (ou `Cmd + Shift + P`).
2.  Exécutez `> Jules: Set Jules API Key` pour configurer votre clé API.
3.  (Optionnel) Exécutez `> Jules: Set GitHub Token` pour activer la vérification du statut des PR et le filtrage automatique des sessions.
4.  Cliquez sur l'icône `$(robot)` dans la barre latérale pour ouvrir la Vue des Sessions Jules.
5.  Exécutez `> Jules: Create Jules Session` pour démarrer votre première session de codage !

## 📚 Références

- [Site Officiel de Jules](https://jules.google/docs)
- [Documentation de l'API Jules](https://developers.google.com/jules/api)

## 🤝 Contribution

Ce projet ne fait que commencer. Nous accueillons toutes les formes de contribution, y compris les rapports de bogues, les suggestions de fonctionnalités et les pull requests !
Veuillez consulter le Suivi des Problèmes et les Pull Requests.

## � Liens

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
- [Dépôt GitHub](https://github.com/is0692vs/jules-extension.git)
- [Signaler des Problèmes](https://github.com/is0692vs/jules-extension/issues)

## 📝 Licence

[MIT](../../LICENSE)
