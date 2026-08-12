# Focus Hourglass

Build a minimal productivity timer web app called Hourglass.

The centerpiece of the page is a visual hourglass animation that runs in real time as the timer counts down. The sand flows from top to bottom as time passes. When the timer hits zero, the hourglass is empty and a subtle completion animation plays.

Before starting the timer, the user must type what they are working on in a single input field (one word or short sentence, max 60 characters). This is mandatory — the timer cannot start without it. 

The user sets a custom duration (default 90 minutes) using a simple +/- control or manual input in minutes.

Below the hourglass, there are three controls: Start, Pause, and Complete. Start begins the timer and locks the task label. Pause freezes the hourglass mid-flow. Complete ends the session early and triggers the completion state. Is the time up? Ask done? If yes, complete; if no, let the user add extra time till the one thing is done. 

The design is minimal, with a dark background and a white color palette for the hourglass. No clutter. small sidebar. No navigation. Just the hourglass, the task, and the timer. Think Notion meets a luxury watch interface.

There is a calendar function where you see what you have done every day of the month, and you see the minutes you were actually focused, you can click in and see what you said you did.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://focushourglass.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c58e05b9-28c8-4b4a-9943-bced0d439556).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
