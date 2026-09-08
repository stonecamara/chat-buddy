# Chat Buddy

Application de messagerie texte avec des inconnus au hasard. Aucun compte requis — juste un pseudo.

## Fonctionnalités

- Chat 1-à-1 anonyme : en attente d'un match depuis la file d'attente.
- Sessions de chat avec fin de session (par un des deux participants).
- Temps réel via Supabase Realtime (messages + événements de session).

## Stack technique

- **React 19** + **TanStack Start** (SSR)
- **TanStack Router** + **TanStack Query**
- **Tailwind CSS 4**
- **Supabase** (auth, base de données, realtime)

## Prérequis

- [Bun](https://bun.sh/) (v1.1+)

## Installation

1. Clonez le dépôt :

```bash
git clone https://github.com/stonecamara/chat-buddy.git
cd chat-buddy
```

2. Installez les dépendances :

```bash
bun install
```

3. Configurez votre projet Supabase :

   - Créez un projet sur [Supabase](https://supabase.com/).
   - Copiez le fichier `.env.example` en `.env` et renseignez vos clés :

```bash
cp .env.example .env
```

4. Appliquez le schéma de base de données en exécutant le contenu de `supabase/` dans l'éditeur SQL de Supabase.

## Lancement

```bash
bun run dev
```

Le site sera disponible sur `http://localhost:3000`.

## Scripts disponibles

| Script | Description |
| --- | --- |
| `bun run dev` | Serveur de développement |
| `bun run build` | Build de production |
| `bun run preview` | Prévisualiser le build |
| `bun run lint` | ESLint + Prettier |

## Licence

Ce projet est open source. Utilisez-le, modifiez-le, repartagez-le.